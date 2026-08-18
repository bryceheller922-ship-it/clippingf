// Cookie sessions for the two-person workspace. Users come from the APP_USERS
// env var ("bryce:secret,partner:othersecret"). Implemented with Web Crypto so
// the same code runs in Edge middleware and Node route handlers.

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

export function parseUsers(): { name: string; pass: string }[] {
  return (process.env.APP_USERS ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(':');
      return i > 0 ? { name: pair.slice(0, i), pass: pair.slice(i + 1) } : null;
    })
    .filter((u): u is { name: string; pass: string } => !!u);
}

export async function createSessionValue(username: string): Promise<string> {
  const payload = `${toB64url(new TextEncoder().encode(username))}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionValue(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [userB64, expStr, sig] = parts;
  const payload = `${userB64}.${expStr}`;
  try {
    if ((await hmac(payload)) !== sig) return null;
  } catch {
    return null;
  }
  if (Date.now() > Number(expStr)) return null;
  try {
    return new TextDecoder().decode(fromB64url(userB64));
  } catch {
    return null;
  }
}

/** Reads the logged-in username from a request (middleware already gates access). */
export async function getUser(req: { cookies: { get(name: string): { value: string } | undefined } }): Promise<string> {
  return (await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value)) ?? 'unknown';
}
