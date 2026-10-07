# kimi-tools-mcp

Use Kimi Code's **official managed tools** — web search, URL fetch, and the
25+ professional data sources behind Kimi's `kimi-datasource` (Wind, SEC
EDGAR, S&P Capital IQ, World Bank, IMF, FRED, Tianyancha, arXiv, Google
Scholar, Chinese law & standards, WHO/FAO/OECD, Xinhua, Caixin, …) — from
**any MCP-capable agent**, signed in with **your own Kimi account**.

This is an independent, MIT-licensed MCP bridge. It speaks the same managed
endpoints the official Kimi Code clients use (`POST /coding/v1/search`,
`/fetch`, `/tools`), through the same OAuth device-authorization flow, with
the same public OAuth client id that identifies the Kimi Code product
family. It is not affiliated with Moonshot AI.

## What it gives your agent

| Tool | What it does |
| --- | --- |
| `web_search` | Managed web search: `{text_query}` → titles, URLs, snippets, site & date. |
| `fetch_url` | Managed page extraction: a URL → main text as markdown. |
| `get_data_source_desc` | API documentation for one data source (same entry point as the official plugin). |
| `call_data_source_tool` | One call into a data source (`data_source_name`, `api_name`, `params`). |

The data-source catalog behind the last two tools includes:
`stock_finance_data`, `yahoo_finance`, `world_bank_open_data`, `tianyancha`,
`arxiv`, `scholar`, `yuandian_law`, `wind`, `imf`, `gildata`, `sec_edgar`,
`sp_data`, `china_nda`, `china_nbs`, `china_standards`, `who`, `fao`,
`unsd`, `ecb`, `eurostat`, `unicef`, `oecd`, `fred`, `xhcj`, `caixin`.

## Requirements

- Node.js ≥ 18.17 (no dependencies; `npx` runs it directly).
- A **Kimi membership that includes Kimi Code** (Plus / Moderato or above).
  The tools only work after *you* sign in with *your own* account.

## Sign in (once per machine)

```bash
npx -y kimi-tools-mcp login
```

This starts the OAuth device flow: a browser tab opens
`kimi.com/code/authorize_device`, you approve with your own Kimi account,
and the CLI stores the resulting tokens locally. Done.

```bash
npx -y kimi-tools-mcp status    # check the sign-in (never prints tokens)
npx -y kimi-tools-mcp logout    # delete the local sign-in
npx -y kimi-tools-mcp login --region global   # use auth.kimi.ai instead of auth.kimi.com
```

## Add it to your agent

### magpie

```bash
magpie library mcp add kimi-tools -- npx -y kimi-tools-mcp
magpie library sync
```

