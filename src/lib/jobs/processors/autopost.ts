import { db } from "@/lib/db";
import { assertWithinHardCap, recordUsageEvent } from "@/lib/limits";
import { generateTweet, moderateText } from "@/lib/ai/client";
import { logAction } from "@/lib/audit";
import { fingerprintText, randomJitterMs, sleep } from "@/lib/text";
import { postTweet } from "@/lib/x/client";
import { getValidXAccessToken } from "@/lib/x/connection";

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

export async function runAutoPostForUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      xConnection: true,
      autoTweetConfig: true
    }
  });

  if (!user || !user.xConnection || !user.autoTweetConfig || !user.autoTweetConfig.enabled) {
    return { posted: 0, skipped: 1 };
  }

  const config = user.autoTweetConfig;
  if (!isWithinWindow(config.windowStart, config.windowEnd) || !isDue(config.lastRunAt, config.frequencyMinutes)) {
    return { posted: 0, skipped: 1 };
  }

  const { accessToken } = await getValidXAccessToken(userId);
  const recent = await db.generatedTweet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { text: true }
  });

  const parts = await generateTweet({
    topics: config.topics,
    threadMode: config.threadMode,
    language: config.language,
    recentTweets: recent.map((item) => item.text)
  });

  if (parts.length === 0) {
    return { posted: 0, skipped: 1 };
  }

  let rootTweetId: string | undefined;
  const postedIds: string[] = [];
  let posted = 0;

  for (const part of parts) {
    await assertWithinHardCap(userId, "TWEET");

    const moderation = await moderateText(part);
    if (!moderation.allowed) {
      await logAction({
        userId,
        action: "autopost_blocked",
        status: "blocked",
        message: moderation.reason
      });
      continue;
    }

    const duplicate = await db.generatedTweet.findFirst({
      where: {
        userId,
        text: part
      },
      select: { id: true }
    });
    if (duplicate) {
      continue;
    }

    await sleep(randomJitterMs());
    const published = await postTweet(accessToken, part, rootTweetId);
    rootTweetId = rootTweetId ?? published.data.id;
    postedIds.push(published.data.id);

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
      fingerprint: fingerprintText(part)
    });
    posted += 1;
  }

  await db.autoTweetConfig.update({
    where: { userId },
    data: { lastRunAt: new Date() }
  });

  await logAction({
    userId,
    action: "autopost",
    status: "success",
    message: `Auto-post completed. Published tweets: ${posted}`,
    context: { postedIds }
  });

  return { posted, skipped: posted === 0 ? 1 : 0 };
}
