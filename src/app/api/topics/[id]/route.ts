import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { assertTopicSlots } from "@/lib/limits";

const updateSchema = z.object({
  keyword: z.string().min(2).max(120).optional(),
  language: z.string().min(2).max(8).optional(),
  minLikes: z.number().int().min(0).max(100000).optional(),
  excludeWords: z.array(z.string().min(1).max(60)).max(30).optional(),
  active: z.boolean().optional()
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await context.params;
  const existing = await db.topic.findUnique({
    where: { id }
  });
  if (!existing || existing.userId !== user.id) {
    return jsonError("Topic not found", 404);
  }

  try {
    const payload = updateSchema.parse(await request.json());
    if (existing.active === false && payload.active === true) {
      await assertTopicSlots(user.id, 1);
    }

    const updated = await db.topic.update({
      where: { id },
      data: {
        ...(payload.keyword ? { keyword: payload.keyword.trim() } : {}),
        ...(payload.language ? { language: payload.language.toLowerCase() } : {}),
        ...(typeof payload.minLikes === "number" ? { minLikes: payload.minLikes } : {}),
        ...(payload.excludeWords ? { excludeWords: payload.excludeWords.map((w) => w.toLowerCase()) } : {}),
        ...(typeof payload.active === "boolean" ? { active: payload.active } : {})
      }
    });
    return jsonOk({ topic: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Invalid topic payload", 422, error.flatten());
    }
    return jsonError(error instanceof Error ? error.message : "Failed to update topic", 400);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await context.params;
  const existing = await db.topic.findUnique({
    where: { id }
  });
  if (!existing || existing.userId !== user.id) {
    return jsonError("Topic not found", 404);
  }

  await db.topic.delete({
    where: { id }
  });
  return jsonOk({ ok: true });
}
