import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { detectXPaidTier, exchangeCodeForToken, getAuthenticatedUser } from "@/lib/x/client";
import { verifyOAuthState } from "@/lib/x/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard?x_error=${encodeURIComponent(error)}`, url.origin));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard?x_error=missing_oauth_params", url.origin));
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("x_oauth_state")?.value;
  const codeVerifier = cookieStore.get("x_oauth_verifier")?.value;

  if (!storedState || !codeVerifier || storedState !== state) {
    return NextResponse.redirect(new URL("/dashboard?x_error=state_mismatch", url.origin));
  }

  const userId = verifyOAuthState(state);
  if (!userId) {
    return NextResponse.redirect(new URL("/dashboard?x_error=invalid_state", url.origin));
  }

  try {
    const token = await exchangeCodeForToken({
      code,
      codeVerifier
    });
    const me = await getAuthenticatedUser(token.access_token);
    const xTier = await detectXPaidTier(token.access_token);

    await db.xConnection.upsert({
      where: { userId },
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
        userId,
        xUserId: me.id,
        username: me.username ?? null,
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        scope: token.scope ?? "",
        xPaidTier: xTier
      }
    });

    const response = NextResponse.redirect(new URL("/dashboard?x_connected=1", url.origin));
    response.cookies.set({ name: "x_oauth_state", value: "", path: "/", maxAge: 0 });
    response.cookies.set({ name: "x_oauth_verifier", value: "", path: "/", maxAge: 0 });
    return response;
  } catch (oauthError) {
    const message = oauthError instanceof Error ? oauthError.message : "oauth_failed";
    return NextResponse.redirect(new URL(`/dashboard?x_error=${encodeURIComponent(message)}`, url.origin));
  }
}
