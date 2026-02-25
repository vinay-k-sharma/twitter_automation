import { db } from "@/lib/db";

export async function logAction(input: {
  userId: string;
  action: string;
  status: "success" | "blocked" | "error" | "info";
  message?: string;
  context?: Record<string, unknown>;
}) {
  await db.actionLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      status: input.status,
      message: input.message,
      context: input.context ?? {}
    }
  });
}
