import { NextRequest, NextResponse } from 'next/server';
import { readAccounts, deleteAccount } from '@/lib/store';
import { withFreshToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const res = NextResponse.json({ accounts: [] as unknown[] });
  const accounts = [];
  for (const acct of readAccounts(req)) {
    let status: 'ok' | 'reauth_needed' = 'ok';
    let fresh = acct;
    if (Date.now() > acct.refresh_expires_at) {
      status = 'reauth_needed';
    } else {
      try {
        fresh = await withFreshToken(acct, res);
      } catch {
        status = 'reauth_needed';
      }
    }
    accounts.push({
      open_id: fresh.open_id,
      display_name: fresh.display_name,
      avatar_url: fresh.avatar_url,
      status
    });
  }
  // NextResponse.json body is fixed at construction, so rebuild with data while
  // keeping any Set-Cookie headers added by token refreshes.
  const out = NextResponse.json({ accounts });
  res.headers.getSetCookie().forEach((c) => out.headers.append('Set-Cookie', c));
  return out;
}

export async function DELETE(req: NextRequest) {
  const { openId } = await req.json().catch(() => ({}));
  if (!openId) return NextResponse.json({ error: 'openId required' }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  deleteAccount(res, openId);
  return res;
}
