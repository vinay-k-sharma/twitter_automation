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

async function readJsonSafe<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

async function xFetch(path: string, options: XFetchOptions) {
  const response = await fetch(`${env.X_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.accessToken}`,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`X API error ${response.status}: ${details}`);
  }
  return response;
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
    code_verifier: input.codeVerifier,
    client_id: oauth.clientId
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if (oauth.clientSecret) {
    const raw = `${oauth.clientId}:${oauth.clientSecret}`;
    headers.Authorization = `Basic ${Buffer.from(raw).toString("base64")}`;
  }

  const response = await fetch(env.X_OAUTH_TOKEN_URL, {
    method: "POST",
    headers,
    body: params.toString()
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`X OAuth token exchange failed (${response.status}): ${details}`);
  }

  return readJsonSafe<XTokenResponse>(response);
}

export async function refreshAccessToken(refreshToken: string, oauth: XOAuthAppCredentials) {
  if (!oauth.clientId) {
    throw new Error("X OAuth app credentials are missing");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: oauth.clientId
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if (oauth.clientSecret) {
    const raw = `${oauth.clientId}:${oauth.clientSecret}`;
    headers.Authorization = `Basic ${Buffer.from(raw).toString("base64")}`;
  }

  const response = await fetch(env.X_OAUTH_TOKEN_URL, {
    method: "POST",
    headers,
    body: params.toString()
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`X token refresh failed (${response.status}): ${details}`);
  }

  return readJsonSafe<XTokenResponse>(response);
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
