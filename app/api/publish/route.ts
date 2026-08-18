import { NextRequest, NextResponse } from 'next/server';
import { publishToAccount } from '@/lib/publish';
import { getUser } from '@/lib/session';

// Downloading the video from Blob and re-uploading it to TikTok can take a
// while for big files. Lower this to 60 if your Vercel plan rejects it.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { openId, videoUrl, videoSize, title, privacyLevel, mode, clipId } = body as Record<string, string>;
  if (!openId || !videoUrl || !videoSize || !mode) {
    return NextResponse.json({ error: 'openId, videoUrl, videoSize and mode are required' }, { status: 400 });
  }

  try {
    const result = await publishToAccount({
      openId,
      videoUrl,
      videoSize: Number(videoSize),
      title: title ?? '',
      privacyLevel: privacyLevel ?? 'SELF_ONLY',
      mode: mode as 'DIRECT_POST' | 'DRAFT',
      disableComment: !!body.disableComment,
      disableDuet: !!body.disableDuet,
      disableStitch: !!body.disableStitch,
      clipId,
      actor: await getUser(req)
    });
    return NextResponse.json({ publishId: result.publishId, note: result.note });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
