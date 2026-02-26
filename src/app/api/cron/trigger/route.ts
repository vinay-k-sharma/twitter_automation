import { z } from "zod";

import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/http";
import { enqueueAutoPost, enqueueDiscovery, enqueueEngage } from "@/lib/jobs/enqueue";

const schema = z.object({
  userId: z.string().min(1),
  type: z.enum(["discovery", "reply", "engage", "post", "autopost"])
});

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!env.CRON_SECRET || !token || token !== env.CRON_SECRET) {
    return jsonError("Unauthorized cron secret", 401);
  }

  try {
    const body = schema.parse(await request.json());
    const normalizedType =
      body.type === "reply" ? "engage" : body.type === "post" ? "autopost" : body.type;

    const job =
      normalizedType === "discovery"
        ? await enqueueDiscovery(body.userId)
        : normalizedType === "engage"
          ? await enqueueEngage(body.userId)
          : await enqueueAutoPost(body.userId);

    return jsonOk({
      ok: true,
      type: normalizedType,
      userId: body.userId,
      jobId: job.id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Invalid cron trigger payload", 422, error.flatten());
    }
    return jsonError(error instanceof Error ? error.message : "Cron trigger failed", 400);
  }
}
