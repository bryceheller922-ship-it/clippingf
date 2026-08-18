import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { getCompany, listPayments } from '@/lib/whop';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getSettings();
  if (!settings.whop_api_key) {
    return NextResponse.json({ connected: false, reason: 'No Whop API key saved in Settings' });
  }
  try {
    const company = await getCompany(settings.whop_api_key);
    let payments: unknown[] = [];
    try {
      payments = await listPayments(settings.whop_api_key);
    } catch {
      // payments scope may not be granted — connection is still valid
    }
    return NextResponse.json({ connected: true, company, payments });
  } catch (e) {
    return NextResponse.json({ connected: false, reason: (e as Error).message });
  }
}
