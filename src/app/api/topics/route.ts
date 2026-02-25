import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { assertTopicSlots } from "@/lib/limits";

const createSchema = z.object({
  keyword: z.string().min(2).max(120),
  language: z.string().min(2).max(8).default("en"),
  minLikes: z.number().int().min(0).max(100000).default(0),
  excludeWords: z.array(z.string().min(1).max(60)).max(30).default([])
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const topics = await db.topic.findMany({
    where: { userId: user.id, active: true },
    orderBy: { updatedAt: "desc" }
  });
  return jsonOk({ topics });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const payload = createSchema.parse(await request.json());
    await assertTopicSlots(user.id, 1);

    const topic = await db.topic.create({
      data: {
        userId: user.id,
        keyword: payload.keyword.trim(),
        language: payload.language.toLowerCase(),
        minLikes: payload.minLikes,
        excludeWords: payload.excludeWords.map((word) => word.trim().toLowerCase())
      }
    });
    return jsonOk({ topic }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Invalid topic payload", 422, error.flatten());
    }
    return jsonError(error instanceof Error ? error.message : "Failed to create topic", 400);
  }
}
