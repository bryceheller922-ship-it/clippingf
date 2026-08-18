import { NextRequest, NextResponse } from 'next/server';
import { checkPublishStatus } from '@/lib/publish';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { openId, publishId } = await req.json().catch(() => ({}));
  if (!openId || !publishId) {
    return NextResponse.json({ error: 'openId and publishId are required' }, { status: 400 });
  }
  try {
    return NextResponse.json(await checkPublishStatus(openId, publishId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
