import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export async function POST(req: Request) {
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== 'string' || !/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(url)) {
    return NextResponse.json({ error: 'Not a Vercel Blob URL' }, { status: 400 });
  }
  try {
    await del(url);
  } catch {
    // best-effort cleanup — the blob store can also be pruned manually
  }
  return NextResponse.json({ ok: true });
}
