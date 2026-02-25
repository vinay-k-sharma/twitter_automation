import IORedis from "ioredis";
import { Queue } from "bullmq";

import { env } from "@/lib/env";

export type DiscoveryJobPayload = { userId: string };
export type EngageJobPayload = { userId: string };
export type AutoPostJobPayload = { userId: string };

const queueConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000
  },
  removeOnComplete: 300,
  removeOnFail: 300
};

export const discoveryQueue = new Queue<DiscoveryJobPayload>("tweet-discovery", {
  connection: queueConnection,
  defaultJobOptions
});

export const engageQueue = new Queue<EngageJobPayload>("tweet-engage", {
  connection: queueConnection,
  defaultJobOptions
});

export const autoPostQueue = new Queue<AutoPostJobPayload>("tweet-autopost", {
  connection: queueConnection,
  defaultJobOptions
});

export { queueConnection };
