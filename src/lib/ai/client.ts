import OpenAI from "openai";

import { env } from "@/lib/env";
import { isLikelySpam, normalizeText } from "@/lib/text";

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

type ReplyInput = {
  tweetText: string;
  tone: "PROFESSIONAL" | "WITTY" | "INSIGHTFUL";
  bioContext?: string | null;
  ctaStyle: "SOFT" | "DIRECT" | "NONE";
  recentReplies: string[];
};

type TweetInput = {
  topics: string[];
  threadMode: boolean;
  language: string;
  recentTweets: string[];
};

function fallbackReply(input: ReplyInput) {
  const ending =
    input.ctaStyle === "DIRECT"
      ? "If this resonates, follow for more practical growth playbooks."
      : input.ctaStyle === "SOFT"
        ? "Curious how others here are approaching this."
        : "";

  const tonePrefix =
    input.tone === "WITTY" ? "Sharp point." : input.tone === "INSIGHTFUL" ? "Interesting signal." : "Great point.";

  return `${tonePrefix} ${input.tweetText.slice(0, 110)}${ending ? ` ${ending}` : ""}`.trim();
}

function fallbackTweet(input: TweetInput) {
  const topic = input.topics[0] ?? "saas growth";
  return [`Sustainable ${topic} is mostly consistent execution, tight feedback loops, and clear positioning.`];
}

function sanitizeLine(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export async function moderateText(text: string) {
  if (isLikelySpam(text)) {
    return { allowed: false, reason: "Rule-based spam pattern detected" };
  }
  if (!openai) {
    return { allowed: true as const };
  }
  const result = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: text
  });
  const flagged = result.results.some((entry) => entry.flagged);
  if (flagged) {
    return { allowed: false as const, reason: "OpenAI moderation flagged the content" };
  }
  return { allowed: true as const };
}

export async function generateReply(input: ReplyInput) {
  if (!openai) {
    return fallbackReply(input);
  }

  const recentReplies = input.recentReplies.slice(0, 8).map((line, index) => `${index + 1}. ${sanitizeLine(line)}`);
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.75,
    messages: [
      {
        role: "system",
        content:
          "You write concise, human-sounding X replies. Avoid generic praise, clickbait, hashtags spam, and robotic templates. Keep it natural and specific."
      },
      {
        role: "user",
        content: [
          `Tone: ${input.tone}`,
          `Bio context: ${input.bioContext ?? "N/A"}`,
          `CTA style: ${input.ctaStyle}`,
          `Target tweet: ${sanitizeLine(input.tweetText)}`,
          `Avoid repeating these previous replies:\n${recentReplies.join("\n") || "None"}`,
          "Constraints: max 240 chars, no emojis unless absolutely natural, no hard selling."
        ].join("\n\n")
      }
    ]
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? fallbackReply(input);
  return text;
}

export async function generateTweet(input: TweetInput) {
  if (!openai) {
    return fallbackTweet(input);
  }

  const recentTweets = input.recentTweets.slice(0, 8).map((line, index) => `${index + 1}. ${normalizeText(line)}`);
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content:
          "You craft high-quality X posts for startup/creator audiences. Prioritize concrete insight and clarity. No spam language."
      },
      {
        role: "user",
        content: [
          `Language: ${input.language}`,
          `Topics: ${input.topics.join(", ") || "saas growth"}`,
          `Thread mode: ${input.threadMode ? "on" : "off"}`,
          `Avoid repeating these posts:\n${recentTweets.join("\n") || "None"}`,
          input.threadMode
            ? "Output exactly 3 lines, each <= 260 chars. Each line should be a thread part."
            : "Output exactly 1 standalone tweet <= 260 chars."
        ].join("\n\n")
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    return fallbackTweet(input);
  }
  return raw
    .split("\n")
    .map((line) => sanitizeLine(line))
    .filter(Boolean)
    .slice(0, input.threadMode ? 3 : 1);
}
