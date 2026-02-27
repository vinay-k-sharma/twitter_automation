import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { assertWithinHardCap, recordUsageEvent } from "@/lib/limits";
import { generateTweet, moderateText } from "@/lib/ai/client";
import { logAction } from "@/lib/audit";
import { redis } from "@/lib/redis";
import { fingerprintText, randomJitterMs, sleep } from "@/lib/text";
import { isNonRetryableXFailure, postTweet } from "@/lib/x/client";
import { getValidXAccessToken } from "@/lib/x/connection";

const AUTOPOST_LOCK_TTL_SECONDS = 180;
const MAX_RECENT_GENERATED = 120;

export type AutoPostRunOptions = {
  force?: boolean;
  source?: "worker" | "manual" | "scheduler";
};

export type AutoPostRunResult = {
  posted: number;
  skipped: number;
  blocked: number;
  postedIds: string[];
  reason?: string;
};

function toMinutes(value: string) {
  const [hRaw, mRaw] = value.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return 0;
  }
  return h * 60 + m;
}

function isWithinWindow(windowStart: string, windowEnd: string) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(windowStart);
  const end = toMinutes(windowEnd);

  if (start === end) {
    return true;
  }

  if (start <= end) {
    return nowMinutes >= start && nowMinutes <= end;
  }
  return nowMinutes >= start || nowMinutes <= end;
}

function isDue(lastRunAt: Date | null, frequencyMinutes: number) {
  if (!lastRunAt) {
    return true;
  }
  const nextRunAt = lastRunAt.getTime() + frequencyMinutes * 60_000;
  return Date.now() >= nextRunAt;
}

function lockKey(userId: string) {
  return `autopost:lock:${userId}`;
}

async function acquireAutoPostLock(userId: string) {
  const token = randomUUID();
  try {
    const acquired = await redis.set(lockKey(userId), token, "EX", AUTOPOST_LOCK_TTL_SECONDS, "NX");
    if (acquired !== "OK") {
      return null;
    }
    return token;
  } catch {
    // Redis lock is best-effort. Continue without distributed lock if Redis is unavailable.
    return `nolock:${token}`;
  }
}

async function releaseAutoPostLock(userId: string, token: string) {
  if (token.startsWith("nolock:")) {
    return;
  }
  try {
    const current = await redis.get(lockKey(userId));
    if (current === token) {
      await redis.del(lockKey(userId));
    }
  } catch {
    // Best effort release.
  }
}

function sanitizeTweetPart(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 280);
}

function normalizeGeneratedParts(parts: string[], threadMode: boolean) {
  const seen = new Set<string>();
  const maxParts = threadMode ? 3 : 1;
  const normalized: string[] = [];

  for (const part of parts) {
    const cleaned = sanitizeTweetPart(part);
    if (!cleaned) {
      continue;
    }
    const fingerprint = fingerprintText(cleaned);
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    normalized.push(cleaned);
    if (normalized.length >= maxParts) {
      break;
    }
  }

  return normalized;
}

function skipResult(reason: string): AutoPostRunResult {
  return { posted: 0, skipped: 1, blocked: 0, postedIds: [], reason };
}

function blockedResult(reason: string): AutoPostRunResult {
  return { posted: 0, skipped: 0, blocked: 1, postedIds: [], reason };
}

