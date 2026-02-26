import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export async function logAction(input: {
  userId: string;
  action: string;
  status: "success" | "blocked" | "error" | "info";
  message?: string;
  context?: Prisma.InputJsonObject;
}) {
  await db.actionLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      status: input.status,
      message: input.message,
      context: input.context
    }
  });
}
