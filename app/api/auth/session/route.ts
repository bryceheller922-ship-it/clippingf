import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseIdToken } from '@/lib/firebase-verify';
import { createSessionValue, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Exchange a Firebase ID token (from the login page) for an app session cookie.
export async function POST(req: NextRequest) {
  const { idToken } = await req.json().catch(() => ({}));
  if (!idToken) return NextResponse.json({ error: 'idToken required' }, { status: 400 });
  try {
    const user = await verifyFirebaseIdToken(String(idToken));
    const res = NextResponse.json({ ok: true, email: user.email });
    res.cookies.set(SESSION_COOKIE, await createSessionValue(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}
