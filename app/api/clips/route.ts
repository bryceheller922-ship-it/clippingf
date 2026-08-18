import { NextRequest, NextResponse } from 'next/server';
import { createClip, listClips } from '@/lib/clips';
import { isStorageUrl } from '@/lib/storage';
import { getUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ clips: await listClips() });
}

export async function POST(req: NextRequest) {
  const { title, filename, blobUrl, size } = await req.json().catch(() => ({}));
  if (!blobUrl || !size || !isStorageUrl(blobUrl)) {
    return NextResponse.json({ error: 'blobUrl (workspace storage URL) and size are required' }, { status: 400 });
  }
  const user = await getUser(req);
  const clip = await createClip({
    title: String(title ?? ''),
    filename: String(filename ?? 'clip.mp4'),
    blob_url: String(blobUrl),
    size: Number(size),
    uploaded_by: user
  });
  await logActivity(user, 'upload_clip', `Uploaded "${clip.title}" (${(clip.size / 1e6).toFixed(1)} MB)`);
  return NextResponse.json({ clip });
}
