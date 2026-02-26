import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const [connection, appCredential] = await Promise.all([
    db.xConnection.findUnique({
      where: { userId: user.id }
    }),
    db.xAppCredential.findUnique({
      where: { userId: user.id }
    })
  ]);

  return jsonOk({
    connected: Boolean(connection),
    configuredCredentials: Boolean(appCredential),
    username: connection?.username ?? null,
    xUserId: connection?.xUserId ?? null,
    xPaidTier: connection?.xPaidTier ?? null,
    expiresAt: connection?.tokenExpiresAt?.toISOString() ?? null
  });
}
