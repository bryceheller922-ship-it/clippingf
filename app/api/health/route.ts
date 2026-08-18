import { NextRequest, NextResponse } from 'next/server';
import { getHealth } from '@/lib/health';
import { getUid } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await getHealth(await getUid(req)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
