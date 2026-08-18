import { NextRequest, NextResponse } from 'next/server';
import { getSettings, maskSecret, patchSettings } from '@/lib/settings';
import { getSession } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await getSettings((await getSession(req)).uid);
  return NextResponse.json({
    whop_api_key_masked: maskSecret(s.whop_api_key),
    groq_api_key_masked: maskSecret(s.groq_api_key),
    browseruse_api_key_masked: maskSecret(s.browseruse_api_key),
    default_hashtags: s.default_hashtags ?? ''
  });
}

export async function PATCH(req: NextRequest) {
  const patch = await req.json().catch(() => ({}));
  const user = await getSession(req);
  await patchSettings(user.uid, patch);
  await logActivity(user.email, 'settings', `Updated their API keys (${Object.keys(patch).join(', ')})`);
  return NextResponse.json({ ok: true });
}
