// Credential storage.
//
// Where tokens live and how they are protected:
//
// - Directory: $KIMI_TOOLS_HOME, or $XDG_CONFIG_HOME/kimi-tools, or
//   ~/.config/kimi-tools — created with mode 0700 (owner only).
// - File: credentials.json inside it, written with mode 0600 (owner
//   read/write only), replaced atomically (tmp file + rename) so a crash
//   can never leave a half-written token behind.
// - Contents: OAuth access + refresh tokens for the user's own Kimi
//   account. Nothing else is collected or stored. No telemetry leaves
//   this process except requests to Kimi's own endpoints.
// - Isolation: tokens are never written to project directories, never
//   logged, and never included in tool outputs. Error messages quote
//   server responses but never the Authorization header.
//
// Deleting the directory (or `kimi-tools-mcp logout`) removes every trace
// of the sign-in from the machine.

import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { DEFAULT_REGION, REFRESH_SKEW_MS, REGIONS } from "./constants.mjs";
import { buildDeviceHeaders } from "./identity.mjs";
import { OAuthUnauthorizedError, refreshAccessToken } from "./oauth.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Inter-process lock: several agents (Codex, pi, magpie, ...) can spawn
// their own copy of this server against the same credential file, and Kimi
// rotates the refresh token on every use — two concurrent refreshes would
// invalidate each other. A best-effort exclusive-create lock file plus a
// "someone else already refreshed" re-read keeps the rotation single.
function lockPath(homeDir) {
  return join(homeDir, "credentials.lock");
}

function tryAcquireLock(homeDir) {
  try {
    mkdirSync(homeDir, { recursive: true, mode: 0o700 });
    writeFileSync(lockPath(homeDir), `${process.pid}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

function releaseLock(homeDir) {
  try {
    rmSync(lockPath(homeDir), { force: true });
  } catch {}
}

async function withRefreshLock(homeDir, fn) {
  const deadline = Date.now() + 30_000;
  while (!tryAcquireLock(homeDir)) {
    if (Date.now() >= deadline) {
      // Proceed unlocked rather than fail the user's request; the worst
      // case is a redundant refresh, which Kimi tolerates.
      break;
    }
    await sleep(150);
  }
  try {
    return await fn();
  } finally {
    releaseLock(homeDir);
  }
}

export function kimiToolsHome(env = process.env) {
  const explicit = env.KIMI_TOOLS_HOME?.trim();
  if (explicit) return explicit;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  return join(xdg || join(homedir(), ".config"), "kimi-tools");
}

function credentialsPath(homeDir) {
  return join(homeDir, "credentials.json");
}

export function loadCredentials(homeDir) {
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath(homeDir), "utf8"));
    if (parsed && typeof parsed === "object" && typeof parsed.refresh_token === "string") {
      return parsed;
    }
  } catch {}
  return null;
}

export function saveCredentials(homeDir, credentials) {
  mkdirSync(homeDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(homeDir, 0o700);
  } catch {}
  const path = credentialsPath(homeDir);
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {}
}

export function clearCredentials(homeDir) {
  try {
    writeFileSync(credentialsPath(homeDir), "{}\n", { encoding: "utf8", mode: 0o600 });
  } catch {}
}

export function regionOf(credentials, env = process.env) {
  const override = env.KIMI_TOOLS_REGION?.trim().toLowerCase();
  if (override && REGIONS[override]) return override;
  const saved = credentials?.region;
  return typeof saved === "string" && REGIONS[saved] ? saved : DEFAULT_REGION;
}

function endpointsFor(credentials, env) {
  const region = REGIONS[regionOf(credentials, env)];
  return {
    oauthHost: (env.KIMI_TOOLS_OAUTH_HOST ?? credentials?.oauth_host ?? region.oauthHost).replace(/\/+$/, ""),
    baseUrl: (env.KIMI_TOOLS_BASE_URL ?? credentials?.base_url ?? region.baseUrl).replace(/\/+$/, ""),
  };
}

export class NotSignedInError extends Error {
  constructor() {
    super(
      "Not signed in. Run `npx kimi-tools-mcp login` (or your agent's MCP login command, e.g. `pi mcp login kimi-tools`) first.",
    );
    this.name = "NotSignedInError";
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super(
      "Your Kimi sign-in has expired or was revoked. Run `npx kimi-tools-mcp login` again.",
    );
    this.name = "SessionExpiredError";
  }
}

// Returns a valid access token, refreshing it first when it is inside the
// expiry skew window. Refreshes are persisted atomically. Concurrent
// refresh attempts within one process are de-duplicated onto one promise.
export class TokenStore {
  constructor(homeDir = kimiToolsHome()) {
    this.homeDir = homeDir;
    this.refreshing = null;
  }

  load() {
    return loadCredentials(this.homeDir);
  }

  async getAccessToken({ forceRefresh = false } = {}) {
    const credentials = this.load();
    if (credentials === null) throw new NotSignedInError();
    const expiresAtMs = Number(credentials.expires_at ?? 0) * 1000;
    const stale = forceRefresh || expiresAtMs === 0 || Date.now() >= expiresAtMs - REFRESH_SKEW_MS;
    if (!stale && typeof credentials.access_token === "string" && credentials.access_token.length > 0) {
      return credentials.access_token;
    }
    this.refreshing ??= this.refresh(credentials).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async refresh(credentials) {
    return withRefreshLock(this.homeDir, async () => {
      // Another process may have just completed a refresh while we waited
      // for the lock; prefer its result over re-using a rotated token.
      const latest = this.load() ?? credentials;
      const latestExpiresMs = Number(latest.expires_at ?? 0) * 1000;
      if (
        latest.refresh_token !== credentials.refresh_token
        && Date.now() < latestExpiresMs - REFRESH_SKEW_MS
        && typeof latest.access_token === "string"
        && latest.access_token.length > 0
      ) {
        return latest.access_token;
      }
      const { oauthHost } = endpointsFor(latest, process.env);
      const headers = buildDeviceHeaders(this.homeDir);
      try {
        const token = await refreshAccessToken(oauthHost, latest.refresh_token, headers);
        const next = {
          ...latest,
          access_token: token.accessToken,
          refresh_token: token.refreshToken,
          expires_at: token.expiresAt,
        };
        saveCredentials(this.homeDir, next);
        return next.access_token;
      } catch (error) {
        if (error instanceof OAuthUnauthorizedError) throw new SessionExpiredError();
        throw error;
      }
    });
  }

  deviceHeaders() {
    return buildDeviceHeaders(this.homeDir);
  }

  endpoints() {
    return endpointsFor(this.load(), process.env);
  }
}
