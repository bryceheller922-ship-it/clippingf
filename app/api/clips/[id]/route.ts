import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { deleteClipRecord, getClip, updateClip } from '@/lib/clips';
import { getUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const clip = await getClip(id);
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  return NextResponse.json({ clip });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const patch = await req.json().catch(() => ({}));
  const clip = await updateClip(id, patch);
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  return NextResponse.json({ clip });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const clip = await getClip(id);
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  try {
    await del(clip.blob_url);
  } catch {
    // blob may already be gone
  }
  await deleteClipRecord(id);
  await logActivity(await getUser(req), 'delete_clip', `Deleted "${clip.title}"`);
  return NextResponse.json({ ok: true });
}
