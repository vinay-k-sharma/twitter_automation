import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { refreshAccessToken } from "@/lib/x/client";
import { isLikelyXClientId, normalizeXClientId } from "@/lib/x/oauth";

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

  const appCredential = await db.xAppCredential.findUnique({
    where: { userId }
  });
  const byoaClientId = appCredential ? normalizeXClientId(decryptSecret(appCredential.clientIdEnc)) : null;
  const envClientId = normalizeXClientId(env.X_CLIENT_ID);
  const useByoaClientId = isLikelyXClientId(byoaClientId);
  const clientId = useByoaClientId ? byoaClientId : envClientId;
  const clientSecret = useByoaClientId
    ? appCredential?.clientSecretEnc
      ? decryptSecret(appCredential.clientSecretEnc)
      : env.X_CLIENT_SECRET
    : env.X_CLIENT_SECRET;
  const callbackUrl = env.X_CALLBACK_URL ?? (useByoaClientId ? appCredential?.callbackUrl ?? null : null);

  if (!clientId || !callbackUrl) {
    throw new Error("Missing X app credentials for token refresh");
  }

  const refreshToken = decryptSecret(connection.refreshTokenEnc);
  const refreshed = await refreshAccessToken(refreshToken, {
    clientId,
    clientSecret,
    callbackUrl
  });

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
