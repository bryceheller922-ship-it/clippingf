import { NextRequest, NextResponse } from 'next/server';
import { getHealth } from '@/lib/health';
import { getSettings } from '@/lib/settings';
import { getUid } from '@/lib/session';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// The Fixer: a troubleshooting assistant that sees a live health snapshot of
// the workspace and explains, step by step, how to fix what's broken. Runs on
// the requesting user's Groq key.

const FIXER_KNOWLEDGE = `
Platform knowledge you can rely on:
- Auth is Firebase (email/Google) with an ALLOWED_EMAILS allowlist env var on Vercel.
- Data lives in Supabase (docs table + public "clips" storage bucket, created by supabase/schema.sql). Free-tier bucket file limit defaults to 50MB.
- Every user saves their OWN keys on the My Keys page: TikTok Client key/secret (from developers.tiktok.com), Groq (console.groq.com/keys), Whop (whop.com/dashboard/developer), Browser Use (cloud.browser-use.com). Env vars are only fallbacks.
- TikTok: unaudited developer apps can only connect test accounts and direct posts are forced private (SELF_ONLY). The registered Redirect URI must exactly match https://<domain>/api/auth/callback. Access tokens last 24h (auto-refreshed), refresh tokens ~1 year (then reconnect).
- Whop has NO public API for Content Rewards clip submissions — submissions happen on the campaign page, ideally via an agent's browser_task with a logged-in Browser Use profile.
- Agents: "post_clip" and "browser_task" are opt-in permissions per agent. Groq-preset agents without their own key fall back to the invoking user's Groq key.
- Missions run via Vercel Cron hitting /api/autopilot/tick (needs CRON_SECRET env var); Hobby plan crons fire ~once a day; "Run now" always works. A mission runs with its creator's keys.
- Common publish failures: url_ownership_unverified / privacy fallback notes (unaudited app), spam_risk (posting too fast to too many accounts), file too large for the storage bucket, expired account session.
Answer with concrete, numbered steps naming the exact page/button/site. Be brief. Never invent settings that don't exist.`;

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  const { messages } = await req.json().catch(() => ({}));
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }

  const settings = await getSettings(uid);
  if (!settings.groq_api_key) {
    return NextResponse.json(
      { error: 'The Fixer needs your Groq API key — save one on the My Keys page (free at console.groq.com/keys).' },
      { status: 400 }
    );
  }

  const health = await getHealth(uid);
  const system = [
    'You are "The Fixer", the built-in troubleshooter for ClippingF, a clipping platform (multi-account TikTok posting, Whop earnings tracking, AI agent containers, autopilot missions).',
    FIXER_KNOWLEDGE,
    `Live workspace health snapshot (JSON):\n${JSON.stringify(health).slice(0, 14000)}`
  ].join('\n\n');

  const clean = (messages as { role: string; content: string }[])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.groq_api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      messages: [{ role: 'system', content: system }, ...clean]
    }),
    cache: 'no-store'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: `Groq error (HTTP ${res.status}): ${data?.error?.message ?? 'unknown'}` },
      { status: 502 }
    );
  }
  return NextResponse.json({ reply: data.choices?.[0]?.message?.content ?? '(no reply)' });
}
