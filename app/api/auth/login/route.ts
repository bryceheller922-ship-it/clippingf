import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createSessionValue, parseUsers, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

function safeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const users = parseUsers();
  if (users.length === 0) {
    return NextResponse.json(
      { error: 'No users configured. Set the APP_USERS env var, e.g. APP_USERS="bryce:secret,partner:secret2"' },
      { status: 500 }
    );
  }
  const user = users.find((u) => u.name === username && safeEquals(u.pass, String(password ?? '')));
  if (!user) return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });

  const res = NextResponse.json({ ok: true, user: user.name });
  res.cookies.set(SESSION_COOKIE, await createSessionValue(user.name), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  });
  return res;
}
