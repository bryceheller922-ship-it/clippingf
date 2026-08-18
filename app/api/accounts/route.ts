import { NextRequest, NextResponse } from 'next/server';
import { readAccounts, deleteAccount } from '@/lib/store';
import { withFreshToken } from '@/lib/auth';
import { getUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const accounts = [];
  for (const acct of await readAccounts()) {
    let status: 'ok' | 'reauth_needed' = 'ok';
    let fresh = acct;
    if (Date.now() > acct.refresh_expires_at) {
      status = 'reauth_needed';
    } else {
      try {
        fresh = await withFreshToken(acct);
      } catch {
        status = 'reauth_needed';
      }
    }
    accounts.push({
      open_id: fresh.open_id,
      display_name: fresh.display_name,
      avatar_url: fresh.avatar_url,
      added_by: fresh.added_by,
      status
    });
  }
  return NextResponse.json({ accounts });
}

export async function DELETE(req: NextRequest) {
  const { openId } = await req.json().catch(() => ({}));
  if (!openId) return NextResponse.json({ error: 'openId required' }, { status: 400 });
  await deleteAccount(openId);
  await logActivity(await getUser(req), 'disconnect_account', `Disconnected a TikTok account`);
  return NextResponse.json({ ok: true });
}
