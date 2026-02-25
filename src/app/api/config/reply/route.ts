import { CtaStyle, Tone } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getUserLimitSnapshot } from "@/lib/limits";

const schema = z.object({
  tone: z.nativeEnum(Tone),
  bioContext: z.string().max(500).nullable(),
  ctaStyle: z.nativeEnum(CtaStyle),
  likeOnReply: z.boolean(),
  followOnReply: z.boolean()
});

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const payload = schema.parse(await request.json());
    if (payload.followOnReply) {
      const snapshot = await getUserLimitSnapshot(user.id);
      if (!snapshot.limits.allowFollow) {
        return jsonError("Follow on reply is premium-only for your current plan/tier", 403);
      }
    }

    const config = await db.replyConfig.upsert({
      where: { userId: user.id },
      update: payload,
      create: {
        userId: user.id,
        ...payload
      }
    });
    return jsonOk({ config });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Invalid reply config", 422, error.flatten());
    }
    return jsonError(error instanceof Error ? error.message : "Failed to save config", 400);
  }
}
