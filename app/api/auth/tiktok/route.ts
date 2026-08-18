import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { buildAuthUrl } from '@/lib/tiktok';
import { redirectUriFor, tiktokCredsFor } from '@/lib/auth';
import { getUid } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const state = randomBytes(16).toString('hex');
  let authUrl: string;
  try {
    const creds = await tiktokCredsFor(await getUid(req));
    authUrl = buildAuthUrl(creds, redirectUriFor(req), state);
  } catch (e) {
    const back = new URL('/accounts', req.url);
    back.searchParams.set('error', (e as Error).message);
    return NextResponse.redirect(back);
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
