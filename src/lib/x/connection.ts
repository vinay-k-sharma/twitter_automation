import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/x/client";

export async function getValidXAccessToken(userId: string) {
  const connection = await db.xConnection.findUnique({
    where: { userId }
  });
  if (!connection) {
    throw new Error("User is not connected to X");
  }

  const expiresSoon =
    connection.tokenExpiresAt !== null && connection.tokenExpiresAt.getTime() - Date.now() <= 60_000;

  if (!expiresSoon) {
    return {
      accessToken: decryptSecret(connection.accessTokenEnc),
      xUserId: connection.xUserId
    };
  }

  if (!connection.refreshTokenEnc) {
    throw new Error("X access token expired and no refresh token is available");
  }

  const refreshToken = decryptSecret(connection.refreshTokenEnc);
  const refreshed = await refreshAccessToken(refreshToken);

  const updated = await db.xConnection.update({
    where: { userId },
    data: {
      accessTokenEnc: encryptSecret(refreshed.access_token),
      refreshTokenEnc: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : connection.refreshTokenEnc,
      tokenExpiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
      scope: refreshed.scope ?? connection.scope
    }
  });

  return {
    accessToken: decryptSecret(updated.accessTokenEnc),
    xUserId: updated.xUserId
  };
}
