import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const schema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().min(1).max(80).optional()
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    action: url.searchParams.get("action") ?? undefined
  });

  if (!parsed.success) {
    return jsonError("Invalid logs query params", 422, parsed.error.flatten());
  }

  const { page, limit, action } = parsed.data;
  const where = {
    userId: user.id,
    ...(action ? { action } : {})
  };

  const [logs, total] = await Promise.all([
    db.actionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * limit,
      take: limit
    }),
    db.actionLog.count({ where })
  ]);

  return jsonOk({
    logs,
    total,
    page,
    limit
  });
}
