// Calls to Kimi's managed tool endpoints, with one automatic token
// refresh-and-retry on 401 (the same recovery the official clients use).

import { randomUUID } from "node:crypto";

import { NotSignedInError, SessionExpiredError } from "./credentials.mjs";
import { PRODUCT_TOKEN, REQUEST_TIMEOUT_MS, VERSION } from "./constants.mjs";

export class KimiApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "KimiApiError";
    this.status = status;
  }
}

async function callEndpoint(tokenStore, path, body) {
  const { baseUrl } = tokenStore.endpoints();
  const url = `${baseUrl}${path}`;
  const toolCallId = randomUUID();

  const request = async (accessToken) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...tokenStore.deviceHeaders(),
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": `${PRODUCT_TOKEN}/${VERSION}`,
        "X-Msh-Tool-Call-Id": toolCallId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { response, text: await response.text() };
  };

  let accessToken;
  try {
    accessToken = await tokenStore.getAccessToken();
  } catch (error) {
    if (error instanceof NotSignedInError || error instanceof SessionExpiredError) throw error;
    throw new KimiApiError(0, `Could not read your Kimi sign-in: ${error.message}`);
  }

  let { response, text } = await request(accessToken);
  if (response.status === 401) {
    // The cached token may have been revoked server-side before its local
    // expiry; force one refresh and retry once.
    try {
      accessToken = await tokenStore.getAccessToken({ forceRefresh: true });
    } catch (error) {
      if (error instanceof SessionExpiredError || error instanceof NotSignedInError) throw error;
      throw new KimiApiError(401, "Kimi rejected the access token and it could not be refreshed. Please sign in again.");
    }
    ({ response, text } = await request(accessToken));
  }

  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    throw new KimiApiError(response.status, `Kimi API error (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
  return text;
}

// POST {baseUrl}/tools — the managed data-source gateway shared with the
// official kimi-datasource plugin.
export async function callToolsGateway(tokenStore, method, params) {
  const text = await callEndpoint(tokenStore, "/tools", { method, params });
  try {
    return JSON.parse(text);
  } catch {
    return { result: text };
  }
}

// POST {baseUrl}/search — managed web search ({text_query} → search_results).
export async function webSearch(tokenStore, query) {
  const text = await callEndpoint(tokenStore, "/search", { text_query: query });
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new KimiApiError(200, `Unexpected search response: ${text.slice(0, 300)}`);
  }
  const results = Array.isArray(parsed?.search_results) ? parsed.search_results : [];
  return results.map((r) => ({
    title: r?.title ?? "",
    url: r?.url ?? "",
    snippet: r?.snippet ?? "",
    ...(typeof r?.date === "string" && r.date ? { date: r.date } : {}),
    ...(typeof r?.site_name === "string" && r.site_name ? { siteName: r.site_name } : {}),
  }));
}

// POST {baseUrl}/fetch — managed page extraction ({url} → markdown). The
// endpoint answers a JSON envelope ({"url": ..., "markdown": ...}) on most
// paths but may also return raw text; unwrap whichever arrives.
export async function fetchUrl(tokenStore, url) {
  const text = await callEndpoint(tokenStore, "/fetch", { url });
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.markdown === "string") return parsed.markdown;
      if (typeof parsed.content === "string") return parsed.content;
    }
  } catch {}
  return text;
}
