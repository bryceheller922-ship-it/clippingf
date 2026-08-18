import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { buildAuthUrl } from '@/lib/tiktok';
import { redirectUriFor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const state = randomBytes(16).toString('hex');
  let authUrl: string;
  try {
    authUrl = buildAuthUrl(redirectUriFor(req), state);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const res = NextResponse.redirect(authUrl);
  res.cookies.set('tt_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600
  });
  return res;
}
