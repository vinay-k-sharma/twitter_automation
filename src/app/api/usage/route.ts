import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getUserLimitSnapshot } from "@/lib/limits";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const connection = await db.xConnection.findUnique({
    where: { userId: user.id }
  });

  if (!connection) {
    return jsonOk({
      connected: false,
      limits: null,
      usage: null
    });
  }

  const snapshot = await getUserLimitSnapshot(user.id);
  return jsonOk({
    connected: true,
    ...snapshot
  });
}
