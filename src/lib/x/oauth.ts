import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

import { env } from "@/lib/env";

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sign(input: string) {
  return createHmac("sha256", env.TOKEN_ENCRYPTION_KEY).update(input).digest("hex");
}

export function createOAuthState(userId: string) {
  const nonce = toBase64Url(randomBytes(12));
  const raw = `${userId}.${nonce}.${Date.now()}`;
  return `${raw}.${sign(raw)}`;
}

export function verifyOAuthState(state: string) {
  const [userId, nonce, tsRaw, signature] = state.split(".");
  if (!userId || !nonce || !tsRaw || !signature) {
    return null;
  }
  const raw = `${userId}.${nonce}.${tsRaw}`;
  const expected = sign(raw);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || Date.now() - ts > 10 * 60 * 1000) {
    return null;
  }
  return userId;
}

export function createPkcePair() {
  const verifier = toBase64Url(randomBytes(32));
  const challenge = toBase64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildXOAuthAuthorizeUrl(input: { state: string; codeChallenge: string }) {
  if (!env.X_CLIENT_ID || !env.X_CALLBACK_URL) {
    throw new Error("X OAuth env vars are missing");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: env.X_CALLBACK_URL,
    scope: env.X_SCOPES,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256"
  });

  return `${env.X_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}
