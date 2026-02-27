import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getUserLimitSnapshot } from "@/lib/limits";

const schema = z.object({
  topics: z.array(z.string().min(1).max(80)).min(1).max(50),
  frequencyMinutes: z.number().int().min(15).max(1440),
  windowStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  windowEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  threadMode: z.boolean(),
  language: z.string().min(2).max(8),
  enabled: z.boolean()
});

function normalizeTopics(topics: string[]) {
  return Array.from(
    new Set(
      topics
        .map((topic) => topic.trim().toLowerCase())
        .filter((topic) => topic.length >= 2)
    )
  );
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const payload = schema.parse(await request.json());
    const normalizedTopics = normalizeTopics(payload.topics);
    if (normalizedTopics.length === 0) {
      return jsonError("At least one valid topic is required", 422);
    }

    const snapshot = await getUserLimitSnapshot(user.id);
    if (normalizedTopics.length > snapshot.limits.topicsTracked) {
      return jsonError(`Auto-tweet topics exceed cap (${snapshot.limits.topicsTracked})`, 403);
    }

    const config = await db.autoTweetConfig.upsert({
      where: { userId: user.id },
      update: {
        topics: normalizedTopics,
        frequencyMinutes: payload.frequencyMinutes,
        windowStart: payload.windowStart,
        windowEnd: payload.windowEnd,
        threadMode: payload.threadMode,
        language: payload.language.toLowerCase(),
        enabled: payload.enabled
      },
      create: {
        userId: user.id,
        topics: normalizedTopics,
        frequencyMinutes: payload.frequencyMinutes,
        windowStart: payload.windowStart,
        windowEnd: payload.windowEnd,
        threadMode: payload.threadMode,
        language: payload.language.toLowerCase(),
        enabled: payload.enabled
      }
    });
    return jsonOk({ config });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Invalid auto-tweet config", 422, error.flatten());
    }
    return jsonError(error instanceof Error ? error.message : "Failed to save config", 400);
  }
}