Then sign in once with `npx -y kimi-tools-mcp login`. Every agent you gave
the server to (magpie's Library page or `agents=...` selects them) can call
the tools, sharing your sign-in — agents never see your tokens.

### Codex (OpenAI)

```bash
codex mcp add kimi-tools -- npx -y kimi-tools-mcp
codex mcp login kimi-tools        # opens the browser device flow
```

(`codex mcp login` runs the server process; this bridge detects it and runs
the same device flow as `npx kimi-tools-mcp login`. Either command works —
they share the same credential store.)

### pi

```bash
pi mcp add kimi-tools -- npx -y kimi-tools-mcp
pi mcp login kimi-tools
```

### Claude Code

```bash
claude mcp add kimi-tools -- npx -y kimi-tools-mcp
```

then run `npx -y kimi-tools-mcp login` once in a terminal.

### Kimi Code CLI

```bash
kimi mcp add kimi-tools -- npx -y kimi-tools-mcp
```

### OpenCode

Add to `~/.config/opencode/opencode.json` (or `.opencode/opencode.json`):

```json
{
  "mcp": {
    "kimi-tools": {
      "type": "local",
      "command": ["npx", "-y", "kimi-tools-mcp"],
      "enabled": true
    }
  }
}
```

### Cursor / VS Code / any other MCP host

Register a stdio MCP server whose command is `npx` with arguments
`["-y", "kimi-tools-mcp"]`, then run `npx -y kimi-tools-mcp login` once.

## Scope, terms and responsibilities

Please read this before using the bridge.

**What this software is.** A client-side MCP bridge: it forwards tool calls
from your agent to Kimi's managed endpoints, authenticated with the OAuth
tokens **you** issued to **your own** Kimi account on this machine. It runs
entirely on your computer, talks only to Kimi's own servers, and has no
server-side component of its own.

**What it is not.** It is not a way to share, resell, or multiply access.
Every call consumes the quota of the signed-in user's own membership,
exactly as if the official client had made it. Do not use it to give other
people access to your membership, to build a paid or free service on top of
Kimi Code, or to drive non-interactive batch/automation workloads.

**Terms of use.** Kimi's
[Community Guidelines](https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html)
allow using your membership from third-party tools, and ask that you:

- use it for **personal, interactive** work only (no scripted batch
  execution, no data pipelines);
- not resell accounts, API access, or repackage Kimi Code as a service;
- not spoof or alter client identity.

This bridge is designed to stay inside those rules: it identifies itself
truthfully (`User-Agent: kimi-tools-mcp/<version>`,
`X-Msh-Platform: kimi-tools-mcp` — it does **not** impersonate an official
client), it requires every user to sign in with their own account, and it
contains no scheduling, batching, caching-proxy or account-pooling logic.
**You** are responsible for how you use it; the authors assume no liability
for account actions Kimi may take in response to misuse (see the MIT
license). If Kimi's terms change, the terms win — stop using the bridge
where it conflicts.

## Credential storage & security

- **Location.** `$KIMI_TOOLS_HOME`, else `$XDG_CONFIG_HOME/kimi-tools`,
  else `~/.config/kimi-tools`.
- **Permissions.** The directory is created `0700`; `credentials.json` and
  `device_id` are written `0600` (owner read/write only). Writes are
  atomic (temporary file + rename), so a crash cannot corrupt your tokens.
- **Contents.** OAuth `access_token` + `refresh_token`, expiry, region and
  the endpoints — nothing else. No usage data, no telemetry, no analytics.
  The only network traffic is to Kimi's own OAuth and API hosts.
- **Token lifecycle.** Access tokens are short-lived; the bridge refreshes
  them automatically (at most one in-flight refresh per process) and
  persists the rotated pair. A 401 triggers exactly one forced refresh and
  retry; if that fails you are told to sign in again.
- **Hygiene.** Tokens are never printed, logged, written to project
  folders, or included in tool outputs/error text. `logout` (or deleting
  the directory) removes every trace from the machine.
- **Optional OS keychain.** Set `KIMI_TOOLS_STORE=keychain` to move the
  long-lived refresh token out of `credentials.json` and into the OS
  keychain (macOS Keychain via `security`; Linux libsecret via
  `secret-tool`). Off by default for zero-dependency portability — the
  short-lived access token and non-secret metadata still live in the file.
  Sign in (or re-login) once with the variable set and the token migrates;
  unset it and sign in again to move back. If the keychain is unavailable
  the bridge fails loudly with instructions instead of silently writing
  the secret to disk.
- **Your part.** Treat `credentials.json` like a password: don't copy it
  into repos, backups you share, or other people's machines. Signing in on
  a machine registers a device on your Kimi account page; remove devices
  you no longer use from that page.

## How it works (for reviewers)

Zero dependencies, ~700 lines, all in `src/`:

| File | Role |
| --- | --- |
| `src/server.mjs` | newline-delimited JSON-RPC 2.0 MCP stdio server (`initialize`, `tools/list`, `tools/call`, `ping`) |
| `src/tools.mjs` | the four tool schemas (same shapes as the official `kimi-datasource`) |
| `src/oauth.mjs` | RFC 8628 device flow + refresh, matching the official clients |
| `src/credentials.mjs` | permission-safe credential store + refresh de-duplication |
| `src/store.mjs` | optional OS-keychain backend for the refresh token |
| `src/api.mjs` | `POST {base}/tools`, `/search`, `/fetch` with one refresh-and-retry on 401 |
| `src/identity.mjs` | truthful `X-Msh-*` device identity headers |

Run the tests with `npm test` (node:test, no network).

## FAQ

**Does this share my quota with other people?**
No. Only processes running as your OS user on this machine can read the
credential file, and every call counts against your own membership.

**Can I use it from several agents at once?**
Yes — that's the point. Codex, pi, magpie-routed agents etc. can all call
the same local server definition; they share your sign-in, not your tokens.

**What happens when Kimi rotates endpoints?**
`KIMI_TOOLS_BASE_URL` / `KIMI_TOOLS_OAUTH_HOST` override the defaults
without a code change; region `global` switches to the `kimi.ai` hosts.

**Is this affiliated with Moonshot AI / Kimi?**
No. It uses the same public OAuth client and managed endpoints as the
official clients, the same way other third-party integrations do.
