import { supabase } from './db';

// Video files live in the public `clips` bucket in Supabase Storage. Browsers
// upload directly via short-lived signed upload URLs (no service key exposed,
// and the video never squeezes through a serverless request body).

export const BUCKET = 'clips';

function baseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not set');
  return url.replace(/\/$/, '');
}

export async function createUploadUrl(filename: string): Promise<{ signedUrl: string; path: string; publicUrl: string }> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not create upload URL: ${error?.message}`);
  return { signedUrl: data.signedUrl, path, publicUrl: publicUrlFor(path) };
}

export function publicUrlFor(path: string): string {
  return `${baseUrl()}/storage/v1/object/public/${BUCKET}/${path}`;
}

export function isStorageUrl(url: string): boolean {
  return url.startsWith(`${baseUrl()}/storage/v1/object/public/${BUCKET}/`);
}

export async function deleteStorageFile(url: string): Promise<void> {
  if (!isStorageUrl(url)) return;
  const path = decodeURIComponent(url.split(`/object/public/${BUCKET}/`)[1] ?? '');
  if (!path) return;
  await supabase().storage.from(BUCKET).remove([path]);
}
