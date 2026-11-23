# Swipe: social media management platform

Swipe puts every social account in one workspace. You can publish across 12 networks, schedule on a calendar, reply from a unified inbox, use AI that writes in your brand voice, and see analytics where each number shows its source. It runs multi-tenant, with agencies and teams in mind.

> **Honesty principle:** Swipe only claims what it can do. Each network's capabilities live in one registry (`src/lib/platforms/registry.ts`) and are shown in the UI as *Supported*, *Limited* or *Unavailable*, with the reason. Metrics a network doesn't expose show as "unavailable" and are never estimated. Demo accounts can only exist when `DEMO_MODE=true`. They are labelled **DEMO** everywhere, and their "publishing" is recorded as *simulated*.

## Quick start

```bash
cp .env.example .env          # then fill TOKEN_ENCRYPTION_KEY and APP_SECRET (see comments)
docker compose up -d db       # or point DATABASE_URL at any Postgres 14+
npm install
npx prisma migrate deploy
DEMO_MODE=true npm run db:seed   # optional: demo workspace (demo@swipe.local / swipe-demo-2026)
npm run build && npm start    # web app on :3000
npm run worker                # background worker (publishing, automations, metrics, token refresh)
```

The worker is required in production (or, on serverless hosts, the cron endpoint below). Without it, scheduled posts are never sent. You can run several worker instances: jobs are claimed with `FOR UPDATE SKIP LOCKED`, so two workers never pick up the same job. `/api/health` reports DB status and any overdue publishes.

## Deploying to Vercel

