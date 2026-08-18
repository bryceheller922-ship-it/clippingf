import type { NextRequest } from 'next/server';
import { refreshTokens } from './tiktok';
import { writeAccount, type StoredAccount } from './store';

export function redirectUriFor(req: NextRequest): string {
  if (process.env.TIKTOK_REDIRECT_URI) return process.env.TIKTOK_REDIRECT_URI;
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  return `${proto}://${host}/api/auth/callback`;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Returns an account with a valid access token, refreshing and re-persisting
 * it to Redis when the current one is expired or about to expire.
 */
export async function withFreshToken(acct: StoredAccount): Promise<StoredAccount> {
  if (Date.now() < acct.expires_at - REFRESH_MARGIN_MS) return acct;
  const tokens = await refreshTokens(acct.refresh_token);
  const updated: StoredAccount = {
    ...acct,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    refresh_expires_at: Date.now() + tokens.refresh_expires_in * 1000,
    scope: tokens.scope
  };
  await writeAccount(updated);
  return updated;
}
