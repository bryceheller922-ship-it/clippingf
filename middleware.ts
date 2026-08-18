import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionValue } from './lib/session';

// /api/autopilot/tick authenticates itself with CRON_SECRET (Vercel Cron).
const PUBLIC_PATHS = new Set(['/login', '/api/auth/session', '/api/autopilot/tick']);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const user = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const login = new URL('/login', req.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
