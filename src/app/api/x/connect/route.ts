import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import {
  buildXOAuthAuthorizeUrl,
  createOAuthState,
  createPkcePair,
  isLikelyXClientId,
  normalizeXClientId
} from "@/lib/x/oauth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }
  const appOrigin = new URL(request.url).origin;

  const appCredential = await db.xAppCredential.findUnique({
    where: { userId: user.id }
  });

  const byoaClientId = appCredential ? normalizeXClientId(decryptSecret(appCredential.clientIdEnc)) : null;
  const envClientId = normalizeXClientId(env.X_CLIENT_ID);
  const useByoaClientId = isLikelyXClientId(byoaClientId);
  const clientId = useByoaClientId ? byoaClientId : envClientId;
  const callbackUrl = env.X_CALLBACK_URL ?? (useByoaClientId ? appCredential?.callbackUrl ?? null : null);

  if (!clientId || !callbackUrl) {
    return NextResponse.redirect(new URL("/dashboard?x_error=missing_x_app_credentials", appOrigin));
  }

  const state = createOAuthState(user.id);
  const pkce = createPkcePair();
  const redirectUrl = buildXOAuthAuthorizeUrl({
    state,
    codeChallenge: pkce.challenge,
    clientId,
    callbackUrl,
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
