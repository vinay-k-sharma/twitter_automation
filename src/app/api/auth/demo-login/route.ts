import { InternalPlan } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { attachSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  internalPlan: z.nativeEnum(InternalPlan).optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const user = await db.user.upsert({
      where: { email: body.email.toLowerCase() },
      update: {
        name: body.name,
        ...(body.internalPlan ? { internalPlan: body.internalPlan } : {})
      },
      create: {
        email: body.email.toLowerCase(),
        name: body.name,
        internalPlan: body.internalPlan ?? "FREE"
      }
    });

    await db.replyConfig.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        tone: "PROFESSIONAL",
        ctaStyle: "SOFT",
        likeOnReply: true,
        followOnReply: false
      }
    });

    await db.autoTweetConfig.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        topics: ["saas growth"],
        frequencyMinutes: 240,
        windowStart: "09:00",
        windowEnd: "18:00",
        threadMode: false,
        language: "en",
        enabled: false
      }
    });

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        internalPlan: user.internalPlan
      }
    });
    attachSessionCookie(response, user.id);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Invalid login payload", 422, error.flatten());
    }
    return jsonError(error instanceof Error ? error.message : "Login failed", 500);
  }
}
