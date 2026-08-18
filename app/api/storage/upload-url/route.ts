import { NextRequest, NextResponse } from 'next/server';
import { createUploadUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Issues a short-lived signed URL so the browser uploads the video straight
// to Supabase Storage (no serverless body-size limit in the way).
export async function POST(req: NextRequest) {
  const { filename } = await req.json().catch(() => ({}));
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
  try {
    return NextResponse.json(await createUploadUrl(String(filename)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
