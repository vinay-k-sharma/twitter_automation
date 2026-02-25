import { redirect } from "next/navigation";

import { DashboardClient } from "@/components/dashboard-client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserLimitSnapshot } from "@/lib/limits";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [xConnection, topics, replyConfig, autoTweetConfig, candidates, logs] = await Promise.all([
    db.xConnection.findUnique({
      where: { userId: user.id }
    }),
    db.topic.findMany({
      where: { userId: user.id, active: true },
      orderBy: { updatedAt: "desc" }
    }),
    db.replyConfig.findUnique({
      where: { userId: user.id }
    }),
    db.autoTweetConfig.findUnique({
      where: { userId: user.id }
    }),
    db.tweetCandidate.findMany({
      where: { userId: user.id },
      orderBy: { discoveredAt: "desc" },
      take: 20
    }),
    db.actionLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15
    })
  ]);
  const limits = xConnection ? await getUserLimitSnapshot(user.id) : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 md:px-8">
      <DashboardClient
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          internalPlan: user.internalPlan
        }}
        xConnection={
          xConnection
            ? {
                xUserId: xConnection.xUserId,
                username: xConnection.username,
                xPaidTier: xConnection.xPaidTier
              }
            : null
        }
        replyConfig={
          replyConfig
            ? {
                tone: replyConfig.tone,
                bioContext: replyConfig.bioContext,
                ctaStyle: replyConfig.ctaStyle,
                likeOnReply: replyConfig.likeOnReply,
                followOnReply: replyConfig.followOnReply
              }
            : {
                tone: "PROFESSIONAL",
                bioContext: "",
                ctaStyle: "SOFT",
                likeOnReply: true,
                followOnReply: false
              }
        }
        autoTweetConfig={
          autoTweetConfig
            ? {
                topics: autoTweetConfig.topics,
                frequencyMinutes: autoTweetConfig.frequencyMinutes,
                windowStart: autoTweetConfig.windowStart,
                windowEnd: autoTweetConfig.windowEnd,
                threadMode: autoTweetConfig.threadMode,
                language: autoTweetConfig.language,
                enabled: autoTweetConfig.enabled
              }
            : {
                topics: ["saas growth"],
                frequencyMinutes: 240,
                windowStart: "09:00",
                windowEnd: "18:00",
                threadMode: false,
                language: "en",
                enabled: false
              }
        }
        topics={topics.map((topic) => ({
          id: topic.id,
          keyword: topic.keyword,
          language: topic.language,
          minLikes: topic.minLikes,
          excludeWords: topic.excludeWords
        }))}
        candidates={candidates.map((candidate) => ({
          id: candidate.id,
          tweetId: candidate.tweetId,
          authorHandle: candidate.authorHandle,
          text: candidate.text,
          discoveredAt: candidate.discoveredAt.toISOString(),
          repliedAt: candidate.repliedAt?.toISOString() ?? null,
          likedAt: candidate.likedAt?.toISOString() ?? null
        }))}
        logs={logs.map((log) => ({
          id: log.id,
          action: log.action,
          status: log.status,
          message: log.message,
          createdAt: log.createdAt.toISOString()
        }))}
        limits={limits}
      />
    </main>
  );
}
