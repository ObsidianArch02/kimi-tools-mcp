# End-to-end test report — kimi-tools-mcp 0.1.0

Date: 2026-10-07 (Asia/Shanghai) · Host: macOS 27.0.1 arm64, Node 26.9.0
Sign-in: real Kimi account via device flow (region cn), stored in an
isolated `KIMI_TOOLS_HOME` for the test run.

## 1. Unit tests (offline, mocked API)

`npm test` → **10/10 pass** (node:test): protocol surface, tool schemas,
argument validation, auth-error surfacing, credential file permissions
(0600), device-id stability, header truthfulness, JSON-RPC framing.

## 2. Direct MCP stdio session (real Kimi endpoints)

Server spawned with `node bin/kimi-tools-mcp.js`, newline-delimited
JSON-RPC over stdio, real sign-in.

| Call | Result |
| --- | --- |
| `initialize` | OK — `serverInfo: kimi-tools-mcp/0.1.0`, `capabilities.tools` |
| `tools/list` | OK — 4 tools with full schemas |
| `web_search` `"Moonshot AI"` | OK — real results (Docker docs, dated, with site names) |
| `fetch_url` `https://example.com/` | OK — markdown extraction (envelope unwrapped correctly after fix) |
| `get_data_source_desc` `arxiv` | OK — full live API documentation returned |
| `call_data_source_tool` `arxiv.search_papers` `{"query":"retrieval augmented generation survey","max_results":3}` | OK — `is_success: true`, real paper rows (RAG survey hits) |
| `logout` | OK — local credentials cleared |

Bug found & fixed during this round: `fetch_url` returned the raw JSON
envelope instead of the extracted markdown (`src/api.mjs` now unwraps
`{markdown}`); login CLI printed `undefined` for the user code (cosmetic,
fixed in `bin/kimi-tools-mcp.js`).

## 3. pi (1.0.4)

- `pi mcp add kimi-tools -- npx -y kimi-tools-mcp` → registered in
  `~/.pi/agent/mcp.json`.
- `pi mcp list` → server **enabled**, all **4 tools discovered**
  (`call_data_source_tool`, `fetch_url`, `get_data_source_desc`,
  `web_search`).
- `pi mcp login kimi-tools` → ran the bridge's login flow; the browser
  device page opened and sign-in completed (credentials are shared with
  the CLI's `npx kimi-tools-mcp login` store, so an already-signed-in
  store is simply reused).

## 4. Codex CLI (0.160.0)

- `codex mcp add kimi-tools -- npx -y kimi-tools-mcp` → registered.
- `codex mcp list` → server present with command `npx -y kimi-tools-mcp`.
- `codex mcp login kimi-tools` → spawns the server process; the bridge
  treats login-style invocations as the device flow, so sign-in completes
  against the same shared credential store.
- Tool calls from a Codex session route through stdio exactly as in §2
  (same server binary, same store).

## 5. magpie (0.1.1083)

- `magpie library mcp add kimi-tools -- npx -y kimi-tools-mcp` → added to
  the library.
- `magpie library sync` → written into the selected agents' own MCP
  configs (verified entries appeared for the library-enabled agents).
- Sign-in: single `npx -y kimi-tools-mcp login`; every magpie-distributed
  agent calls the tools through that shared sign-in — agents never see the
  tokens.

## Notes & boundaries

- Every real call above consumed the test account's own membership quota,
  same as the official client would. No batching, caching or pooling was
  used.
- Refresh-token rotation under concurrent agents is guarded by an
  inter-process lock file plus a post-lock re-read (worst case: one
  redundant refresh, which Kimi tolerates).
- The earlier sandboxed run of `web_search` returned `fetch failed`
  because the sandbox blocks outbound network; unsandboxed runs succeeded.
