import { loadEnvConfig } from "@next/env";
import { z } from "zod";

const globalForEnv = globalThis as unknown as { envLoaded?: boolean };
if (!globalForEnv.envLoaded) {
  loadEnvConfig(process.cwd());
  globalForEnv.envLoaded = true;
}

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SCHEDULER_SECRET: z.string().min(1).default("change-me"),
  CRON_SECRET: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  X_CALLBACK_URL: z.string().url().optional(),
  X_OAUTH_AUTHORIZE_URL: z.string().url().default("https://x.com/i/oauth2/authorize"),
  X_OAUTH_TOKEN_URL: z.string().url().default("https://api.x.com/2/oauth2/token"),
  X_API_BASE_URL: z.string().url().default("https://api.x.com/2"),
  X_SCOPES: z.string().default("tweet.read tweet.write users.read like.write follows.write offline.access"),
  X_ALLOW_INSECURE_TLS: z.string().optional(),
  DISCOVERY_CRON: z.string().default("*/30 * * * *"),
  ENGAGEMENT_CRON: z.string().default("*/5 * * * *"),
  AUTOPOST_CRON: z.string().default("*/5 * * * *")
});

export const env = envSchema.parse({
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  SCHEDULER_SECRET: process.env.SCHEDULER_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  X_CLIENT_ID: process.env.X_CLIENT_ID,
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
  X_CALLBACK_URL: process.env.X_CALLBACK_URL,
  X_OAUTH_AUTHORIZE_URL: process.env.X_OAUTH_AUTHORIZE_URL,
  X_OAUTH_TOKEN_URL: process.env.X_OAUTH_TOKEN_URL,
  X_API_BASE_URL: process.env.X_API_BASE_URL,
  X_SCOPES: process.env.X_SCOPES,
  X_ALLOW_INSECURE_TLS: process.env.X_ALLOW_INSECURE_TLS,
  DISCOVERY_CRON: process.env.DISCOVERY_CRON,
  ENGAGEMENT_CRON: process.env.ENGAGEMENT_CRON,
  AUTOPOST_CRON: process.env.AUTOPOST_CRON
});
