import { Worker } from "bullmq";
import cron from "node-cron";

import { db } from "../lib/db";
import { env } from "../lib/env";
import { enqueueAutoPost, enqueueDiscovery, enqueueEngage } from "../lib/jobs/enqueue";
import { queueConnection } from "../lib/jobs/queues";
import { runAutoPostForUser } from "../lib/jobs/processors/autopost";
import { runDiscoveryForUser } from "../lib/jobs/processors/discovery";
import { runEngagementForUser } from "../lib/jobs/processors/engagement";

const discoveryWorker = new Worker(
  "tweet-discovery",
  async (job) => {
    return runDiscoveryForUser(job.data.userId);
  },
  {
    connection: queueConnection,
    concurrency: 3
  }
);

const engageWorker = new Worker(
  "tweet-engage",
  async (job) => {
    return runEngagementForUser(job.data.userId);
  },
  {
    connection: queueConnection,
    concurrency: 3
  }
);

const autoPostWorker = new Worker(
  "tweet-autopost",
  async (job) => {
    return runAutoPostForUser(job.data.userId);
  },
  {
    connection: queueConnection,
    concurrency: 2
  }
);

for (const worker of [discoveryWorker, engageWorker, autoPostWorker]) {
  worker.on("completed", (job) => {
    console.log(`[${worker.name}] completed job ${job.id}`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[${worker.name}] failed job ${job?.id}:`, error);
  });
}

async function enqueueForAll(type: "discovery" | "engage" | "autopost") {
  const users = await db.user.findMany({
    where: {
      xConnection: { isNot: null }
    },
    select: { id: true }
  });

  if (type === "discovery") {
    await Promise.all(users.map((user) => enqueueDiscovery(user.id)));
  } else if (type === "engage") {
    await Promise.all(users.map((user) => enqueueEngage(user.id)));
  } else {
    await Promise.all(users.map((user) => enqueueAutoPost(user.id)));
  }

  console.log(`[scheduler] ${type} jobs queued for ${users.length} users`);
}

const discoverySchedule = cron.schedule(
  env.DISCOVERY_CRON,
  async () => {
    try {
      await enqueueForAll("discovery");
    } catch (error) {
      console.error("[scheduler] discovery tick failed:", error);
    }
  },
  { timezone: "UTC" }
);

const engagementSchedule = cron.schedule(
  env.ENGAGEMENT_CRON,
  async () => {
    try {
      await enqueueForAll("engage");
    } catch (error) {
      console.error("[scheduler] engagement tick failed:", error);
    }
  },
  { timezone: "UTC" }
);

const autopostSchedule = cron.schedule(
  env.AUTOPOST_CRON,
  async () => {
    try {
      await enqueueForAll("autopost");
    } catch (error) {
      console.error("[scheduler] autopost tick failed:", error);
    }
  },
  { timezone: "UTC" }
);

async function shutdown() {
  discoverySchedule.stop();
  engagementSchedule.stop();
  autopostSchedule.stop();
  await Promise.all([discoveryWorker.close(), engageWorker.close(), autoPostWorker.close()]);
  await db.$disconnect();
  await queueConnection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Workers online: discovery, engage, autopost + scheduler");
