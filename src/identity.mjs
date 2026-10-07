// Device identity headers.
//
// Kimi tags every request with X-Msh-* headers describing the client and
// the device. The official clients send hostname, an OS model string, the
// OS release and a persistent device UUID. We do the same, with our own
// truthful platform token (see constants.mjs).

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, hostname, release, type as osType } from "node:os";
import { join } from "node:path";

import { PLATFORM_TOKEN, VERSION } from "./constants.mjs";

// Header values must be printable ASCII; mirrors the official client's
// asciiHeader() sanitizer.
export function ascii(value) {
  return String(value ?? "").replace(/[^\x20-\x7e]/g, "").trim();
}

function macOsProductVersion() {
  try {
    const plist = readFileSync("/System/Library/CoreServices/SystemVersion.plist", "utf8");
    return /<key>ProductVersion<\/key>\s*<string>([^<]*)<\/string>/.exec(plist)?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function deviceModel() {
  const os = osType();
  const version = release();
  const machine = arch();
  if (os === "Darwin") return `macOS ${macOsProductVersion() ?? version} ${machine}`;
  if (os === "Windows_NT") return `Windows ${version} ${machine}`;
  return `${os} ${version} ${machine}`.trim();
}

function deviceName() {
  try {
    return ascii(hostname()) || "unknown";
  } catch {
    return "unknown";
  }
}

// A stable per-install device id. Without it every sign-in would register
// a new "unknown device" on the user's Kimi account page.
export function deviceId(homeDir) {
  const file = join(homeDir, "device_id");
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (existing.length > 0) return existing;
  } catch {}
  const id = randomUUID();
  try {
    mkdirSync(homeDir, { recursive: true, mode: 0o700 });
    writeFileSync(file, `${id}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {}
  return id;
}

export function buildDeviceHeaders(homeDir, overrides = {}) {
  return {
    "X-Msh-Platform": ascii(overrides.platform ?? PLATFORM_TOKEN),
    "X-Msh-Version": ascii(overrides.version ?? VERSION),
    "X-Msh-Device-Name": ascii(overrides.deviceName ?? deviceName()),
    "X-Msh-Device-Model": ascii(overrides.deviceModel ?? deviceModel()),
    "X-Msh-Os-Version": ascii(overrides.osVersion ?? release()),
    "X-Msh-Device-Id": ascii(overrides.deviceId ?? deviceId(homeDir)),
  };
}
