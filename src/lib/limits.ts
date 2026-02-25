import { UsageAction } from "@prisma/client";

import { db } from "@/lib/db";
import { getEffectiveLimits } from "@/lib/plans";

const ACTIONS_WITH_HOURLY_CAP: UsageAction[] = ["REPLY", "LIKE", "TWEET", "FOLLOW"];

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

function hourAgo() {
  return new Date(Date.now() - 60 * 60 * 1000);
}

export async function getUserLimitSnapshot(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { xConnection: true }
  });

  if (!user || !user.xConnection) {
    throw new Error("User is not connected to X");
  }

  const limits = getEffectiveLimits({
    internalPlan: user.internalPlan,
    xTier: user.xConnection.xPaidTier
  });

  const dayStart = startOfUtcDay();
  const oneHourAgo = hourAgo();

  const [repliesToday, likesToday, tweetsToday, hourlyActions, topicsTracked] = await Promise.all([
    db.usageEvent.count({
      where: {
        userId,
        action: "REPLY",
        createdAt: { gte: dayStart }
      }
    }),
    db.usageEvent.count({
      where: {
        userId,
        action: "LIKE",
        createdAt: { gte: dayStart }
      }
    }),
    db.usageEvent.count({
      where: {
        userId,
        action: "TWEET",
        createdAt: { gte: dayStart }
      }
    }),
    db.usageEvent.count({
      where: {
        userId,
        action: { in: ACTIONS_WITH_HOURLY_CAP },
        createdAt: { gte: oneHourAgo }
      }
    }),
    db.topic.count({
      where: {
        userId,
        active: true
      }
    })
  ]);

  return {
    limits,
    usage: {
      repliesToday,
      likesToday,
      tweetsToday,
      hourlyActions,
      topicsTracked
    }
  };
}

export async function assertWithinHardCap(userId: string, action: UsageAction) {
  const snapshot = await getUserLimitSnapshot(userId);

  if (snapshot.usage.hourlyActions >= snapshot.limits.hourlyActionCap) {
    throw new Error(`Hourly action cap reached (${snapshot.limits.hourlyActionCap}/hour)`);
  }

  if (action === "REPLY" && snapshot.usage.repliesToday >= snapshot.limits.repliesPerDay) {
    throw new Error(`Daily replies cap reached (${snapshot.limits.repliesPerDay}/day)`);
  }
  if (action === "LIKE" && snapshot.usage.likesToday >= snapshot.limits.likesPerDay) {
    throw new Error(`Daily likes cap reached (${snapshot.limits.likesPerDay}/day)`);
  }
  if (action === "TWEET" && snapshot.usage.tweetsToday >= snapshot.limits.tweetsPerDay) {
    throw new Error(`Daily tweets cap reached (${snapshot.limits.tweetsPerDay}/day)`);
  }
  if (action === "FOLLOW" && !snapshot.limits.allowFollow) {
    throw new Error("Follow action is not available on current plan combination");
  }
}

export async function assertTopicSlots(userId: string, additionalTopics: number) {
  const snapshot = await getUserLimitSnapshot(userId);
  if (snapshot.usage.topicsTracked + additionalTopics > snapshot.limits.topicsTracked) {
    throw new Error(`Topic cap reached (max ${snapshot.limits.topicsTracked} tracked topics)`);
  }
}

export async function recordUsageEvent(userId: string, action: UsageAction, meta?: Record<string, unknown>) {
  await db.usageEvent.create({
    data: {
      userId,
      action,
      meta: meta ?? {}
    }
  });
}
