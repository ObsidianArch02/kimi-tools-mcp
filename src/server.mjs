// Minimal MCP stdio server (newline-delimited JSON-RPC 2.0), same transport
// style as the official kimi-datasource plugin so any MCP-capable agent can
// host it: initialize / notifications/initialized / tools/list /
// tools/call / ping.

import readline from "node:readline";

import { PROTOCOL_VERSION, VERSION } from "./constants.mjs";
import { TokenStore } from "./credentials.mjs";
import * as api from "./api.mjs";
import { executeToolCall } from "./format.mjs";
import { TOOLS } from "./tools.mjs";

// Agents whose MCP hosts drive OAuth interactively (pi, Codex, ...) spawn
// the server process with `login` arguments for the sign-in flow. We do the
// same flow the CLI does, on stderr; if the host only proxies stdio, the
// URL still reaches the user through the host's own surface.
const LOGIN_INVOCATIONS = new Set(["login", "auth", "--login", "oauth-login", "mcp-login"]);

export function isLoginInvocation(argv = process.argv.slice(2)) {
  return argv.length > 0 && argv.some((arg) => LOGIN_INVOCATIONS.has(arg));
}

export function createServer({ tokenStore = new TokenStore(), apiImpl = api, out = process.stdout, log = () => {} } = {}) {
  async function handleRequest(message) {
    const { method, id, params } = message;
    switch (method) {
      case "initialize":
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "kimi-tools-mcp", version: VERSION },
        };
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS };
      case "tools/call": {
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};
        try {
          const text = await executeToolCall(tokenStore, toolName, toolArgs, apiImpl);
          return { content: [{ type: "text", text }] };
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          log(`tool ${toolName} failed: ${text}`);
          return { content: [{ type: "text", text }], isError: true };
        }
      }
      default:
        throw { code: -32601, message: `Method not found: ${method}` };
    }
  }

  function write(message) {
    out.write(`${JSON.stringify(message)}\n`);
  }

  function start(input = process.stdin) {
    const rl = readline.createInterface({ input, terminal: false });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        return;
      }
      if (message.method?.startsWith("notifications/")) return;
      handleRequest(message)
        .then((result) => {
          if (message.id !== undefined) write({ jsonrpc: "2.0", id: message.id, result });
        })
        .catch((error) => {
          if (message.id === undefined) return;
          const err = error && typeof error === "object" && "code" in error
            ? error
            : { code: -32603, message: error instanceof Error ? error.message : String(error) };
          write({ jsonrpc: "2.0", id: message.id, error: err });
        });
    });
    return rl;
  }

  return { handleRequest, start };
}
