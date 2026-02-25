import { createHash } from "crypto";

export function normalizeText(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function fingerprintText(input: string) {
  return createHash("sha256").update(normalizeText(input)).digest("hex");
}

export function containsExcludedWords(input: string, excludedWords: string[]) {
  const normalized = normalizeText(input);
  return excludedWords.some((word) => normalized.includes(normalizeText(word)));
}

export function isLikelySpam(input: string) {
  const normalized = normalizeText(input);
  if (normalized.length < 10) {
    return true;
  }
  const suspiciousPatterns = [/free money/i, /guaranteed/i, /dm me now/i, /100%/i];
  return suspiciousPatterns.some((pattern) => pattern.test(input));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomJitterMs(minMs = 1500, maxMs = 7000) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}
