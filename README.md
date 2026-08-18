# Multi-TikTok Uploader

Upload a video once and post it to **multiple TikTok accounts at the same time**. Built with Next.js and deployable to Vercel with zero extra infrastructure — connected accounts are stored as encrypted, httpOnly cookies in your own browser, so there's no database to run.

It uses TikTok's official **Login Kit** (OAuth) and **Content Posting API**:

- Connect any number of TikTok accounts via OAuth
- Pick a video (MP4 / MOV / WebM, up to 4GB) — it uploads browser → Vercel Blob, then the server streams it to TikTok in chunks for each account
- **Post directly** (caption, privacy, comment/duet/stitch toggles) or **send as draft** to each account's TikTok inbox
- Live per-account status while TikTok processes each post

## 1. Create a TikTok developer app

1. Go to [developers.tiktok.com](https://developers.tiktok.com) → **Manage apps** → create an app.
2. Add the **Login Kit** and **Content Posting API** products to the app.
3. Under Login Kit, set the **Redirect URI** to:
   ```
   https://<your-vercel-domain>/api/auth/callback
   ```
   (add `http://localhost:3000/api/auth/callback` too if you want local dev — TikTok may require HTTPS, in which case use a tunnel like `ngrok`).
4. Request the scopes `user.info.basic`, `video.upload`, and `video.publish`.
5. Copy the app's **Client key** and **Client secret**.

> **Sandbox / audit note:** until TikTok approves (audits) your app, it runs in sandbox rules: only **test accounts you add in the developer portal** can authorize it, and direct posts are forced to **Private (only me)** visibility. The app handles this automatically (it falls back to `SELF_ONLY` and tells you). Submit the app for review in the developer portal to unlock public posting for any account.

## 2. Deploy to Vercel

1. Push this repo to GitHub and import it at [vercel.com/new](https://vercel.com/new) (defaults are fine — it's a standard Next.js app).
2. In the Vercel project, go to **Storage → Create → Blob** and attach a Blob store. This auto-adds the `BLOB_READ_WRITE_TOKEN` env var (needed because videos are too big for serverless request bodies — the browser uploads them to Blob, the server relays to TikTok).
3. Add these environment variables (Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `TIKTOK_CLIENT_KEY` | from the TikTok developer portal |
   | `TIKTOK_CLIENT_SECRET` | from the TikTok developer portal |
   | `SESSION_SECRET` | any long random string — `openssl rand -base64 48` |
   | `TIKTOK_REDIRECT_URI` | *(optional)* only if your redirect URI differs from `https://<domain>/api/auth/callback` |

4. Redeploy, open the site, and connect your accounts.

If the build complains about `maxDuration = 300` (some plans cap lower), lower the value at the top of `app/api/publish/route.ts` to `60`.

## 3. Use it

1. **Connect** each TikTok account. TikTok reuses your logged-in tiktok.com session, so to add a second account use *switch account* on TikTok's login screen (or log out of tiktok.com between connects).
2. **Pick a video**, write a caption, choose privacy, or switch to *Send as draft* to finish each post inside the TikTok app.
3. **Post** — every selected account gets the video in parallel, with live status per account.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

For Blob uploads locally, link the project and pull the token: `npx vercel link && npx vercel env pull .env.local`.

## How it works

```
browser ──(client upload)──▶ Vercel Blob
browser ──POST /api/publish (per account)──▶ serverless fn
   fn: refresh OAuth token if stale (rotating cookie store, AES-256-GCM encrypted)
   fn: POST /v2/post/publish/{video|inbox/video}/init/  → publish_id + upload_url
   fn: stream blob → TikTok upload_url (Range-based 10MB chunks, single chunk ≤ 64MB)
browser ──POST /api/publish/status (poll)──▶ /v2/post/publish/status/fetch/
browser ──POST /api/blob-delete──▶ blob cleanup
```

Tokens never reach the browser in readable form; each account lives in its own `ttacct_*` cookie encrypted with `SESSION_SECRET`. Access tokens auto-refresh (TikTok access tokens last 24h, refresh tokens ~1 year — after that the UI asks you to reconnect the account).

## Limits & notes

- TikTok caps: 4GB / 10 min video (per-account limits come from the creator info check), 2200-char captions.
- Very large files also have to fit through one serverless invocation per account (300s max duration) — typical clips are fine; multi-GB files may time out.
- TikTok's API requires showing the creator's real posting options — that's why direct posts validate privacy against each account's allowed options at post time.
- This posts the *same* video to all selected accounts. TikTok may flag duplicated content across accounts; use responsibly and per [TikTok's Community Guidelines](https://www.tiktok.com/community-guidelines) and developer terms.
