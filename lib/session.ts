// App sessions: after Firebase Auth verifies who you are (see
// firebase-verify.ts), we issue our own HMAC-signed cookie carrying uid +
// email. Implemented with Web Crypto so the same code runs in Edge middleware
// and Node route handlers.

export const SESSION_COOKIE = 'cf_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is not set');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toB64url(new Uint8Array(sig));
}

export interface SessionUser {
  uid: string;
  email: string;
}

export async function createSessionValue(user: SessionUser): Promise<string> {
  const body = toB64url(new TextEncoder().encode(JSON.stringify({ u: user.uid, e: user.email })));
  const payload = `${body}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionValue(value: string | undefined): Promise<SessionUser | null> {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [body, expStr, sig] = parts;
  const payload = `${body}.${expStr}`;
  try {
    if ((await hmac(payload)) !== sig) return null;
    if (Date.now() > Number(expStr)) return null;
    const parsed = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!parsed.u || !parsed.e) return null;
    return { uid: String(parsed.u), email: String(parsed.e) };
  } catch {
    return null;
  }
}

type CookieCarrier = { cookies: { get(name: string): { value: string } | undefined } };

/** The logged-in user (middleware already gates access, so this rarely misses). */
export async function getSession(req: CookieCarrier): Promise<SessionUser> {
  return (await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value)) ?? { uid: '', email: 'unknown' };
}

/** Display name for activity logs. */
export async function getUser(req: CookieCarrier): Promise<string> {
  return (await getSession(req)).email;
}

export async function getUid(req: CookieCarrier): Promise<string> {
  return (await getSession(req)).uid;
}
