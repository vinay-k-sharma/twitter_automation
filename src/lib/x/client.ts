import { XPaidTier } from "@prisma/client";

import { env } from "@/lib/env";
import { XSearchTweet, XTokenResponse, XUser } from "@/lib/x/types";

type XFetchOptions = RequestInit & {
  accessToken: string;
};

export type XOAuthAppCredentials = {
  clientId: string;
  clientSecret?: string | null;
  callbackUrl: string;
};

type TokenRequestMode =
  | "public_pkce"
  | "confidential_client_id_basic"
  | "confidential_api_key_basic"
  | "confidential_api_key_basic_with_client_id";

type TokenAttemptResult = {
  ok: boolean;
  status: number;
  body: string;
};

let insecureTlsNoticeShown = false;

function allowsInsecureTlsForLocal() {
  return process.env.NODE_ENV !== "production" && env.X_ALLOW_INSECURE_TLS === "true";
}

function isTlsCertificateError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") {
    return false;
  }
  const code = (cause as { code?: unknown }).code;
  return code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
}

function isNetworkBlockPage(payload: string) {
  const normalized = payload.toLowerCase();
  return (
    normalized.includes("this website is blocked") ||
    (normalized.includes("protected by") && normalized.includes("sophos")) ||
    normalized.includes("restricted access to sites categorized as social networking")
  );
}

function summarizeErrorPayload(payload: string, maxLength = 400) {
  const compact = payload.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

export class XApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`X API error ${status}: ${summarizeErrorPayload(body)}`);
    this.name = "XApiError";
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, XApiError.prototype);
  }
}

export function isXApiError(error: unknown, statuses?: number | number[]) {
  if (!(error instanceof XApiError)) {
    return false;
  }
  if (statuses === undefined) {
    return true;
  }
  const allowed = Array.isArray(statuses) ? statuses : [statuses];
  return allowed.includes(error.status);
}

export function isNonRetryableXFailure(error: unknown) {
  if (isXApiError(error, [400, 401, 402, 403])) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("x token refresh failed") ||
    message.includes("x oauth token exchange failed") ||
    message.includes("missing x app credentials") ||
    message.includes("unauthorized_client") ||
    message.includes("invalid_client") ||
    message.includes("creditsdepleted")
  );
}

async function fetchWithLocalTlsFallback(url: string, options: RequestInit) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (!isTlsCertificateError(error) || !allowsInsecureTlsForLocal()) {
      throw error;
    }

    if (!insecureTlsNoticeShown) {
      console.warn(
        "[x/client] TLS certificate chain failed; retrying with insecure TLS for local development."
      );
      insecureTlsNoticeShown = true;
    }

    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      return await fetch(url, options);
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
      }
    }
  }
}

async function readJsonSafe<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

async function xFetch(path: string, options: XFetchOptions) {
  const response = await fetchWithLocalTlsFallback(`${env.X_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.accessToken}`,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const details = await response.text();
    if (isNetworkBlockPage(details)) {
      throw new Error(
        "Network firewall blocked access to api.x.com (Sophos policy). Login to your network portal or ask IT to allowlist x.com/api.x.com."
      );
    }
    throw new XApiError(response.status, details);
  }
  return response;
}

function readXClientIdHints(clientId: string) {
  try {
    const decoded = Buffer.from(clientId, "base64").toString("utf8");
    const [apiKey, version, type] = decoded.split(":");
    if (apiKey && version && type) {
      return {
        decoded,
        apiKey,
        type
      };
    }
  } catch {
    // Non-base64 or unexpected shape: keep using raw client ID.
  }
  return null;
}

