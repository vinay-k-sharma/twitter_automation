import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { recordUsageEvent } from "@/lib/limits";
import { containsExcludedWords, fingerprintText } from "@/lib/text";
import { searchRecentTweets } from "@/lib/x/client";
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
    return { discovered: 0, skipped: 0 };
  }

  const { accessToken } = await getValidXAccessToken(userId);
  let discovered = 0;
  let skipped = 0;

  for (const topic of user.topics) {
    const tweets = await searchRecentTweets(accessToken, {
      query: topic.keyword,
      language: topic.language,
      minLikes: topic.minLikes,
      maxResults: 20
    });

    for (const tweet of tweets) {
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
    status: "success",
    message: `Discovery completed. New candidates: ${discovered}, skipped: ${skipped}`,
    context: { discovered, skipped }
  });

  return { discovered, skipped };
}
