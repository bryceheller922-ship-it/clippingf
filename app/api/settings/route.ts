import { NextRequest, NextResponse } from 'next/server';
import { getSettings, maskSecret, patchSettings } from '@/lib/settings';
import { getUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  return NextResponse.json({
    whop_api_key_masked: maskSecret(s.whop_api_key),
    groq_api_key_masked: maskSecret(s.groq_api_key),
    default_hashtags: s.default_hashtags ?? ''
  });
}

export async function PATCH(req: NextRequest) {
  const patch = await req.json().catch(() => ({}));
  await patchSettings(patch);
  await logActivity(await getUser(req), 'settings', `Updated settings (${Object.keys(patch).join(', ')})`);
  return NextResponse.json({ ok: true });
}
