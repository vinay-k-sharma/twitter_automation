import { autoPostQueue, discoveryQueue, engageQueue } from "@/lib/jobs/queues";

function slotKey(prefix: string, userId: string, slotMs = 60_000) {
  const slot = Math.floor(Date.now() / slotMs);
  return `${prefix}:${userId}:${slot}`;
}

export async function enqueueDiscovery(userId: string) {
  return discoveryQueue.add("discover", { userId }, { jobId: slotKey("discover", userId) });
}

export async function enqueueEngage(userId: string) {
  return engageQueue.add("engage", { userId }, { jobId: slotKey("engage", userId) });
}

export async function enqueueAutoPost(userId: string) {
  return autoPostQueue.add("autopost", { userId }, { jobId: slotKey("autopost", userId) });
}
