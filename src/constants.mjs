// Shared constants for kimi-tools-mcp.
//
// The OAuth client id below is the public client identifier of the official
// Kimi Code product family (Desktop / CLI / VS Code). It is not a secret:
// it ships in every official client binary and identifies the *application*,
// never a user. This bridge is an OAuth client in the same sense — it
// cannot do anything until a real user completes the device authorization
// flow with their own Kimi account.

export const VERSION = "0.1.0";

export const CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";

export const REGIONS = {
  cn: {
    oauthHost: "https://auth.kimi.com",
    baseUrl: "https://api.kimi.com/coding/v1",
  },
  global: {
    oauthHost: "https://auth.kimi.ai",
    baseUrl: "https://api.kimi.ai/coding/v1",
  },
};

export const DEFAULT_REGION = "cn";

// Identity headers sent with every request, mirroring the shape the
// official clients send (X-Msh-Platform / X-Msh-Version / device identity).
// We deliberately use our own honest platform token rather than
// impersonating an official client: Kimi's community guidelines ask
// integrators to keep a truthful client identity.
export const PLATFORM_TOKEN = "kimi-tools-mcp";
export const PRODUCT_TOKEN = "kimi-tools-mcp";

export const PROTOCOL_VERSION = "2025-06-18";
export const REQUEST_TIMEOUT_MS = 30_000;
export const REFRESH_SKEW_MS = 5 * 60 * 1000;
