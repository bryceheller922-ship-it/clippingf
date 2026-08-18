import { NextRequest, NextResponse } from 'next/server';
import { runDueMissions } from '@/lib/missions';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Hit by Vercel Cron (see vercel.json). Middleware lets this path through;
// the CRON_SECRET check here is the gate.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runDueMissions(3);
  return NextResponse.json(result);
}
