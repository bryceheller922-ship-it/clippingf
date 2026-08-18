import { redis } from './redis';

const KEY = 'clips';

export interface ClipPost {
  open_id: string;
  display_name: string;
  publish_id: string;
  mode: 'DIRECT_POST' | 'DRAFT';
  posted_at: number;
  posted_by: string;
  tiktok_url?: string;
}

export interface WhopTracking {
  campaign_url?: string;
  submitted_url?: string;
  submitted_at?: number;
  status?: 'not_submitted' | 'submitted' | 'approved' | 'rejected' | 'paid';
  views?: number;
  earnings_usd?: number;
  notes?: string;
}

export interface Clip {
  id: string;
  title: string;
  notes: string;
  filename: string;
  blob_url: string;
  size: number;
  uploaded_by: string;
  created_at: number;
  status: 'ready' | 'posted' | 'archived';
  posts: ClipPost[];
  whop: WhopTracking;
}

export async function listClips(): Promise<Clip[]> {
  const all = await redis().hgetall<Record<string, Clip | string>>(KEY);
  if (!all) return [];
  const clips: Clip[] = [];
  for (const v of Object.values(all)) {
    try {
      clips.push(typeof v === 'string' ? (JSON.parse(v) as Clip) : v);
    } catch {
      // skip corrupt entry
    }
  }
  return clips.sort((a, b) => b.created_at - a.created_at);
}

export async function getClip(id: string): Promise<Clip | null> {
  const v = await redis().hget<Clip | string>(KEY, id);
  if (!v) return null;
  try {
    return typeof v === 'string' ? (JSON.parse(v) as Clip) : v;
  } catch {
    return null;
  }
}

export async function saveClip(clip: Clip): Promise<void> {
  await redis().hset(KEY, { [clip.id]: JSON.stringify(clip) });
}

export async function deleteClipRecord(id: string): Promise<void> {
  await redis().hdel(KEY, id);
}

export async function createClip(input: {
  title: string;
  filename: string;
  blob_url: string;
  size: number;
  uploaded_by: string;
}): Promise<Clip> {
  const clip: Clip = {
    id: crypto.randomUUID(),
    title: input.title || input.filename,
    notes: '',
    filename: input.filename,
    blob_url: input.blob_url,
    size: input.size,
    uploaded_by: input.uploaded_by,
    created_at: Date.now(),
    status: 'ready',
    posts: [],
    whop: { status: 'not_submitted' }
  };
  await saveClip(clip);
  return clip;
}

export async function recordPost(clipId: string, post: ClipPost): Promise<void> {
  const clip = await getClip(clipId);
  if (!clip) return;
  clip.posts = clip.posts.filter((p) => p.publish_id !== post.publish_id);
  clip.posts.push(post);
  if (clip.status === 'ready') clip.status = 'posted';
  await saveClip(clip);
}

/** Merge a partial update into a clip. Only whitelisted fields are touched. */
export async function updateClip(
  id: string,
  patch: Partial<Pick<Clip, 'title' | 'notes' | 'status'>> & { whop?: Partial<WhopTracking> }
): Promise<Clip | null> {
  const clip = await getClip(id);
  if (!clip) return null;
  if (typeof patch.title === 'string') clip.title = patch.title.slice(0, 300);
  if (typeof patch.notes === 'string') clip.notes = patch.notes.slice(0, 5000);
  if (patch.status && ['ready', 'posted', 'archived'].includes(patch.status)) clip.status = patch.status;
  if (patch.whop && typeof patch.whop === 'object') {
    clip.whop = { ...clip.whop, ...patch.whop };
    if (patch.whop.submitted_url && !clip.whop.submitted_at) clip.whop.submitted_at = Date.now();
  }
  await saveClip(clip);
  return clip;
}
