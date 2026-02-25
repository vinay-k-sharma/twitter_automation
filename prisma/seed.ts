import { loadEnvConfig } from "@next/env";
import { InternalPlan } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  const plan = (process.env.DEMO_DEFAULT_PLAN ?? "PRO").toUpperCase() as InternalPlan;

  const user = await prisma.user.upsert({
    where: { email: "demo@xgrowth.app" },
    update: { internalPlan: plan },
    create: {
      email: "demo@xgrowth.app",
      name: "Demo User",
      internalPlan: plan
    }
  });

  await prisma.replyConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      tone: "PROFESSIONAL",
      ctaStyle: "SOFT",
      likeOnReply: true,
      followOnReply: false,
      bioContext: "Builder focused on practical SaaS growth."
    }
  });

  await prisma.autoTweetConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      topics: ["saas growth", "indie hacking"],
      frequencyMinutes: 240,
      windowStart: "09:00",
      windowEnd: "18:00",
      threadMode: false,
      language: "en",
      enabled: false
    }
  });

  console.log(`Seeded demo user: ${user.email} (${user.id})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