1. **Database:** create a Postgres database (Neon works well). Set `DATABASE_URL` to the *pooled* connection string and `DATABASE_URL_UNPOOLED` to the *direct* one (Vercel's Neon add-on sets both automatically).
2. **Media storage:** Vercel has no persistent disk, so set `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (Cloudflare R2: `S3_REGION=auto`, endpoint `https://<account-id>.r2.cloudflarestorage.com`). Browsers upload straight to the bucket, so add a CORS rule allowing `PUT` and `GET` from your site's origin with the `Content-Type` header.
3. **Environment variables:** copy everything from `.env.example` into the Vercel project, with `APP_URL` set to the deployed URL and `DEMO_MODE=false` for real use.
4. **Background jobs:** there's no long-running worker on Vercel. `/api/cron/tick` runs every job (publishing, automations, inbox polling, metrics, token refresh) when called with `Authorization: Bearer $CRON_SECRET`. Call it every minute:
   - **Vercel Pro:** add `"crons": [{ "path": "/api/cron/tick", "schedule": "* * * * *" }]` to `vercel.json`. Vercel sends the secret automatically.
   - **Vercel Hobby** (cron limited to once a day): use a free external scheduler such as cron-job.org to `GET https://<your-site>/api/cron/tick` every minute with the `Authorization` header.
5. Deploy. The build runs `prisma migrate deploy` first.

## What's built

| Area | Status |
|---|---|
| Auth | Email + password (bcrypt), httpOnly DB sessions, login rate-limiting + lockout, password change signs out other devices, optional TOTP two-factor (authenticator apps) with single-use recovery codes and replay protection |
| Workspaces & orgs | Multiple workspaces per organisation, workspace switcher, strict per-workspace scoping on every query |
| Roles | Owner, Admin, Social media manager, Content creator, Support agent, Analyst, Approver (permission matrix in `src/lib/rbac.ts`) |
| Accounts | OAuth (PKCE where supported) for Meta (FB Pages, Instagram), Threads, LinkedIn, X, YouTube, TikTok, Pinterest, Reddit, Snapchat; bot-token connect for Telegram; System-User token for WhatsApp. Multiple accounts per network, reconnect, disconnect + remote revoke where the API allows, permission scopes shown, brand assignment, default accounts |
| Token security | AES-256-GCM encryption at rest, never sent to the browser, refreshed automatically before expiry, auth failures flag the account "Needs reconnect" and notify admins |
| Publisher | Write once, customise per destination, per-network fields (Pinterest board, subreddit, YouTube visibility, TikTok privacy, IG first comment), live server-side validation against each network's limits, previews, media ordering, alt text, publish now / schedule / draft, recurring posts, duplicate, edit, delete |
| Publishing engine | Each destination is a separate job with its own status, retries with exponential backoff on transient errors, publishing log, retry button, failure notifications. A crashed worker never double-posts: interrupted jobs are marked failed with a warning to check before retrying |
| Approvals | Optional per-workspace approval, submit, approve / request changes, internal comments, notifications |
| Calendar | Month / week / day / list / campaign views, drag-and-drop rescheduling, filters, content-gap shading, preferred posting slots, timezone aware |
| Unified inbox | Folders (open, unread, read, awaiting reply, mine, unassigned, priority, pending, resolved, archived), type and network filters, search, assignment, internal notes, tags, priority, mark unread, saved replies with `{name}`, emoji, AI reply suggestions with tone rewrite, sensitive-topic warning, Meta 24-hour window enforcement, polling refresh |
| Webhooks | Meta (Messenger, Page comments, IG DMs / comments / mentions, WhatsApp) with `X-Hub-Signature-256` verification; Telegram with per-account secret header; idempotent ingestion |
| AI (Claude) | Generate 15 content types, rewrite / tone / length / translate / audience, per-network tailoring (structured output), article → posts, reply suggestions, analytics explanation, content review, campaign calendar drafts, chat with workspace context. Per-brand voice profiles, plan-metered usage, refusal handling, never auto-publishes |
| Analytics | Follower history, post-level likes / comments / shares / saves / views / reach where exposed, by network, by content type, top posts, engagement rate, every figure labelled with source and period; CSV export, printable PDF report, AI explanation |
| Media library | Upload with progress, magic-byte type checking, dimensions and duration detection, folders, tags, alt text, search, per-network compatibility check, signed expiring URLs for networks that pull media |
| Campaigns | Brief, goals, dates, accounts, team, colour, posts grouped by status, assets, performance, AI content calendar |
| CRM | Contacts created from conversations, status (lead / customer / VIP…), tags, owner, notes, history, privacy erase |
| Automations | Trigger → conditions → actions builder, 7 templates (the brief's examples), run history, pause / resume, failure alerts. AI actions only create drafts and flag sensitive messages for a human |
| Notifications | In-app centre, per-type in-app / email preferences (email via Resend), reminders 15 min before publishing |
| Billing | Free / Starter / Professional / Agency in `src/lib/plans.ts`, monthly and annual Stripe Checkout, Customer Portal, cancel / resume, webhook-synced status, invoices, 14-day trial, plan limits enforced server-side, usage meters |
| Admin console | Users, active users, plans and estimated MRR, integration configuration and breakage, failures by error code, AI and storage usage, plan overrides, user disable, feature flags, support tickets, system log. No access to conversation content |
| Privacy | JSON workspace export (no tokens), delete workspace, delete account, erase contact, audit log of sensitive actions |

## Network support (what the official APIs allow)

| Network | Publish | Inbox | Analytics | Notes |
|---|---|---|---|---|
| Facebook Pages | text, link, photos, multi-photo, video | Messenger, comments | followers, post reactions / comments / shares | Pages only (Meta doesn't allow profiles or Groups) |
| Instagram (Professional) | image, carousel, Reel, first comment | DMs, comments, mentions | followers, likes, comments, reach, saves, views | Needs a public `APP_URL` so Meta can fetch media |
| Threads | text, image, video, carousel | replies on recent posts (polled) | followers, views, likes | |
| LinkedIn | text, link, single image | n/a (no API) | limited | Company pages need Community Management API approval |
| YouTube | video upload (resumable), title, visibility | comments + replies (polled) | subscribers, views, per-video stats | Unverified Google projects upload as private |
| X | text, links, up to 4 images with alt text | mentions and replies (polled) | followers, post metrics | Read endpoints need a paid X API tier; video upload not yet implemented |
| TikTok | video (PULL_FROM_URL) | n/a | followers, likes | Private-only until TikTok audits your app |
| Pinterest | image pin to board | n/a | followers, pin analytics | |
| Reddit | text and link posts to a subreddit | private messages, replies, mentions (polled) | karma, score | Follow each community's rules |
| Telegram | text, photo, video, albums to channels | bot DMs, discussion-group comments | subscribers | Bot must be a channel admin |
| WhatsApp Business | n/a (no public feed) | full conversations | n/a | Free-form replies only within 24 h |
| Snapchat | n/a | n/a | n/a | Public Profile API is partner-only; shown as unavailable |

## Architecture

```
Next.js 15 (App Router, server actions) ─┐
                                         ├── PostgreSQL (Prisma) ── single source of truth, also the job queue & rate limiter
Worker (scripts/worker.ts) ──────────────┘      │
  • claims due PostTargets (SKIP LOCKED) ─► platform adapters ─► official APIs
  • processes JobEvent outbox ─► automation engine
  • token refresh · follower + post metrics sync · reminders
Webhooks ─► ingest() (idempotent) ─► Conversation/Message/Contact ─► notifications + events
```

- `src/lib/platforms/`: the registry, validation rules, OAuth providers and one adapter per network. Adding a capability means adding the adapter method and updating the registry status.
- `src/lib/publishing.ts`: post lifecycle, approvals, the queue claim and status roll-up.
- `src/lib/ai.ts`: every Claude call (Anthropic SDK, `claude-opus-5-5` by default, server-side refusal fallback enabled), with brand context, metering and plan limits.
- Postgres is the queue, outbox and rate limiter, so a deployment needs no Redis. If volume needs it later, swap `claimDueTargets` and `rateLimit` for Redis or BullMQ.
- Storage is local disk by default; set `S3_BUCKET` (plus endpoint and keys) to use S3, Cloudflare R2 or MinIO. Media is then served through short-lived presigned URLs.
- Networks without webhooks (YouTube, Reddit, X, Threads) are polled by the worker with a per-account cursor, backing off up to an hour on rate limits or paid-tier errors.

## Configuring networks

Create a developer app with each network, set the redirect URI to `${APP_URL}/api/oauth/<platform>/callback`, and put the keys in `.env`. Platforms without keys show "Not configured" and can't be connected. For Meta webhooks, point the app's webhook to `${APP_URL}/api/webhooks/meta` with `META_WEBHOOK_VERIFY_TOKEN`. Stripe's webhook goes to `/api/webhooks/stripe`.

## Tests

```bash
npm test        # unit (crypto, validation, RBAC, automations, media) + DB integration (approvals, queue locking, tenancy)
```

## Known gaps / next steps

- X video, LinkedIn video and multi-image, Pinterest video, TikTok photo posts, Reddit native images.
- LinkedIn inbox (partner access only); X direct messages.
- Browser push notifications; SSO; Meta App Review and the platform audits each network requires before production use.
- The AI features are type-checked against the Anthropic SDK but need an `ANTHROPIC_API_KEY` to exercise.
