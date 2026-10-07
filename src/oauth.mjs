// OAuth token lifecycle: device authorization flow (RFC 8628) and
// refresh-token exchange, matching the official Kimi Code clients.
//
// Wire shape (verified against the official desktop client 1.0.4 and the
// open-source kimi-cli):
//   POST {oauthHost}/api/oauth/device_authorization  client_id
//   POST {oauthHost}/api/oauth/token                 grant_type=device_code
//   POST {oauthHost}/api/oauth/token                 grant_type=refresh_token

import { CLIENT_ID, PRODUCT_TOKEN, VERSION } from "./constants.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class OAuthError extends Error {}
export class OAuthUnauthorizedError extends OAuthError {}

async function postForm(url, params, headers = {}, { timeoutMs = 30_000, signal } = {}) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal !== undefined) signals.push(signal);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": `${PRODUCT_TOKEN}/${VERSION}`,
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.any(signals),
  });
  let data = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {}
  return { status: response.status, data };
}

const errorDetail = (data) =>
  data?.error_description ?? data?.error ?? data?.message ?? "unknown error";

function tokenFromResponse(data) {
  if (typeof data?.access_token !== "string" || data.access_token.length === 0) {
    throw new OAuthError("OAuth response is missing access_token");
  }
  if (typeof data?.refresh_token !== "string" || data.refresh_token.length === 0) {
    throw new OAuthError("OAuth response is missing refresh_token");
  }
  const expiresIn = Number(data.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new OAuthError("OAuth response is missing a valid expires_in");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
  };
}

export async function requestDeviceAuthorization(oauthHost, headers) {
  const { status, data } = await postForm(
    `${oauthHost}/api/oauth/device_authorization`,
    { client_id: CLIENT_ID },
    headers,
  );
  if (status !== 200) {
    throw new OAuthError(`Device authorization failed (HTTP ${status}): ${errorDetail(data)}`);
  }
  for (const field of ["user_code", "device_code", "verification_uri_complete"]) {
    if (typeof data[field] !== "string" || data[field].length === 0) {
      throw new OAuthError(`Device authorization response is missing ${field}`);
    }
  }
  return {
    userCode: data.user_code,
    deviceCode: data.device_code,
    verificationUri: typeof data.verification_uri === "string" ? data.verification_uri : "",
    verificationUriComplete: data.verification_uri_complete,
    expiresIn: data.expires_in !== undefined ? Number(data.expires_in) : null,
    interval: Number(data.interval ?? 5),
  };
}

// Poll the token endpoint until the user approves, the code expires, or the
// overall deadline (15 minutes, same as the official clients) is reached.
export async function pollDeviceToken(oauthHost, deviceCode, { interval = 5, deadlineAt, headers, signal } = {}) {
  let currentInterval = Math.max(Number(interval) || 5, 1);
  const deadline = deadlineAt ?? Date.now() + 15 * 60 * 1000;
  for (;;) {
    if (Date.now() >= deadline) {
      throw new OAuthError("Device authorization timed out before approval");
    }
    if (signal?.aborted === true) throw new OAuthError("Login aborted");
    const { status, data } = await postForm(
      `${oauthHost}/api/oauth/token`,
      {
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      headers,
      { signal },
    );
    if (status === 200 && typeof data.access_token === "string") {
      return tokenFromResponse(data);
    }
    if (status >= 500) {
      throw new OAuthError(`Token polling failed (HTTP ${status}): ${errorDetail(data)}`);
    }
    switch (data?.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        currentInterval += 5;
        break;
      case "expired_token":
        throw new OAuthError("The device code expired before approval");
      case "access_denied":
        throw new OAuthError(`Authorization was denied: ${errorDetail(data)}`);
      default:
        throw new OAuthError(`Token polling failed (HTTP ${status}): ${errorDetail(data)}`);
    }
    await sleep(currentInterval * 1000);
  }
}

export async function refreshAccessToken(oauthHost, refreshToken, headers) {
  const { status, data } = await postForm(
    `${oauthHost}/api/oauth/token`,
    {
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    headers,
  );
  if (status === 200 && typeof data.access_token === "string") {
    return tokenFromResponse(data);
  }
  if (status === 401 || status === 403 || data?.error === "invalid_grant") {
    throw new OAuthUnauthorizedError(`Token refresh was rejected: ${errorDetail(data)}`);
  }
  throw new OAuthError(`Token refresh failed (HTTP ${status}): ${errorDetail(data)}`);
}
