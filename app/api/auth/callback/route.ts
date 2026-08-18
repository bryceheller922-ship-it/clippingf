import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, getUserInfo } from '@/lib/tiktok';
import { redirectUriFor } from '@/lib/auth';
import { writeAccount, type StoredAccount } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const home = new URL('/', url.origin);

  const fail = (msg: string) => {
    home.searchParams.set('error', msg);
    const res = NextResponse.redirect(home);
    res.cookies.set('tt_oauth_state', '', { path: '/', maxAge: 0 });
    return res;
  };

  const oauthError = url.searchParams.get('error');
  if (oauthError) return fail(url.searchParams.get('error_description') ?? oauthError);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = req.cookies.get('tt_oauth_state')?.value;
  if (!code) return fail('TikTok did not return an authorization code');
  if (!state || !expectedState || state !== expectedState) return fail('OAuth state mismatch — try connecting again');

  try {
    const tokens = await exchangeCode(code, redirectUriFor(req));
    const user = await getUserInfo(tokens.access_token);
    const acct: StoredAccount = {
      open_id: tokens.open_id,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
      refresh_expires_at: Date.now() + tokens.refresh_expires_in * 1000,
      scope: tokens.scope
    };
    home.searchParams.set('connected', user.display_name);
    const res = NextResponse.redirect(home);
    res.cookies.set('tt_oauth_state', '', { path: '/', maxAge: 0 });
    writeAccount(res, acct);
    return res;
  } catch (e) {
    return fail((e as Error).message);
  }
}
