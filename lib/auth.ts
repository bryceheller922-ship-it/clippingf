import type { NextRequest } from 'next/server';
import { refreshTokens, type TikTokCreds } from './tiktok';
import { writeAccount, type StoredAccount } from './store';
import { getSettings } from './settings';

export function redirectUriFor(req: NextRequest): string {
  if (process.env.TIKTOK_REDIRECT_URI) return process.env.TIKTOK_REDIRECT_URI;
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  return `${proto}://${host}/api/auth/callback`;
}

/** TikTok developer-app credentials for a user, from their saved keys (env as fallback). */
export async function tiktokCredsFor(uid: string): Promise<TikTokCreds> {
  const s = await getSettings(uid);
  if (!s.tiktok_client_key || !s.tiktok_client_secret) {
    throw new Error('No TikTok app credentials — add your TikTok Client key + secret on the My Keys page');
  }
  return { client_key: s.tiktok_client_key, client_secret: s.tiktok_client_secret };
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Returns an account with a valid access token, refreshing and re-persisting
 * it when the current one is expired or about to expire. The refresh uses the
 * TikTok app credentials of whoever connected the account.
 */
export async function withFreshToken(acct: StoredAccount): Promise<StoredAccount> {
  if (Date.now() < acct.expires_at - REFRESH_MARGIN_MS) return acct;
  const creds = await tiktokCredsFor(acct.owner_uid ?? '');
  const tokens = await refreshTokens(creds, acct.refresh_token);
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
