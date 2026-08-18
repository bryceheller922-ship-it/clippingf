# ClippingF — the clipping workspace

A self-hosted clipping platform for a small team, deployable on Vercel with a **100% in-browser setup** (no terminal anywhere). Upload clips once, post them to **multiple TikTok accounts** (same video everywhere, or different videos per account), keep a shared **clip library**, track **Whop earnings** per clip, watch the whole operation on a live **Ops Map**, and run **AI agent containers** — including **Autopilot missions** that work the pipeline on a schedule.

## Stack

- **Firebase Auth** — email/password + Google sign-in, gated by an `ALLOWED_EMAILS` allowlist so only you and your partner get in
- **Supabase** — Postgres (`docs` table) for all workspace data + Storage (public `clips` bucket) for video files, uploaded straight from the browser via signed URLs
- **Per-user keys** — every integration key (TikTok app credentials, Groq, Whop, Browser Use) is entered by each user in the app's **My Keys** page, encrypted at rest. Env vars are optional fallbacks only.
- **TikTok Content Posting API** — official multi-account posting (direct post or draft-to-inbox), using each user's own TikTok developer app credentials
- **Whop v5 API** — key verification + payments; per-clip Content Rewards tracking (Whop has **no public clip-submission API** — the browser agent covers that step)
- **Agent containers** — any AI API (Groq preset first-class, OpenAI/OpenRouter/Together/Anthropic/custom OpenAI-compatible), each with its own role, model, encrypted key, and per-tool permissions
- **Browser Use Cloud** — agents with the `browser_task` permission drive a real remote browser (persistent-login profiles, live view URL)
- **Autopilot** — missions run agents on a Vercel Cron schedule with full tool access
- **Ops Map** — a live node map of integrations, accounts, agents and missions: running missions pulse, problems flash red with a badge; click any node to investigate
- **The Fixer** — a built-in troubleshooting AI (uses your Groq key) that sees a live health snapshot of the workspace and walks you through fixes step by step

## Setup

### 1. Firebase (auth)

1. [console.firebase.google.com](https://console.firebase.google.com) → create a project → **Authentication** → enable **Email/Password** and **Google** sign-in.
2. Add a Web App (project settings) and copy `apiKey`, `authDomain`, `projectId` into the `NEXT_PUBLIC_FIREBASE_*` env vars.
3. Authentication → Settings → **Authorized domains**: add your Vercel domain.
4. Set `ALLOWED_EMAILS` to you + your partner's emails — anyone else who signs in is rejected at session time.

### 2. Supabase (data + video storage)

1. [supabase.com](https://supabase.com) → create a project.
2. SQL editor → run **`supabase/schema.sql`** (creates the `docs` table and the public `clips` storage bucket).
3. Settings → API → copy the **Project URL** → `SUPABASE_URL`, and the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-only; never exposed to the browser).
4. Storage → the `clips` bucket's file-size limit defaults to 50MB on the free tier — raise it in bucket settings if your clips are bigger.

### 3. Deploy to Vercel

Import the repo at [vercel.com/new](https://vercel.com/new) and set only these env vars (all in the dashboard — no terminal):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` | from Firebase |
| `ALLOWED_EMAILS` | `you@gmail.com,partner@gmail.com` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
| `SESSION_SECRET` | any long random string (32+ chars) — use a password generator |
| `CRON_SECRET` | another long random string — protects the Autopilot cron |

TikTok / Groq / Whop / Browser Use keys are **not** env vars — each user enters their own in the app (next step). The included `vercel.json` schedules the Autopilot cron hourly. **Vercel Hobby runs crons once a day** — missions still respect their own intervals, and the **Run now** button works any time. If the build rejects `maxDuration = 300`, lower it in the routes that set it.

### 4. Each user adds their keys (in the app)

After signing in, open **My Keys** and paste your own:

1. **TikTok developer app** — create one at [developers.tiktok.com](https://developers.tiktok.com) with **Login Kit** + **Content Posting API**, redirect URI `https://<your-vercel-domain>/api/auth/callback`, scopes `user.info.basic`, `video.upload`, `video.publish`. Paste its Client key + secret. (Until TikTok audits the app: test accounts only, direct posts forced private — handled automatically.)
2. **Groq** — free key at [console.groq.com/keys](https://console.groq.com/keys); powers your Groq-preset agents and the Fixer.
3. **Whop** — key from [whop.com/dashboard/developer](https://whop.com/dashboard/developer).
4. **Browser Use** — key from [cloud.browser-use.com](https://cloud.browser-use.com); lets agents drive a real browser.

Your partner does the same with their own keys. The **Ops Map** shows exactly which keys are still missing.

## Using it

- **Sign in** (top of everything): Firebase login; each member has their own identity and their own keys.
- **Accounts (top right)**: connect/disconnect the workspace's TikTok accounts (connected with, and refreshed by, your own TikTok app credentials).
- **Post**: add one or many videos; each video gets its own caption and its own set of target accounts — same video everywhere, or different videos to different accounts, in one click. Everything is saved to the Library.
- **Map**: the live Ops Map — integrations, accounts, agents, missions as connected nodes. Running missions pulse cyan, problems flash red with a `!` badge. Click a node to investigate; every problem comes with a fix hint and an **Investigate with the Fixer** button that opens the troubleshooting AI with full context.
- **Library**: repost clips, keep notes, track each clip's Whop campaign (URL, submitted post, status, views, earnings).
- **My Keys**: every member's own TikTok / Groq / Whop / Browser Use keys, encrypted at rest. Agents and tools use the keys of whoever invoked them.
- **Agents**: create agent containers; give trusted ones `post_clip` (publish to TikTok) and `browser_task` (drive a real browser via Browser Use profiles — that's how Whop submissions happen).
- **Autopilot missions** (on the Agents page): a standing goal + an agent + an interval. Each run the agent inspects the workspace, does what its tools allow, records state on clips, and files a report. Example goal:
  > Check the clip library for ready clips. Write strong captions and post each to all TikTok accounts. Then use browser_task with the "whop" profile to submit the posted TikTok URLs to our campaign at https://whop.com/… and update each clip's Whop tracking. Report earnings changes.

## What's automated vs. not (honest edition)

| Step | Status |
|---|---|
| Posting to many TikTok accounts | ✅ official API, fully automated (agents can do it via `post_clip`) |
| Whop campaign submission | ✅ via browser agent + logged-in Whop profile (no public API exists) |
| Whop earnings/status tracking | ✅ tracked per clip; agents read/update it; payments visible via Whop API where the key allows |
| Finding campaigns / research | ✅ browser agent can browse and report |
| **Cutting clips from source videos** | ⚠️ not server-side — there's no video editor in a serverless function. Agents can research and propose clips (source, timestamps, hooks) in their reports; you cut and upload. |
| **Instagram posting** | ⚠️ not wired in — Instagram's official content API requires a Business/Creator account + Meta app review. Agents can attempt it via `browser_task`, but automating instagram.com violates their ToS and risks bans, same as TikTok UI automation. |
| TikTok via browser automation | ❌ deliberately not — ToS violation + ban risk; the official API does this properly |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Notes

- All secrets (TikTok tokens, agent keys, user API keys) are AES-256-GCM encrypted at rest in Supabase; sessions are HMAC-signed cookies issued after Firebase ID-token verification.
- One serverless invocation per account per post (≤300s); TikTok caps: 4GB / 10 min, 2200-char captions.
- Duplicated content across many accounts can trip TikTok's rules — vary captions/timing and follow [TikTok's Community Guidelines](https://www.tiktok.com/community-guidelines) and each Whop campaign's rules.
