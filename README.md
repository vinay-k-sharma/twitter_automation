# X Growth Autopilot (Next.js MVP)

Production-style MVP for discovering tweets, generating human-like replies, engaging safely, and auto-posting while enforcing strict plan/rate limits.

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Prisma
- Redis + BullMQ workers
- OpenAI for generation + moderation
- X OAuth 2.0 + X API v2

## Core Capabilities

- Connect X account via OAuth
- Store encrypted access/refresh tokens
- Enforce hard limits using internal SaaS plan + X API tier
- Discover tweets by topic/language/filters with duplicate/replied protection
- Generate natural replies with tone/CTA/bio context
- Optional like/follow actions (follow restricted to premium plans)
- Generate and auto-post tweets/threads within configured windows
- Safety layer: random jitter, moderation, anti-spam, hourly/daily caps

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Start local infra (Postgres + Redis)

```bash
docker compose up -d
```

3) Configure env

```bash
cp .env.example .env
cp .env.example .env.local
openssl rand -base64 32
```

Use the generated value for `TOKEN_ENCRYPTION_KEY`.

4) Generate Prisma client and migrate

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5) Run app + worker

```bash
npm run dev
npm run worker
```

6) Open app

- http://localhost:3000
- Login using the in-app demo login form
- In dashboard, save BYOA X app credentials, then connect X account

## OAuth Configuration (BYOA-first)

- Preferred: each user stores their own Client ID/Secret from dashboard (`/api/x/credentials`)
- Fallback: `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `X_CALLBACK_URL` can still be set globally in env
- In your X app settings, callback URL must match:
  - `http://localhost:3000/api/x/callback`
- Ensure scopes include:
  - `tweet.read tweet.write users.read like.write follows.write offline.access`

## Scheduler

This app provides `POST /api/scheduler/tick` (protected by `SCHEDULER_SECRET`) to enqueue:

- discovery jobs
- engagement jobs
- auto-tweet jobs

For production, trigger this endpoint from a cron service (e.g. Vercel Cron, GitHub Actions, or your cloud scheduler).
`AUTOPOST_CRON` should run frequently (recommended every 5 minutes) so per-user `frequencyMinutes`
and posting windows are evaluated accurately by the worker.

Example scheduler call:

```bash
curl -X POST "http://localhost:3000/api/scheduler/tick" \
  -H "x-scheduler-secret: change-me"
```

Manual secure trigger endpoint is also available:

- `POST /api/cron/trigger` with header `Authorization: Bearer <CRON_SECRET>`
- Body: `{ "userId": "<id>", "type": "discovery" | "engage" | "autopost" }`

## Auto Tweet Posting

Per user configuration is stored in `AutoTweetConfig` and supports:

- topics (deduplicated + normalized)
- frequency in minutes (`15-1440`)
- posting window (`HH:mm`, start=end means 24h window)
- thread mode on/off

Execution behavior:

- If not due yet or outside posting window, run is skipped safely.
- If enabled and due, the system generates one post (or a 3-part thread), moderates each part,
  checks duplicate fingerprints, enforces hard caps, then posts to X.
- Thread mode posts sequential replies (part 2 replies to part 1, etc.) to keep a coherent thread.
- `POST /api/x/autopost` follows the normal queue path (same as production behavior).
- For local smoke tests only, `POST /api/x/autopost?mode=inline&force=1` executes inline immediately.

## Important Notes

- This is an MVP with strict safety defaults.
- Respect all X policy and product constraints.
- Keep OpenAI + X keys private.
- Tune limits conservatively before production rollout.
