import { getCurrentUser } from "@/lib/auth";
import { getUserLimitSnapshot } from "@/lib/limits";
import { jsonError, jsonOk } from "@/lib/http";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const [xConnection, xAppCredential, replyConfig, autoTweetConfig, topics, recentLogs] = await Promise.all([
    db.xConnection.findUnique({
      where: { userId: user.id }
    }),
    db.xAppCredential.findUnique({
      where: { userId: user.id }
    }),
    db.replyConfig.findUnique({
      where: { userId: user.id }
    }),
    db.autoTweetConfig.findUnique({
      where: { userId: user.id }
    }),
    db.topic.findMany({
      where: { userId: user.id, active: true },
      orderBy: { updatedAt: "desc" }
    }),
    db.actionLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);
  const snapshot = xConnection ? await getUserLimitSnapshot(user.id) : null;

  return jsonOk({
    user,
    xConnection: xConnection
      ? {
          xUserId: xConnection.xUserId,
          username: xConnection.username,
          xPaidTier: xConnection.xPaidTier,
          scope: xConnection.scope
        }
      : null,
    xAppCredential: xAppCredential
      ? {
          configured: true,
          callbackUrl: xAppCredential.callbackUrl
        }
      : {
          configured: false,
          callbackUrl: null
        },
    replyConfig,
    autoTweetConfig,
    topics,
    limits: snapshot,
    recentLogs
  });
}
