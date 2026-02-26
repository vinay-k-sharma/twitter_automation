import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/http";
import { isLikelyXClientId, normalizeXClientId } from "@/lib/x/oauth";

const schema = z.object({
  clientId: z.string().min(10).max(256).optional(),
  clientSecret: z.string().min(10).max(512).optional(),
  callbackUrl: z.string().url().optional()
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const credential = await db.xAppCredential.findUnique({
    where: { userId: user.id }
  });

  return jsonOk({
    configured: Boolean(credential),
    callbackUrl: credential?.callbackUrl ?? env.X_CALLBACK_URL ?? `${env.APP_URL}/api/x/callback`
  });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const payload = schema.parse(await request.json());
    const existing = await db.xAppCredential.findUnique({
      where: { userId: user.id }
    });

    const callbackUrl = payload.callbackUrl ?? existing?.callbackUrl ?? env.X_CALLBACK_URL ?? `${env.APP_URL}/api/x/callback`;

    let clientIdEnc = existing?.clientIdEnc ?? null;
    if (payload.clientId && payload.clientId.trim().length > 0) {
      const normalizedClientId = normalizeXClientId(payload.clientId);
      if (!normalizedClientId || !isLikelyXClientId(normalizedClientId)) {
        return jsonError(
          "X Client ID looks invalid. Use OAuth 2.0 Client ID (from Keys and tokens), not your @username.",
          422
        );
      }

      clientIdEnc = encryptSecret(normalizedClientId);
    }

    if (!clientIdEnc) {
      return jsonError("X Client ID is required to configure BYOA credentials", 422);
    }

    let clientSecretEnc = existing?.clientSecretEnc ?? null;
    if (payload.clientSecret && payload.clientSecret.trim().length > 0) {
      clientSecretEnc = encryptSecret(payload.clientSecret.trim());
    }

    await db.xAppCredential.upsert({
      where: { userId: user.id },
      update: {
        clientIdEnc,
        clientSecretEnc,
        callbackUrl
      },
      create: {
        userId: user.id,
        clientIdEnc,
        clientSecretEnc,
        callbackUrl
      }
    });

    return jsonOk({
      ok: true,
      configured: true,
      callbackUrl
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Invalid X credential payload", 422, error.flatten());
    }
    return jsonError(error instanceof Error ? error.message : "Failed to save X credentials", 400);
  }
}
