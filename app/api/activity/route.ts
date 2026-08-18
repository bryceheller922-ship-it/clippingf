import { NextResponse } from 'next/server';
import { getActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ activity: await getActivity(50) });
}
