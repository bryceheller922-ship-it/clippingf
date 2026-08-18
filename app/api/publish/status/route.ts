import { NextRequest, NextResponse } from 'next/server';
import { findAccount } from '@/lib/store';
import { withFreshToken } from '@/lib/auth';
import { fetchPublishStatus } from '@/lib/tiktok';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { openId, publishId } = await req.json().catch(() => ({}));
  if (!openId || !publishId) {
    return NextResponse.json({ error: 'openId and publishId are required' }, { status: 400 });
  }
  const stored = findAccount(req, openId);
  if (!stored) return NextResponse.json({ error: 'Account not connected' }, { status: 404 });

  const res = NextResponse.json({});
  try {
    const acct = await withFreshToken(stored, res);
    const status = await fetchPublishStatus(acct.access_token, publishId);
    const out = NextResponse.json(status);
    res.headers.getSetCookie().forEach((c) => out.headers.append('Set-Cookie', c));
    return out;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
