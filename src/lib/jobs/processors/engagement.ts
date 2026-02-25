import { db } from "@/lib/db";
import { generateReply, moderateText } from "@/lib/ai/client";
import { assertWithinHardCap, recordUsageEvent } from "@/lib/limits";
import { logAction } from "@/lib/audit";
import { fingerprintText, randomJitterMs, sleep } from "@/lib/text";
import { followAuthor, likeTweet, postReply } from "@/lib/x/client";
import { getValidXAccessToken } from "@/lib/x/connection";

export async function runEngagementForUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      xConnection: true,
      replyConfig: true
    }
  });

  if (!user || !user.xConnection) {
    return { replied: 0, liked: 0, followed: 0, blocked: 0 };
  }

  const config = user.replyConfig ?? {
    tone: "PROFESSIONAL",
    ctaStyle: "SOFT",
    bioContext: null,
    likeOnReply: true,
    followOnReply: false
  };

  const { accessToken, xUserId } = await getValidXAccessToken(userId);
  const candidates = await db.tweetCandidate.findMany({
    where: {
      userId,
      repliedAt: null
    },
    orderBy: [{ likeCount: "desc" }, { discoveredAt: "asc" }],
    take: 10
  });

  const recentReplies = await db.tweetCandidate.findMany({
    where: { userId, replyText: { not: null } },
    orderBy: { repliedAt: "desc" },
    select: { replyText: true },
    take: 20
  });

  let replied = 0;
  let liked = 0;
  let followed = 0;
  let blocked = 0;

  for (const candidate of candidates) {
    try {
      await assertWithinHardCap(userId, "REPLY");

      const reply = await generateReply({
        tweetText: candidate.text,
        tone: config.tone,
        ctaStyle: config.ctaStyle,
        bioContext: config.bioContext,
        recentReplies: recentReplies.map((item) => item.replyText ?? "")
      });

      const duplicateHash = fingerprintText(reply);
      const duplicateReply = await db.tweetCandidate.findFirst({
        where: {
          userId,
          replyText: reply
        },
        select: { id: true }
      });

      if (duplicateReply) {
        blocked += 1;
        await db.tweetCandidate.update({
          where: { id: candidate.id },
          data: {
            moderationStatus: "BLOCKED"
          }
        });
        continue;
      }

      const moderation = await moderateText(reply);
      if (!moderation.allowed) {
        blocked += 1;
        await db.tweetCandidate.update({
          where: { id: candidate.id },
          data: {
            moderationStatus: "BLOCKED"
          }
        });
        await logAction({
          userId,
          action: "reply_blocked",
          status: "blocked",
          message: moderation.reason,
          context: { tweetId: candidate.tweetId, duplicateHash }
        });
        continue;
      }

      await sleep(randomJitterMs());
      await postReply(accessToken, {
        tweetId: candidate.tweetId,
        text: reply
      });

      await db.tweetCandidate.update({
        where: { id: candidate.id },
        data: {
          replyText: reply,
          repliedAt: new Date(),
          moderationStatus: "PASSED",
          duplicateFingerprint: duplicateHash
        }
      });
      await recordUsageEvent(userId, "REPLY", { tweetId: candidate.tweetId });
      replied += 1;

      if (config.likeOnReply && !candidate.likedAt) {
        try {
          await assertWithinHardCap(userId, "LIKE");
          await sleep(randomJitterMs(1000, 3000));
          await likeTweet(accessToken, {
            userId: xUserId,
            tweetId: candidate.tweetId
          });
          await db.tweetCandidate.update({
            where: { id: candidate.id },
            data: { likedAt: new Date() }
          });
          await recordUsageEvent(userId, "LIKE", { tweetId: candidate.tweetId });
          liked += 1;
        } catch (error) {
          await logAction({
            userId,
            action: "like_skip",
            status: "blocked",
            message: error instanceof Error ? error.message : "Like skipped",
            context: { tweetId: candidate.tweetId }
          });
        }
      }

      if (config.followOnReply && !candidate.followedAt) {
        try {
          await assertWithinHardCap(userId, "FOLLOW");
          await sleep(randomJitterMs(1000, 3000));
          await followAuthor(accessToken, {
            userId: xUserId,
            targetUserId: candidate.authorId
          });
          await db.tweetCandidate.update({
            where: { id: candidate.id },
            data: { followedAt: new Date() }
          });
          await recordUsageEvent(userId, "FOLLOW", { authorId: candidate.authorId });
          followed += 1;
        } catch (error) {
          await logAction({
            userId,
            action: "follow_skip",
            status: "blocked",
            message: error instanceof Error ? error.message : "Follow skipped",
            context: { authorId: candidate.authorId }
          });
        }
      }
    } catch (error) {
      await logAction({
        userId,
        action: "engagement_error",
        status: "error",
        message: error instanceof Error ? error.message : "Unknown engagement error",
        context: { tweetId: candidate.tweetId }
      });
    }
  }

  await logAction({
    userId,
    action: "engagement",
    status: "success",
    message: `Engagement completed: replies=${replied}, likes=${liked}, follows=${followed}, blocked=${blocked}`
  });

  return { replied, liked, followed, blocked };
}
