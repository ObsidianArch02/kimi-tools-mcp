#!/usr/bin/env node
// kimi-tools-mcp — CLI entry point.
//
// Commands:
//   (no args)        run the MCP stdio server (this is what agents spawn)
//   serve            same as above
//   login            sign in with your own Kimi account (device code flow)
//   logout           delete the locally stored sign-in
//   status           show whether you are signed in (never prints tokens)
//
// Environment:
//   KIMI_TOOLS_HOME        credential directory (default ~/.config/kimi-tools)
//   KIMI_TOOLS_REGION      cn | global (default cn; `login --region` wins)
//   KIMI_TOOLS_OAUTH_HOST  override the OAuth host (advanced)
//   KIMI_TOOLS_BASE_URL    override the API base URL (advanced)

import { execFile } from "node:child_process";

import {
  DEFAULT_REGION,
  PRODUCT_TOKEN,
  REGIONS,
  VERSION,
} from "../src/constants.mjs";
import {
  NotSignedInError,
  TokenStore,
  clearCredentials,
  kimiToolsHome,
  loadCredentials,
  regionOf,
  saveCredentials,
} from "../src/credentials.mjs";
import { buildDeviceHeaders } from "../src/identity.mjs";
import { pollDeviceToken, requestDeviceAuthorization } from "../src/oauth.mjs";
import { createServer, isLoginInvocation } from "../src/server.mjs";

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "rundll32" : "xdg-open";
  const args = platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  try {
    const child = execFile(command, args, () => {});
    child.unref?.();
  } catch {
    // Best effort only; the URL is always printed for manual opening.
  }
}

async function login(argv) {
  const regionFlag = argv[argv.indexOf("--region") + 1];
  const hasRegionFlag = argv.includes("--region") && REGIONS[regionFlag?.toLowerCase()];
  const region = hasRegionFlag
    ? regionFlag.toLowerCase()
    : (REGIONS[process.env.KIMI_TOOLS_REGION?.toLowerCase()] ? process.env.KIMI_TOOLS_REGION.toLowerCase() : DEFAULT_REGION);
  const { oauthHost, baseUrl } = REGIONS[region];

  const homeDir = kimiToolsHome();
  const headers = buildDeviceHeaders(homeDir);

  process.stderr.write(`Requesting a device code from ${oauthHost} (region: ${region})...\n`);
  const device = await requestDeviceAuthorization(oauthHost, headers);

  process.stderr.write(`\nTo sign in with your Kimi account, open:\n\n  ${device.verificationUriComplete}\n\n`);
  process.stderr.write(`and confirm the code ${device.userCode}. Waiting for approval (up to 15 minutes)...\n\n`);
  openBrowser(device.verificationUriComplete);

  const token = await pollDeviceToken(oauthHost, device.deviceCode, {
    interval: device.interval,
    headers,
    deadlineAt: Date.now() + Math.min(device.expiresIn ?? 900, 900) * 1000,
  });

  saveCredentials(homeDir, {
    version: 1,
    region,
    oauth_host: oauthHost,
    base_url: baseUrl,
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expires_at: token.expiresAt,
    obtained_at: new Date().toISOString(),
    client: PRODUCT_TOKEN,
    client_version: VERSION,
  });

  process.stderr.write(`Signed in. Credentials stored in ${homeDir}/credentials.json (mode 0600).\n`);
}

async function status() {
  const homeDir = kimiToolsHome();
  const credentials = loadCredentials(homeDir);
  if (credentials === null) {
    process.stderr.write(`Not signed in. Run \`npx ${PRODUCT_TOKEN} login\`.\n`);
    process.exitCode = 1;
    return;
  }
  const region = regionOf(credentials);
  const expiresAt = new Date(Number(credentials.expires_at ?? 0) * 1000).toISOString();
  const store = new TokenStore(homeDir);
  try {
    await store.getAccessToken();
    process.stderr.write(`Signed in (region: ${region}). Access token valid until ~${expiresAt} (auto-refreshes).\n`);
  } catch (error) {
    if (error instanceof NotSignedInError) {
      process.stderr.write(`Not signed in. Run \`npx ${PRODUCT_TOKEN} login\`.\n`);
    } else {
      process.stderr.write(`Sign-in stored but not usable: ${error.message}\n`);
    }
    process.exitCode = 1;
  }
}

function logout() {
  clearCredentials(kimiToolsHome());
  process.stderr.write("Signed out. Local credentials removed.\n");
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case undefined:
    case "serve": {
      // MCP hosts that drive OAuth interactively spawn us with `login`
      // arguments; honor that instead of starting the stdio server.
      if (process.argv.length > 2 && isLoginInvocation(process.argv.slice(2))) {
        await login(process.argv.slice(2).filter((a) => a !== "login"));
        break;
      }
      const server = createServer();
      server.start();
      break;
    }
    case "login":
      await login(rest);
      break;
    case "logout":
      logout();
      break;
    case "status":
      await status();
      break;
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      break;
    default:
      process.stderr.write(
        "Usage: kimi-tools-mcp [serve] | login [--region cn|global] | logout | status | --version\n",
      );
      process.exitCode = command === "--help" || command === "-h" ? 0 : 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
