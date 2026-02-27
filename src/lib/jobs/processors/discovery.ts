import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { recordUsageEvent } from "@/lib/limits";
import { redis } from "@/lib/redis";
import { containsExcludedWords, fingerprintText } from "@/lib/text";
import { isNonRetryableXFailure, searchRecentTweets } from "@/lib/x/client";
import { getValidXAccessToken } from "@/lib/x/connection";

export async function runDiscoveryForUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      xConnection: true,
      topics: {
        where: { active: true },
        orderBy: { updatedAt: "desc" }
      }
    }
  });

  if (!user || !user.xConnection) {
    return { discovered: 0, skipped: 0, blocked: 0 };
  }

  const { accessToken } = await getValidXAccessToken(userId);
  let discovered = 0;
  let skipped = 0;
  let blocked = 0;
  const seenKey = `seen:${userId}`;

  for (const topic of user.topics) {
    let tweets: Awaited<ReturnType<typeof searchRecentTweets>> = [];
    try {
      tweets = await searchRecentTweets(accessToken, {
        query: topic.keyword,
        language: topic.language,
        minLikes: topic.minLikes,
        maxResults: 20
      });
    } catch (searchError) {
      if (!isNonRetryableXFailure(searchError)) {
        throw searchError;
      }
      blocked += 1;
      await logAction({
        userId,
        action: "discovery_blocked",
        status: "blocked",
        message: searchError instanceof Error ? searchError.message : "Discovery request blocked by X",
        context: {
          topicId: topic.id,
          keyword: topic.keyword
        }
      });
      break;
    }

    for (const tweet of tweets) {
      const alreadySeen = await redis.sismember(seenKey, tweet.id);
      if (alreadySeen) {
        skipped += 1;
        continue;
      }

      if (containsExcludedWords(tweet.text, topic.excludeWords)) {
        skipped += 1;
        continue;
      }

      const existing = await db.tweetCandidate.findUnique({
        where: {
          userId_tweetId: {
            userId,
            tweetId: tweet.id
          }
        }
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await db.tweetCandidate.create({
        data: {
          userId,
          tweetId: tweet.id,
          authorId: tweet.authorId,
          authorHandle: tweet.authorHandle,
          text: tweet.text,
          language: tweet.language,
          likeCount: tweet.likeCount,
          duplicateFingerprint: fingerprintText(tweet.text)
        }
      });
      await redis.sadd(seenKey, tweet.id);
      await redis.expire(seenKey, 60 * 60 * 24 * 30);
      discovered += 1;
    }

    await recordUsageEvent(userId, "DISCOVERY", {
      topicId: topic.id,
      keyword: topic.keyword
    });
  }

  await logAction({
    userId,
    action: "discovery",
    status: blocked > 0 ? "blocked" : "success",
    message: `Discovery completed. New candidates: ${discovered}, skipped: ${skipped}, blocked: ${blocked}`,
    context: { discovered, skipped, blocked }
  });

  return { discovered, skipped, blocked };
}