export async function runAutoPostForUser(
  userId: string,
  options: AutoPostRunOptions = {}
): Promise<AutoPostRunResult> {
  const lockToken = await acquireAutoPostLock(userId);
  if (!lockToken) {
    return skipResult("autopost_already_running");
  }

  const source = options.source ?? "worker";

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      xConnection: true,
      autoTweetConfig: true
    }
  });

  try {
    if (!user || !user.xConnection || !user.autoTweetConfig) {
      return skipResult("autopost_not_ready");
    }

    const config = user.autoTweetConfig;
    if (!config.enabled && !options.force) {
      return skipResult("autopost_disabled");
    }
    if (!options.force && !isWithinWindow(config.windowStart, config.windowEnd)) {
      return skipResult("outside_post_window");
    }
    if (!options.force && !isDue(config.lastRunAt, config.frequencyMinutes)) {
      return skipResult("not_due_yet");
    }

    let accessToken = "";
    try {
      ({ accessToken } = await getValidXAccessToken(userId));
    } catch (tokenError) {
      if (!isNonRetryableXFailure(tokenError)) {
        throw tokenError;
      }
      await db.autoTweetConfig.update({
        where: { userId },
        data: { lastRunAt: new Date() }
      });
      await logAction({
        userId,
        action: "autopost_blocked",
        status: "blocked",
        message: tokenError instanceof Error ? tokenError.message : "X credentials are not usable for autopost",
        context: { source, reason: "x_access_token" }
      });
      return blockedResult("x_access_token_unavailable");
    }

    const recent = await db.generatedTweet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: MAX_RECENT_GENERATED,
      select: { text: true }
    });
    const recentFingerprints = new Set(recent.map((item) => fingerprintText(item.text)));

    const generated = await generateTweet({
      topics: config.topics,
      threadMode: config.threadMode,
      language: config.language,
      recentTweets: recent.map((item) => item.text)
    });
    const parts = normalizeGeneratedParts(generated, config.threadMode);

    if (parts.length === 0) {
      await db.autoTweetConfig.update({
        where: { userId },
        data: { lastRunAt: new Date() }
      });
      return skipResult("empty_generation");
    }

    let posted = 0;
    let blocked = 0;
    const postedIds: string[] = [];
    let previousTweetId: string | undefined;

    for (const part of parts) {
      const partFingerprint = fingerprintText(part);
      if (recentFingerprints.has(partFingerprint)) {
        blocked += 1;
        continue;
      }

      const moderation = await moderateText(part);
      if (!moderation.allowed) {
        blocked += 1;
        await logAction({
          userId,
          action: "autopost_blocked",
          status: "blocked",
          message: moderation.reason,
          context: { source, fingerprint: partFingerprint }
        });
        continue;
      }

      try {
        await assertWithinHardCap(userId, "TWEET");
      } catch (capError) {
        blocked += 1;
        await logAction({
          userId,
          action: "autopost_blocked",
          status: "blocked",
          message: capError instanceof Error ? capError.message : "Tweet cap reached",
          context: { source, reason: "hard_cap" }
        });
        break;
      }

      try {
        await sleep(randomJitterMs());
        const published = await postTweet(accessToken, part, config.threadMode ? previousTweetId : undefined);
        previousTweetId = published.data.id;
        postedIds.push(published.data.id);
        recentFingerprints.add(partFingerprint);

        await db.generatedTweet.create({
          data: {
            userId,
            text: part,
            threadParts: parts,
            xTweetId: published.data.id,
            sourceTopic: config.topics[0] ?? null,
            status: "posted",
            postedAt: new Date()
          }
        });
        await recordUsageEvent(userId, "TWEET", {
          xTweetId: published.data.id,
          fingerprint: partFingerprint,
          source
        });
        posted += 1;
      } catch (postError) {
        if (!isNonRetryableXFailure(postError)) {
          throw postError;
        }
        blocked += 1;
        await logAction({
          userId,
          action: "autopost_blocked",
          status: "blocked",
          message: postError instanceof Error ? postError.message : "X rejected the tweet post",
          context: { source, reason: "x_post_failed", fingerprint: partFingerprint }
        });
        break;
      }
    }

    await db.autoTweetConfig.update({
      where: { userId },
      data: { lastRunAt: new Date() }
    });

    const status = posted > 0 ? "success" : blocked > 0 ? "blocked" : "info";
    await logAction({
      userId,
      action: "autopost",
      status,
      message: `Auto-post completed. Posted=${posted}, blocked=${blocked}, mode=${config.threadMode ? "thread" : "single"}`,
      context: {
        source,
        postedIds,
        topics: config.topics,
        frequencyMinutes: config.frequencyMinutes,
        windowStart: config.windowStart,
        windowEnd: config.windowEnd,
        threadMode: config.threadMode
      }
    });

    return {
      posted,
      skipped: posted === 0 ? 1 : 0,
      blocked,
      postedIds,
      reason: posted === 0 ? (blocked > 0 ? "all_parts_blocked_or_duplicate" : "no_posted_parts") : undefined
    };
  } catch (error) {
    await logAction({
      userId,
      action: "autopost_error",
      status: "error",
      message: error instanceof Error ? error.message : "Auto-post failed",
      context: { source }
    });
    throw error;
  } finally {
    await releaseAutoPostLock(userId, lockToken);
  }
}
