import type { NextRequest, NextResponse } from 'next/server';
import { decrypt, encrypt, shortHash } from './crypto';

// Connected TikTok accounts are stored client-side: one encrypted, httpOnly
// cookie per account. No database needed, which keeps the app deployable on
// Vercel with zero extra infrastructure. Tokens never reach the browser in
// readable form.

export const ACCOUNT_COOKIE_PREFIX = 'ttacct_';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // matches TikTok refresh-token lifetime

export interface StoredAccount {
  open_id: string;
  display_name: string;
  avatar_url: string;
  access_token: string;
  refresh_token: string;
  /** epoch ms when access_token expires */
  expires_at: number;
  /** epoch ms when refresh_token expires */
  refresh_expires_at: number;
  scope: string;
}

export function cookieNameFor(openId: string): string {
  return ACCOUNT_COOKIE_PREFIX + shortHash(openId);
}

export function readAccounts(req: NextRequest): StoredAccount[] {
  const accounts: StoredAccount[] = [];
  for (const cookie of req.cookies.getAll()) {
    if (!cookie.name.startsWith(ACCOUNT_COOKIE_PREFIX)) continue;
    const json = decrypt(cookie.value);
    if (!json) continue;
    try {
      const acct = JSON.parse(json) as StoredAccount;
      if (acct.open_id && acct.refresh_token) accounts.push(acct);
    } catch {
      // corrupt cookie — ignore
    }
  }
  return accounts;
}

export function findAccount(req: NextRequest, openId: string): StoredAccount | null {
  return readAccounts(req).find((a) => a.open_id === openId) ?? null;
}

export function writeAccount(res: NextResponse, acct: StoredAccount): void {
  res.cookies.set(cookieNameFor(acct.open_id), encrypt(JSON.stringify(acct)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE
  });
}

export function deleteAccount(res: NextResponse, openId: string): void {
  res.cookies.set(cookieNameFor(openId), '', { path: '/', maxAge: 0 });
}
