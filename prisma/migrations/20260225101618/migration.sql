-- CreateEnum
CREATE TYPE "InternalPlan" AS ENUM ('FREE', 'PRO', 'TEAM');

-- CreateEnum
CREATE TYPE "XPaidTier" AS ENUM ('FREE', 'BASIC', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('PROFESSIONAL', 'WITTY', 'INSIGHTFUL');

-- CreateEnum
CREATE TYPE "CtaStyle" AS ENUM ('SOFT', 'DIRECT', 'NONE');

-- CreateEnum
CREATE TYPE "UsageAction" AS ENUM ('REPLY', 'LIKE', 'TWEET', 'FOLLOW', 'DISCOVERY');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'PASSED', 'BLOCKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "internalPlan" "InternalPlan" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xUserId" TEXT NOT NULL,
    "username" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL,
    "xPaidTier" "XPaidTier" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XAppCredential" (
    "userId" TEXT NOT NULL,
    "clientIdEnc" TEXT NOT NULL,
    "clientSecretEnc" TEXT,
    "callbackUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XAppCredential_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "minLikes" INTEGER NOT NULL DEFAULT 0,
    "excludeWords" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tone" "Tone" NOT NULL DEFAULT 'PROFESSIONAL',
    "bioContext" TEXT,
    "ctaStyle" "CtaStyle" NOT NULL DEFAULT 'SOFT',
    "likeOnReply" BOOLEAN NOT NULL DEFAULT true,
    "followOnReply" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoTweetConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topics" TEXT[],
    "frequencyMinutes" INTEGER NOT NULL DEFAULT 180,
    "windowStart" TEXT NOT NULL DEFAULT '09:00',
    "windowEnd" TEXT NOT NULL DEFAULT '18:00',
    "threadMode" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'en',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoTweetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TweetCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorHandle" TEXT,
    "text" TEXT NOT NULL,
    "language" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repliedAt" TIMESTAMP(3),
    "likedAt" TIMESTAMP(3),
    "followedAt" TIMESTAMP(3),
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "replyText" TEXT,
    "duplicateFingerprint" TEXT,

    CONSTRAINT "TweetCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedTweet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "threadParts" TEXT[],
    "xTweetId" TEXT,
    "sourceTopic" TEXT,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedTweet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "UsageAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "XConnection_userId_key" ON "XConnection"("userId");

-- CreateIndex
CREATE INDEX "XConnection_xUserId_idx" ON "XConnection"("xUserId");

-- CreateIndex
CREATE INDEX "Topic_userId_active_idx" ON "Topic"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_userId_keyword_language_key" ON "Topic"("userId", "keyword", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyConfig_userId_key" ON "ReplyConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoTweetConfig_userId_key" ON "AutoTweetConfig"("userId");

-- CreateIndex
CREATE INDEX "TweetCandidate_userId_discoveredAt_idx" ON "TweetCandidate"("userId", "discoveredAt");

-- CreateIndex
CREATE INDEX "TweetCandidate_userId_repliedAt_idx" ON "TweetCandidate"("userId", "repliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TweetCandidate_userId_tweetId_key" ON "TweetCandidate"("userId", "tweetId");

-- CreateIndex
CREATE INDEX "GeneratedTweet_userId_createdAt_idx" ON "GeneratedTweet"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_action_createdAt_idx" ON "UsageEvent"("userId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "ActionLog_userId_createdAt_idx" ON "ActionLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "XConnection" ADD CONSTRAINT "XConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XAppCredential" ADD CONSTRAINT "XAppCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyConfig" ADD CONSTRAINT "ReplyConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoTweetConfig" ADD CONSTRAINT "AutoTweetConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TweetCandidate" ADD CONSTRAINT "TweetCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedTweet" ADD CONSTRAINT "GeneratedTweet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
