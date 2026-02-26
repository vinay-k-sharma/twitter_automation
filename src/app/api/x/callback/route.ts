import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { attachSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { detectXPaidTier, exchangeCodeForToken, getAuthenticatedUser } from "@/lib/x/client";
import { isLikelyXClientId, normalizeXClientId, verifyOAuthState } from "@/lib/x/oauth";
import { consumePendingOAuthState, getOAuthDefaultOrigin } from "@/lib/x/pending-oauth";

function isOAuthLoginState(state: string | null) {
  return Boolean(state && state.startsWith("oauth_login."));
}

function redirectWithOAuthError(appOrigin: string, state: string | null, error: string) {
  const target = isOAuthLoginState(state) ? "/login" : "/dashboard";
  return NextResponse.redirect(new URL(`${target}?x_error=${encodeURIComponent(error)}`, appOrigin));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const defaultAppOrigin = getOAuthDefaultOrigin();
  const pendingState = state ? await consumePendingOAuthState(state) : null;
  const appOrigin = pendingState?.returnToOrigin ?? defaultAppOrigin;

  if (error) {
    return redirectWithOAuthError(appOrigin, state, error);
  }
  if (!code || !state) {
    return redirectWithOAuthError(appOrigin, state, "missing_oauth_params");
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("x_oauth_state")?.value;
  const cookieCodeVerifier = cookieStore.get("x_oauth_verifier")?.value;
  const codeVerifier = cookieCodeVerifier ?? pendingState?.codeVerifier ?? null;
  const stateHint = state ?? storedState ?? null;
  const cookieStateMatches = Boolean(storedState && storedState === state);

  if ((!cookieStateMatches && !pendingState) || !codeVerifier) {
    return redirectWithOAuthError(appOrigin, stateHint, "state_mismatch");
  }

  const stateUserId = verifyOAuthState(state);
  if (!stateUserId) {
    return redirectWithOAuthError(appOrigin, stateHint, "invalid_state");
  }
  const isLoginFlow = stateUserId === "oauth_login";

  try {
    const appCredential = isLoginFlow
      ? null
      : await db.xAppCredential.findUnique({
          where: { userId: stateUserId }
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
      return redirectWithOAuthError(
        appOrigin,
        isLoginFlow ? "oauth_login." : state,
        "missing_x_app_credentials"
      );
    }

    const token = await exchangeCodeForToken(
      {
        code,
        codeVerifier
      },
      {
        clientId,
        clientSecret,
        callbackUrl
      }
    );
    const me = await getAuthenticatedUser(token.access_token);
    const xTier = await detectXPaidTier(token.access_token);
    let targetUserId = stateUserId;

    if (isLoginFlow) {
      const existingConnection = await db.xConnection.findFirst({
        where: { xUserId: me.id },
        select: { userId: true }
      });

      if (existingConnection) {
        targetUserId = existingConnection.userId;
      } else {
        const loginEmail = `x-${me.id}@x.oauth.local`;
        const displayName = me.name ?? (me.username ? `@${me.username}` : "X User");
        const provisionedUser = await db.user.upsert({
          where: { email: loginEmail },
          update: { name: displayName },
          create: {
            email: loginEmail,
            name: displayName
          }
        });
        targetUserId = provisionedUser.id;

        await Promise.all([
          db.replyConfig.upsert({
            where: { userId: targetUserId },
            update: {},
            create: {
              userId: targetUserId,
              tone: "PROFESSIONAL",
              ctaStyle: "SOFT",
              likeOnReply: true,
              followOnReply: false
            }
          }),
          db.autoTweetConfig.upsert({
            where: { userId: targetUserId },
            update: {},
            create: {
              userId: targetUserId,
              topics: ["saas growth"],
              frequencyMinutes: 240,
              windowStart: "09:00",
              windowEnd: "18:00",
              threadMode: false,
              language: "en",
              enabled: false
            }
          })
        ]);
      }
    }

    await db.xConnection.upsert({
      where: { userId: targetUserId },
      update: {
        xUserId: me.id,
        username: me.username ?? null,
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        scope: token.scope ?? "",
        xPaidTier: xTier
      },
      create: {
        userId: targetUserId,
        xUserId: me.id,
        username: me.username ?? null,
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        scope: token.scope ?? "",
        xPaidTier: xTier
      }
    });

    const response = NextResponse.redirect(new URL("/dashboard?x_connected=1", appOrigin));
    attachSessionCookie(response, targetUserId);
    response.cookies.set({ name: "x_oauth_state", value: "", path: "/", maxAge: 0 });
    response.cookies.set({ name: "x_oauth_verifier", value: "", path: "/", maxAge: 0 });
    return response;
  } catch (oauthError) {
    const message = oauthError instanceof Error ? oauthError.message : "oauth_failed";
    return redirectWithOAuthError(appOrigin, isLoginFlow ? "oauth_login." : state, message);
  }
}
