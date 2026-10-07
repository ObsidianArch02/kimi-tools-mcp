// Rendering of tool results as MCP text content.

function renderSearchResults(results) {
  if (results.length === 0) {
    return "No results found. Try a more specific query.";
  }
  return results
    .map((r, i) => {
      const meta = [r.siteName, r.date].filter(Boolean).join(" · ");
      return `${i + 1}. ${r.title}\n   ${r.url}${meta ? `\n   ${meta}` : ""}\n   ${r.snippet}`;
    })
    .join("\n\n");
}

function renderJson(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

// Dispatches a tools/call request to the right endpoint and renders the
// answer. Throws on transport/auth errors; the server turns those into
// isError tool results so the agent can read the reason.
export async function executeToolCall(tokenStore, name, args, api) {
  switch (name) {
    case "get_data_source_desc": {
      const sourceName = requiredString(args, "name");
      const result = await api.callToolsGateway(tokenStore, "get_data_source_desc", { name: sourceName });
      return renderJson(result);
    }
    case "call_data_source_tool": {
      const sourceName = requiredString(args, "data_source_name");
      const apiName = requiredString(args, "api_name");
      const params = args?.params && typeof args.params === "object" ? args.params : {};
      const result = await api.callToolsGateway(tokenStore, "call_data_source_tool", {
        data_source_name: sourceName,
        api_name: apiName,
        params,
      });
      return renderJson(result);
    }
    case "web_search": {
      const query = requiredString(args, "query");
      const results = await api.webSearch(tokenStore, query);
      return renderSearchResults(results);
    }
    case "fetch_url": {
      const url = requiredString(args, "url");
      const content = await api.fetchUrl(tokenStore, url);
      return content && content.trim().length > 0
        ? content
        : "The response body is empty.";
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function requiredString(args, key) {
  const value = args?.[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Tool argument "${key}" must be a non-empty string.`);
  }
  return value;
}
