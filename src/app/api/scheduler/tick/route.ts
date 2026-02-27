import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/http";
import { enqueueAutoPost, enqueueDiscovery, enqueueEngage } from "@/lib/jobs/enqueue";

export async function POST(request: Request) {
  const secret = request.headers.get("x-scheduler-secret");
  if (secret !== env.SCHEDULER_SECRET) {
    return jsonError("Unauthorized scheduler secret", 401);
  }

  const users = await db.user.findMany({
    where: {
      xConnection: { isNot: null }
    },
    select: { id: true }
  });
  const autoPostUsers = await db.user.findMany({
    where: {
      xConnection: { isNot: null },
      autoTweetConfig: {
        is: { enabled: true }
      }
    },
    select: { id: true }
  });

  await Promise.all(
    users.flatMap((user) => [enqueueDiscovery(user.id), enqueueEngage(user.id)])
  );
  await Promise.all(
    autoPostUsers.map((user) => enqueueAutoPost(user.id))
  );

  return jsonOk({
    ok: true,
    users: users.length,
    autoPostUsers: autoPostUsers.length,
    jobsQueued: users.length * 2 + autoPostUsers.length
  });
}