function buildBasicAuthHeader(username: string, secret: string) {
  const raw = `${username}:${secret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function requestOAuthToken(
  baseParams: URLSearchParams,
  oauth: XOAuthAppCredentials,
  mode: TokenRequestMode
): Promise<TokenAttemptResult> {
  const params = new URLSearchParams(baseParams);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if (mode === "public_pkce") {
    params.set("client_id", oauth.clientId);
  } else {
    if (!oauth.clientSecret) {
      return {
        ok: false,
        status: 0,
        body: "Client secret required for confidential token exchange"
      };
    }

    if (mode === "confidential_client_id_basic") {
      headers.Authorization = buildBasicAuthHeader(oauth.clientId, oauth.clientSecret);
      params.set("client_id", oauth.clientId);
    } else {
      const hints = readXClientIdHints(oauth.clientId);
      const username = hints?.apiKey;
      if (!username) {
        return {
          ok: false,
          status: 0,
          body: "Unable to decode X API key from client ID"
        };
      }
      headers.Authorization = buildBasicAuthHeader(username, oauth.clientSecret);
      if (mode === "confidential_api_key_basic_with_client_id") {
        params.set("client_id", oauth.clientId);
      }
    }
  }

  const response = await fetchWithLocalTlsFallback(env.X_OAUTH_TOKEN_URL, {
    method: "POST",
    headers,
    body: params.toString()
  });
  const rawBody = await response.text();
  const body =
    !response.ok && isNetworkBlockPage(rawBody)
      ? '{"error":"network_blocked","error_description":"Network firewall blocked access to api.x.com (Sophos policy)."}'
      : rawBody;

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function buildTokenAttemptModes(oauth: XOAuthAppCredentials): TokenRequestMode[] {
  if (!oauth.clientSecret) {
    return ["public_pkce"];
  }

  return [
    "confidential_client_id_basic",
    "confidential_api_key_basic",
    "confidential_api_key_basic_with_client_id",
    "public_pkce"
  ];
}

export async function exchangeCodeForToken(
  input: { code: string; codeVerifier: string },
  oauth: XOAuthAppCredentials
) {
  if (!oauth.clientId || !oauth.callbackUrl) {
    throw new Error("X OAuth app credentials are missing");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: oauth.callbackUrl,
    code_verifier: input.codeVerifier
  });

  const errors: string[] = [];
  for (const mode of buildTokenAttemptModes(oauth)) {
    const attempt = await requestOAuthToken(params, oauth, mode);
    if (attempt.ok) {
      return JSON.parse(attempt.body) as XTokenResponse;
    }
    errors.push(`[${mode}] (${attempt.status}): ${attempt.body}`);
  }

  throw new Error(`X OAuth token exchange failed ${errors.join(" | ")}`);
}

export async function refreshAccessToken(refreshToken: string, oauth: XOAuthAppCredentials) {
  if (!oauth.clientId) {
    throw new Error("X OAuth app credentials are missing");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const errors: string[] = [];
  for (const mode of buildTokenAttemptModes(oauth)) {
    const attempt = await requestOAuthToken(params, oauth, mode);
    if (attempt.ok) {
      return JSON.parse(attempt.body) as XTokenResponse;
    }
    errors.push(`[${mode}] (${attempt.status}): ${attempt.body}`);
  }

  throw new Error(`X token refresh failed ${errors.join(" | ")}`);
}

export async function getAuthenticatedUser(accessToken: string) {
  const response = await xFetch("/users/me?user.fields=username,name", {
    method: "GET",
    accessToken
  });
  const payload = await readJsonSafe<{ data: XUser }>(response);
  return payload.data;
}

export async function detectXPaidTier(accessToken: string): Promise<XPaidTier> {
  const response = await xFetch("/users/me", {
    method: "GET",
    accessToken
  });
  const rateLimit = Number(response.headers.get("x-rate-limit-limit") ?? 0);

  if (rateLimit >= 1000) {
    return "ENTERPRISE";
  }
  if (rateLimit >= 300) {
    return "PRO";
  }
  if (rateLimit >= 60) {
    return "BASIC";
  }
  return "FREE";
}

export async function searchRecentTweets(
  accessToken: string,
  input: { query: string; language?: string; minLikes?: number; maxResults?: number }
) {
  const queryParts = [input.query.trim(), "-is:retweet", "-is:reply"];
  if (input.language) {
    queryParts.push(`lang:${input.language}`);
  }
  if (typeof input.minLikes === "number" && input.minLikes > 0) {
    queryParts.push(`min_faves:${Math.floor(input.minLikes)}`);
  }
  const query = queryParts.join(" ");
  const params = new URLSearchParams({
    query,
    max_results: String(input.maxResults ?? 20),
    "tweet.fields": "author_id,lang,public_metrics",
    expansions: "author_id",
    "user.fields": "username"
  });

  const response = await xFetch(`/tweets/search/recent?${params.toString()}`, {
    method: "GET",
    accessToken
  });

  const payload = await readJsonSafe<{
    data?: XSearchTweet[];
    includes?: { users?: XUser[] };
  }>(response);

  const usersById = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));
  return (payload.data ?? []).map((tweet) => ({
    id: tweet.id,
    text: tweet.text,
    authorId: tweet.author_id,
    authorHandle: usersById.get(tweet.author_id)?.username,
    language: tweet.lang,
    likeCount: tweet.public_metrics?.like_count ?? 0
  }));
}

export async function postReply(accessToken: string, input: { tweetId: string; text: string }) {
  const response = await xFetch("/tweets", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      text: input.text,
      reply: { in_reply_to_tweet_id: input.tweetId }
    })
  });
  return readJsonSafe<{ data: { id: string; text: string } }>(response);
}

export async function postTweet(accessToken: string, text: string, replyToTweetId?: string) {
  const body = replyToTweetId
    ? {
        text,
        reply: { in_reply_to_tweet_id: replyToTweetId }
      }
    : { text };

  const response = await xFetch("/tweets", {
    method: "POST",
    accessToken,
    body: JSON.stringify(body)
  });

  return readJsonSafe<{ data: { id: string; text: string } }>(response);
}

export async function likeTweet(accessToken: string, input: { userId: string; tweetId: string }) {
  const response = await xFetch(`/users/${input.userId}/likes`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({ tweet_id: input.tweetId })
  });
  return readJsonSafe<{ data: { liked: boolean } }>(response);
}

export async function followAuthor(accessToken: string, input: { userId: string; targetUserId: string }) {
  const response = await xFetch(`/users/${input.userId}/following`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({ target_user_id: input.targetUserId })
  });
  return readJsonSafe<{ data: { following: boolean } }>(response);
}
