# ClippingF — the clipping workspace

A self-hosted clipping platform for a small team, deployable on Vercel. Upload a clip once, post it to **every connected TikTok account at the same time**, keep a shared **clip library**, track **Whop earnings** per clip, and run **AI agent containers** (Groq, OpenAI, Anthropic, OpenRouter, or any OpenAI-compatible API) that help manage the operation.

## What's inside

- **Multi-account TikTok posting** — official Login Kit + Content Posting API. Direct post (caption, privacy, comment/duet/stitch toggles) or send-as-draft to each account's TikTok inbox. Live per-account publish status.
- **Team workspace** — you and your business partner each get a login (`APP_USERS` env var). TikTok accounts, clips, agents and settings are shared; an activity log shows who (or which agent) did what.
- **Clip library** — every upload is stored (Vercel Blob + Upstash Redis metadata) with title, notes, posting history, and one-click reposting to any set of accounts.
- **Whop integration** — connect your Whop API key (verified against the Whop v5 API, shows your company + recent payments where the key allows). Per-clip Content Rewards tracking: campaign URL, submitted post URL, status, views, earnings.
  > **Reality check:** Whop's public API has **no endpoint for submitting clips to Content Rewards campaigns** — submissions are done on the Whop campaign page. The Library gives you a fast submit-and-track loop instead, and agents can read/update the tracking.
- **Agent containers** — plug in any AI API key and spin up agents with their own role, model, and permissions. Groq is a first-class preset (a free Groq key powers your whole agent team). Agents get real tools: list/inspect/update clips, write captions, check Whop status, read the activity log, and — only if you enable it per agent — **post clips to TikTok themselves**.

## Setup

### 1. TikTok developer app

1. [developers.tiktok.com](https://developers.tiktok.com) → create an app, add **Login Kit** + **Content Posting API**.
2. Redirect URI: `https://<your-vercel-domain>/api/auth/callback`.
3. Scopes: `user.info.basic`, `video.upload`, `video.publish`.
4. Copy the Client key and secret.

> **Sandbox note:** until TikTok audits your app, only test accounts added in the developer portal can connect and direct posts are forced to **Private (only me)**. The app handles this automatically. Submit for review to unlock public posting.

### 2. Deploy to Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. **Storage → Blob** — attach a Blob store (video files; adds `BLOB_READ_WRITE_TOKEN`).
3. **Storage → Upstash for Redis** — attach a Redis store (shared workspace data; adds `KV_REST_API_URL`/`KV_REST_API_TOKEN`).
4. Environment variables:

   | Variable | Value |
   |---|---|
   | `APP_USERS` | `bryce:yourpassword,partner:theirpassword` |
   | `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | from TikTok developer portal |
   | `SESSION_SECRET` | long random string — `openssl rand -base64 48` |
   | `GROQ_API_KEY` | *(optional)* from [console.groq.com](https://console.groq.com/keys); can also be set in Settings |
   | `WHOP_API_KEY` | *(optional)* from [whop.com/dashboard/developer](https://whop.com/dashboard/developer); can also be set in Settings |
   | `TIKTOK_REDIRECT_URI` | *(optional)* only if it differs from `https://<domain>/api/auth/callback` |

5. Deploy, sign in, connect TikTok accounts, add agents.

If the build rejects `maxDuration = 300` (plan limit), lower it in `app/api/publish/route.ts` and `app/api/agents/[id]/chat/route.ts`.

## Using it

- **Post** — pick accounts, drop a video, caption it, post. The clip lands in the Library automatically. To connect a second TikTok account, use *switch account* on TikTok's login screen.
- **Library** — repost any clip to any accounts, keep notes, and run the Whop loop: post → open campaign → submit your post URL on Whop → track status/views/earnings on the clip.
- **Agents** — create a container per job: a Groq caption writer, an Anthropic strategist, a manager with `post_clip` rights that can publish for you after you confirm in chat. Each agent's key is stored encrypted; each tool is opt-in per agent (`post_clip` is off by default).
- **Settings** — Whop key + connection test, workspace Groq key, default hashtags.

## Architecture

```
Auth      APP_USERS env → HMAC-signed session cookie (middleware-gated)
Storage   Vercel Blob (videos) + Upstash Redis (accounts, clips, agents,
          settings, activity) — secrets AES-256-GCM encrypted at rest
Posting   browser → Blob (client upload, dodges the 4.5MB fn limit)
          → /api/publish per account → TikTok init + chunked upload
          → status polling via /v2/post/publish/status/fetch/
Agents    /api/agents/[id]/chat → provider API (OpenAI-compatible or
          Anthropic) ⇄ tool loop over platform tools (max 8 rounds)
Whop      v5 REST (Bearer key): company verify + payments; submissions
          tracked per clip (no public submissions API exists)
```

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npx vercel link && npx vercel env pull .env.local   # pulls Blob/Redis tokens
npm run dev
```

## Limits & notes

- TikTok: 4GB / 10 min max video, 2200-char captions, per-account limits come from the creator-info check at post time.
- One serverless invocation per account per post (300s cap) — typical clips are fine, multi-GB files may time out.
- Agents with `post_clip` can publish real content — give that permission only to agents/prompts you trust, and prefer models with solid tool-calling (Groq `llama-3.3-70b-versatile` works well).
- Posting identical videos across many accounts can trip TikTok's duplicated-content rules; vary captions/timing and follow [TikTok's Community Guidelines](https://www.tiktok.com/community-guidelines) and Whop campaign rules.
