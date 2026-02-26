import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const schema = z.object({
  status: z.enum(["pending", "replied", "blocked", "all"]).default("pending"),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined
  });

  if (!parsed.success) {
    return jsonError("Invalid queue query params", 422, parsed.error.flatten());
  }

  const { status, page, limit } = parsed.data;
  const where =
    status === "pending"
      ? { userId: user.id, repliedAt: null, moderationStatus: { not: "BLOCKED" as const } }
      : status === "replied"
        ? { userId: user.id, repliedAt: { not: null } }
        : status === "blocked"
          ? { userId: user.id, moderationStatus: "BLOCKED" as const }
          : { userId: user.id };

  const [items, total] = await Promise.all([
    db.tweetCandidate.findMany({
      where,
      orderBy: { discoveredAt: "desc" },
      skip: page * limit,
      take: limit
    }),
    db.tweetCandidate.count({ where })
  ]);

  return jsonOk({
    items,
    total,
    page,
    limit,
    status
  });
}
