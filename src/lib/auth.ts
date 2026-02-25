import { createHmac, timingSafeEqual } from "crypto";

import { User } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";

const SESSION_COOKIE = "xg_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function sign(input: string) {
  return createHmac("sha256", env.TOKEN_ENCRYPTION_KEY).update(input).digest("hex");
}

function createSessionToken(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string) {
  const [userId, expiresRaw, signature] = token.split(".");
  if (!userId || !expiresRaw || !signature) {
    return null;
  }
  const payload = `${userId}.${expiresRaw}`;
  const expectedSig = sign(payload);
  const expectedBuf = Buffer.from(expectedSig);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || Math.floor(Date.now() / 1000) >= expiresAt) {
    return null;
  }
  return userId;
}

export function attachSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(userId),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getSessionUserId() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!session) {
    return null;
  }
  return verifySessionToken(session);
}

export async function getCurrentUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) {
    return null;
  }
  return db.user.findUnique({ where: { id: userId } });
}

export async function getCurrentUserOrThrow() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}
