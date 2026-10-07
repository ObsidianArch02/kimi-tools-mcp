// Unit tests: protocol surface, credential storage, and tool-call dispatch
// against a mocked API layer (no network, no real credentials).

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createServer } from "../src/server.mjs";
import {
  NotSignedInError,
  TokenStore,
  loadCredentials,
  saveCredentials,
  storeBackend,
} from "../src/credentials.mjs";
import { ascii, buildDeviceHeaders, deviceId, deviceModel } from "../src/identity.mjs";
import { keychainAvailable, keychainClear, keychainRead } from "../src/store.mjs";

function makeTokenStore() {
  return {
    async getAccessToken() {
      return "test-access-token";
    },
    deviceHeaders() {
      return { "X-Msh-Platform": "kimi-tools-mcp-test" };
    },
    endpoints() {
      return { oauthHost: "https://auth.example", baseUrl: "https://api.example/v1" };
    },
  };
}

const apiImpl = {
  async callToolsGateway(_store, method, params) {
    return { echoed: { method, params } };
  },
  async webSearch(_store, query) {
    return [
      { title: "Result One", url: "https://example.com/1", snippet: "first", siteName: "Example", date: "2026-01-01" },
      { title: "Result Two", url: "https://example.com/2", snippet: "second" },
    ];
  },
  async fetchUrl(_store, url) {
    return `# Fetched ${url}`;
  },
};

test("initialize advertises the tool capability and server info", async () => {
  const server = createServer({ tokenStore: makeTokenStore(), apiImpl });
  const result = await server.handleRequest({ method: "initialize", id: 1 });
  assert.equal(result.serverInfo.name, "kimi-tools-mcp");
  assert.ok(result.capabilities.tools);
  assert.ok(result.protocolVersion);
});

test("tools/list exposes the four tools with required schemas", async () => {
  const server = createServer({ tokenStore: makeTokenStore(), apiImpl });
  const { tools } = await server.handleRequest({ method: "tools/list", id: 2 });
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["call_data_source_tool", "fetch_url", "get_data_source_desc", "web_search"]);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.description.length > 20);
  }
  const desc = tools.find((t) => t.name === "get_data_source_desc");
  assert.deepEqual(desc.inputSchema.required, ["name"]);
});

test("web_search renders a readable result list", async () => {
  const server = createServer({ tokenStore: makeTokenStore(), apiImpl });
  const result = await server.handleRequest({
    method: "tools/call",
    id: 3,
    params: { name: "web_search", arguments: { query: "test" } },
  });
  const text = result.content[0].text;
  assert.match(text, /1\. Result One/);
  assert.match(text, /https:\/\/example\.com\/2/);
  assert.ok(!result.isError);
});

test("data source entry points forward method and params verbatim", async () => {
  const server = createServer({ tokenStore: makeTokenStore(), apiImpl });
  const desc = await server.handleRequest({
    method: "tools/call",
    id: 4,
    params: { name: "get_data_source_desc", arguments: { name: "wind" } },
  });
  assert.match(desc.content[0].text, /get_data_source_desc/);
  const call = await server.handleRequest({
    method: "tools/call",
    id: 5,
    params: {
      name: "call_data_source_tool",
      arguments: { data_source_name: "wind", api_name: "quote", params: { symbol: "600519" } },
    },
  });
  assert.match(call.content[0].text, /600519/);
});

test("missing arguments become isError tool results, not crashes", async () => {
  const server = createServer({ tokenStore: makeTokenStore(), apiImpl });
  const result = await server.handleRequest({
    method: "tools/call",
    id: 6,
    params: { name: "web_search", arguments: {} },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /query/);
});

test("auth failures surface as actionable isError text", async () => {
  const failingStore = {
    ...makeTokenStore(),
    async getAccessToken() {
      throw new NotSignedInError();
    },
  };
  const failingApi = {
    ...apiImpl,
    async webSearch(store, query) {
      await store.getAccessToken();
      return [];
    },
  };
  const server = createServer({ tokenStore: failingStore, apiImpl: failingApi });
  const result = await server.handleRequest({
    method: "tools/call",
    id: 7,
    params: { name: "web_search", arguments: { query: "x" } },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /login/);
});

test("credentials persist with owner-only permissions and reload intact", () => {
  const dir = mkdtempSync(join(tmpdir(), "kimi-tools-test-"));
  try {
    saveCredentials(dir, {
      version: 1,
      region: "cn",
      access_token: "a",
      refresh_token: "r",
      expires_at: 1_900_000_000,
    });
    const mode = statSync(join(dir, "credentials.json")).mode & 0o777;
    assert.equal(mode, 0o600);
    const loaded = loadCredentials(dir);
    assert.equal(loaded.refresh_token, "r");
    assert.equal(loaded.region, "cn");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("device id is a stable UUID per home directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "kimi-tools-test-"));
  try {
    const first = deviceId(dir);
    const second = deviceId(dir);
    assert.equal(first, second);
    assert.match(first, /^[0-9a-f-]{36}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("device headers are truthful, ASCII-only and complete", () => {
  const dir = mkdtempSync(join(tmpdir(), "kimi-tools-test-"));
  try {
    const headers = buildDeviceHeaders(dir);
    assert.equal(headers["X-Msh-Platform"], "kimi-tools-mcp");
    for (const value of Object.values(headers)) {
      assert.ok(value.length > 0);
      assert.equal(ascii(value), value);
    }
    assert.match(headers["X-Msh-Device-Model"], /macOS|Windows|Linux/);
    assert.equal(deviceModel(), headers["X-Msh-Device-Model"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("json-rpc framing: parse error and unknown method are well-formed", async () => {
  const server = createServer({ tokenStore: makeTokenStore(), apiImpl });
  await assert.rejects(
    server.handleRequest({ method: "no/such", id: 9 }),
    (error) => error.code === -32601,
  );
});

test("store backend defaults to file and opts into keychain explicitly", () => {
  assert.equal(storeBackend({}), "file");
  assert.equal(storeBackend({ KIMI_TOOLS_STORE: "file" }), "file");
  assert.equal(storeBackend({ KIMI_TOOLS_STORE: "keychain" }), "keychain");
  assert.equal(storeBackend({ KIMI_TOOLS_STORE: "KEYCHAIN" }), "keychain");
  assert.equal(storeBackend({ KIMI_TOOLS_STORE: "bogus" }), "file");
});

test("keychain backend keeps the refresh token out of credentials.json", (t) => {
  if (process.platform !== "darwin" || !keychainAvailable()) {
    t.skip("OS keychain is not available in this environment");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "kimi-tools-test-"));
  const env = { KIMI_TOOLS_STORE: "keychain" };
  try {
    saveCredentials(dir, {
      version: 1,
      region: "cn",
      access_token: "short-lived",
      refresh_token: "long-lived-secret",
      expires_at: 1_900_000_000,
    }, env);
    const onDisk = JSON.parse(readFileSync(join(dir, "credentials.json"), "utf8"));
    assert.equal(onDisk.refresh_token, "keychain:refresh-token");
    assert.ok(!JSON.stringify(onDisk).includes("long-lived-secret"));
    // Reads reassemble the full credential from file + keychain.
    const loaded = loadCredentials(dir);
    assert.equal(loaded.refresh_token, keychainRead());
    assert.equal(loaded.access_token, "short-lived");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    keychainClear();
  }
});
