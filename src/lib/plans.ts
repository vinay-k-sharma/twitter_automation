import { InternalPlan, XPaidTier } from "@prisma/client";

export type EffectiveLimits = {
  repliesPerDay: number;
  tweetsPerDay: number;
  likesPerDay: number;
  topicsTracked: number;
  hourlyActionCap: number;
  allowFollow: boolean;
};

const INTERNAL_PLAN_LIMITS: Record<InternalPlan, EffectiveLimits> = {
  FREE: {
    repliesPerDay: 20,
    tweetsPerDay: 5,
    likesPerDay: 30,
    topicsTracked: 5,
    hourlyActionCap: 12,
    allowFollow: false
  },
  PRO: {
    repliesPerDay: 120,
    tweetsPerDay: 30,
    likesPerDay: 150,
    topicsTracked: 30,
    hourlyActionCap: 60,
    allowFollow: true
  },
  TEAM: {
    repliesPerDay: 400,
    tweetsPerDay: 120,
    likesPerDay: 500,
    topicsTracked: 100,
    hourlyActionCap: 220,
    allowFollow: true
  }
};

const X_TIER_LIMITS: Record<XPaidTier, EffectiveLimits> = {
  FREE: {
    repliesPerDay: 10,
    tweetsPerDay: 5,
    likesPerDay: 20,
    topicsTracked: 3,
    hourlyActionCap: 8,
    allowFollow: false
  },
  BASIC: {
    repliesPerDay: 100,
    tweetsPerDay: 25,
    likesPerDay: 120,
    topicsTracked: 20,
    hourlyActionCap: 45,
    allowFollow: false
  },
  PRO: {
    repliesPerDay: 500,
    tweetsPerDay: 150,
    likesPerDay: 800,
    topicsTracked: 200,
    hourlyActionCap: 250,
    allowFollow: true
  },
  ENTERPRISE: {
    repliesPerDay: 5000,
    tweetsPerDay: 2000,
    likesPerDay: 10000,
    topicsTracked: 1000,
    hourlyActionCap: 1000,
    allowFollow: true
  }
};

export function getEffectiveLimits(input: { internalPlan: InternalPlan; xTier: XPaidTier }): EffectiveLimits {
  const internal = INTERNAL_PLAN_LIMITS[input.internalPlan];
  const xTier = X_TIER_LIMITS[input.xTier];

  return {
    repliesPerDay: Math.min(internal.repliesPerDay, xTier.repliesPerDay),
    tweetsPerDay: Math.min(internal.tweetsPerDay, xTier.tweetsPerDay),
    likesPerDay: Math.min(internal.likesPerDay, xTier.likesPerDay),
    topicsTracked: Math.min(internal.topicsTracked, xTier.topicsTracked),
    hourlyActionCap: Math.min(internal.hourlyActionCap, xTier.hourlyActionCap),
    allowFollow: internal.allowFollow && xTier.allowFollow
  };
}
