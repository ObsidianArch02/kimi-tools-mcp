// Optional OS-keychain credential backend.
//
// Selected with KIMI_TOOLS_STORE=keychain (the file backend remains the
// default). Uses the platform's own command-line keychain tool — no native
// modules, no dependencies:
//
//   macOS:  security add-generic-password / find-generic-password -w
//   Linux:  secret-tool (libsecret, e.g. gnome-keyring)
//
// The refresh token is the long-lived secret, so that is what goes into
// the keychain; the short-lived access token and non-secret metadata
// (region, endpoints, expiry) stay in credentials.json exactly like the
// file backend. If the keychain tool is missing or locked, every operation
// throws KeychainUnavailableError with instructions to either unlock the
// keychain or switch back to the file backend — never a silent fallback
// that would write the secret somewhere the user did not ask for.

import { execFileSync } from "node:child_process";

const SERVICE = "kimi-tools-mcp";
const ACCOUNT = "refresh-token";

export class KeychainUnavailableError extends Error {
  constructor(detail) {
    super(
      `KIMI_TOOLS_STORE=keychain was requested but the OS keychain is not usable: ${detail}. `
      + "Unlock your keychain, install the platform keychain tool (macOS: built-in `security`; "
      + "Linux: `secret-tool` from libsecret), or unset KIMI_TOOLS_STORE to use the file backend.",
    );
    this.name = "KeychainUnavailableError";
  }
}

function run(command, args, { input } = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10_000,
    });
  } catch (error) {
    const stderr = error?.stderr?.toString?.() ?? "";
    const stdout = error?.stdout?.toString?.() ?? "";
    const err = new Error(`${command} exited ${error?.status ?? "?"}: ${(stderr || stdout || error.message).trim()}`);
    err.status = typeof error?.status === "number" ? error.status : undefined;
    throw err;
  }
}

function detectTool() {
  if (process.platform === "darwin") return "security";
  if (process.platform === "linux") return "secret-tool";
  throw new KeychainUnavailableError(`no keychain CLI is supported on ${process.platform}`);
}

export function keychainAvailable() {
  try {
    const tool = detectTool();
    if (tool === "security") run("security", ["list-keychains"]);
    else run("secret-tool", ["search", SERVICE, ACCOUNT]);
    return true;
  } catch {
    return false;
  }
}

export function keychainRead() {
  const tool = detectTool();
  try {
    if (tool === "security") {
      const out = run("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]);
      const value = out.trim();
      return value.length > 0 ? value : null;
    }
    const out = run("secret-tool", ["lookup", "service", SERVICE, "account", ACCOUNT]);
    const value = out.trim();
    return value.length > 0 ? value : null;
  } catch (error) {
    // security: exit 44 = item not found; secret-tool: exit 1 = not found.
    if (tool === "security" && error.status === 44) return null;
    if (tool === "secret-tool" && error.status === 1) return null;
    throw new KeychainUnavailableError(error.message);
  }
}

export function keychainWrite(secret) {
  const tool = detectTool();
  try {
    if (tool === "security") {
      // -U updates an existing item; the password arrives on stdin so it
      // never appears in the process list.
      run("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", secret]);
      return;
    }
    run("secret-tool", ["store", "--label", "kimi-tools-mcp refresh token", "service", SERVICE, "account", ACCOUNT], { input: secret });
  } catch (error) {
    throw new KeychainUnavailableError(error.message);
  }
}

export function keychainClear() {
  const tool = detectTool();
  try {
    if (tool === "security") {
      run("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT], { input: "" });
      return;
    }
    run("secret-tool", ["clear", "service", SERVICE, "account", ACCOUNT]);
  } catch {
    // Clearing is best-effort: a missing item is already clear.
  }
}
