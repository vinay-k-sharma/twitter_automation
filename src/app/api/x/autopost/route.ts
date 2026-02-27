import { getCurrentUser } from "@/lib/auth";
import { enqueueAutoPost } from "@/lib/jobs/enqueue";
import { jsonError, jsonOk } from "@/lib/http";
import { db } from "@/lib/db";
import { runAutoPostForUser } from "@/lib/jobs/processors/autopost";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const [connection, autoConfig] = await Promise.all([
    db.xConnection.findUnique({
      where: { userId: user.id }
    }),
    db.autoTweetConfig.findUnique({
      where: { userId: user.id }
    })
  ]);
  if (!connection) {
    return jsonError("Connect X account first", 400);
  }
  if (!autoConfig) {
    return jsonError("Create auto-tweet config first", 400);
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const runInline = force || url.searchParams.get("mode") === "inline";

  if (runInline) {
    const result = await runAutoPostForUser(user.id, {
      force,
      source: "manual"
    });
    return jsonOk({
      ok: true,
      executed: "inline",
      force,
      result
    });
  }

  const job = await enqueueAutoPost(user.id);
  return jsonOk({ ok: true, enqueued: "autopost", jobId: job.id });
}
