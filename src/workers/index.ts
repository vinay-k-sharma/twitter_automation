import { Worker } from "bullmq";

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

async function shutdown() {
  await Promise.all([discoveryWorker.close(), engageWorker.close(), autoPostWorker.close()]);
  await queueConnection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Workers online: discovery, engage, autopost");
