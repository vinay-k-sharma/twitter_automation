import { env } from "@/lib/env";
import { redis } from "@/lib/redis";

const OAUTH_PENDING_TTL_SECONDS = 10 * 60;
const pendingStateMemoryStore = new Map<
  string,
  { codeVerifier: string; returnToOrigin: string; expiresAt: number }
>();

export type PendingOAuthState = {
  codeVerifier: string;
  returnToOrigin: string;
};

function getPendingStateKey(state: string) {
  return `x:oauth:pending:${state}`;
}

function getDefaultOrigin() {
  try {
    return new URL(env.APP_URL).origin;
  } catch {
    return "http://localhost:3000";
  }
}

function normalizeReturnOrigin(origin: string | null | undefined) {
  if (!origin) {
    return getDefaultOrigin();
  }

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return getDefaultOrigin();
    }
    return parsed.origin;
  } catch {
    return getDefaultOrigin();
  }
}

function parsePendingOAuthState(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingOAuthState>;
    if (typeof parsed.codeVerifier !== "string" || parsed.codeVerifier.length < 32) {
      return null;
    }

    return {
      codeVerifier: parsed.codeVerifier,
      returnToOrigin: normalizeReturnOrigin(parsed.returnToOrigin)
    };
  } catch {
    return null;
  }
}

export async function savePendingOAuthState(state: string, input: PendingOAuthState) {
  const value = {
    codeVerifier: input.codeVerifier,
    returnToOrigin: normalizeReturnOrigin(input.returnToOrigin)
  };

  pendingStateMemoryStore.set(state, {
    ...value,
    expiresAt: Date.now() + OAUTH_PENDING_TTL_SECONDS * 1000
  });

  try {
    await redis.set(getPendingStateKey(state), JSON.stringify(value), "EX", OAUTH_PENDING_TTL_SECONDS);
  } catch {
    // Memory fallback already stored; Redis is best-effort for local development.
  }
}

export async function consumePendingOAuthState(state: string) {
  const inMemory = pendingStateMemoryStore.get(state);
  pendingStateMemoryStore.delete(state);

  if (inMemory && inMemory.expiresAt > Date.now()) {
    return {
      codeVerifier: inMemory.codeVerifier,
      returnToOrigin: inMemory.returnToOrigin
    };
  }

  try {
    const key = getPendingStateKey(state);
    const raw = await redis.get(key);
    await redis.del(key);
    return parsePendingOAuthState(raw);
  } catch {
    return null;
  }
}

export function getOAuthDefaultOrigin() {
  return getDefaultOrigin();
}
