import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { buildXOAuthAuthorizeUrl, createOAuthState, createPkcePair } from "@/lib/x/oauth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  if (!env.X_CLIENT_ID || !env.X_CALLBACK_URL) {
    return NextResponse.redirect(
      new URL("/dashboard?x_error=missing_x_oauth_env", env.APP_URL)
    );
  }

  const state = createOAuthState(user.id);
  const pkce = createPkcePair();
  const redirectUrl = buildXOAuthAuthorizeUrl({
    state,
    codeChallenge: pkce.challenge
  });

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set({
    name: "x_oauth_state",
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });
  response.cookies.set({
    name: "x_oauth_verifier",
    value: pkce.verifier,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });

  return response;
}
