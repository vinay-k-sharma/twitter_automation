import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { buildXOAuthAuthorizeUrl, createOAuthState, createPkcePair } from "@/lib/x/oauth";

export async function GET() {
  if (!env.X_CLIENT_ID || !env.X_CALLBACK_URL) {
    return NextResponse.redirect(new URL("/login?x_error=missing_x_oauth_env", env.APP_URL));
  }

  const state = createOAuthState("oauth_login");
  const pkce = createPkcePair();
  const redirectUrl = buildXOAuthAuthorizeUrl({
    state,
    codeChallenge: pkce.challenge,
    clientId: env.X_CLIENT_ID,
    callbackUrl: env.X_CALLBACK_URL,
    scopes: env.X_SCOPES
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
