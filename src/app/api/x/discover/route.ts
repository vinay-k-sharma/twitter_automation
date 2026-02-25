import { getCurrentUser } from "@/lib/auth";
import { enqueueDiscovery } from "@/lib/jobs/enqueue";
import { jsonError, jsonOk } from "@/lib/http";
import { db } from "@/lib/db";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const connection = await db.xConnection.findUnique({
    where: { userId: user.id }
  });
  if (!connection) {
    return jsonError("Connect X account first", 400);
  }

  const job = await enqueueDiscovery(user.id);
  return jsonOk({ ok: true, enqueued: "discovery", jobId: job.id });
}
