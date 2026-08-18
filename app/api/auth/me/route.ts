import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.json({ user: await getUser(req) });
}
