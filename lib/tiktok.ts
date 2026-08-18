// Thin client for TikTok's OAuth v2 + Content Posting API.
// Docs: https://developers.tiktok.com/doc/content-posting-api-get-started

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';

export const SCOPES = 'user.info.basic,video.publish,video.upload';

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
}

function creds() {
  const client_key = process.env.TIKTOK_CLIENT_KEY;
  const client_secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!client_key || !client_secret) {
    throw new Error('TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET env vars are not set');
  }
  return { client_key, client_secret };
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const { client_key } = creds();
  const params = new URLSearchParams({
    client_key,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: redirectUri,
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    cache: 'no-store'
  });
  const data = await res.json();
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(
      `TikTok token request failed: ${data.error ?? res.status} ${data.error_description ?? ''}`.trim()
    );
  }
  return data as TokenSet;
}

export function exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
  const { client_key, client_secret } = creds();
  return tokenRequest({
    client_key,
    client_secret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const { client_key, client_secret } = creds();
  return tokenRequest({
    client_key,
    client_secret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
}

/** All open.tiktokapis.com endpoints wrap payloads as {data, error:{code:"ok"|...}} */
async function apiCall<T>(
  accessToken: string,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> }
): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store'
  });
  const data = await res.json().catch(() => ({}));
  const errCode = data?.error?.code;
  if (!res.ok || (errCode && errCode !== 'ok')) {
    throw new Error(`TikTok API ${path} failed: ${errCode ?? res.status} — ${data?.error?.message ?? 'unknown error'}`);
  }
  return data.data as T;
}

export interface UserInfo {
  open_id: string;
  union_id?: string;
  display_name: string;
  avatar_url: string;
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const data = await apiCall<{ user: UserInfo }>(accessToken, '/user/info/', {
    query: { fields: 'open_id,union_id,avatar_url,display_name' }
  });
  return data.user;
}

export interface CreatorInfo {
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

export function queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
  return apiCall<CreatorInfo>(accessToken, '/post/publish/creator_info/query/', { method: 'POST' });
}

// TikTok chunk rules: single chunk if the file fits in 64MB; otherwise chunks
// of 5–64MB where total_chunk_count = floor(size/chunk_size) and the final
// chunk absorbs the remainder.
const SINGLE_CHUNK_MAX = 64 * 1024 * 1024;
const CHUNK_SIZE = 10 * 1024 * 1024;

export function planChunks(videoSize: number): { chunkSize: number; totalChunks: number } {
  if (videoSize <= SINGLE_CHUNK_MAX) return { chunkSize: videoSize, totalChunks: 1 };
  return { chunkSize: CHUNK_SIZE, totalChunks: Math.floor(videoSize / CHUNK_SIZE) };
}

export interface PostInfo {
  title: string;
  privacy_level: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
}

export interface InitResult {
  publish_id: string;
  upload_url: string;
}

/** Direct post: the video is published to the account's feed. */
export function initDirectPost(
  accessToken: string,
  postInfo: PostInfo,
  videoSize: number
): Promise<InitResult> {
  const { chunkSize, totalChunks } = planChunks(videoSize);
  return apiCall<InitResult>(accessToken, '/post/publish/video/init/', {
    method: 'POST',
    body: {
      post_info: postInfo,
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks
      }
    }
  });
}

/** Draft upload: the video lands in the account's TikTok inbox to finish in-app. */
export function initDraftUpload(accessToken: string, videoSize: number): Promise<InitResult> {
  const { chunkSize, totalChunks } = planChunks(videoSize);
  return apiCall<InitResult>(accessToken, '/post/publish/inbox/video/init/', {
    method: 'POST',
    body: {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks
      }
    }
  });
}

/**
 * Streams the video from `videoUrl` (the Vercel Blob URL) to TikTok's upload
 * endpoint chunk by chunk, using HTTP Range requests so memory stays bounded.
 * Falls back to buffering the whole file when the source ignores Range.
 */
export async function uploadVideo(uploadUrl: string, videoUrl: string, videoSize: number): Promise<void> {
  const { chunkSize, totalChunks } = planChunks(videoSize);
  let whole: ArrayBuffer | null = null;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    // The last chunk runs to the end of the file.
    const end = i === totalChunks - 1 ? videoSize - 1 : start + chunkSize - 1;

    let chunk: ArrayBuffer;
    if (whole) {
      chunk = whole.slice(start, end + 1);
    } else {
      const res = await fetch(videoUrl, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store' });
      if (res.status === 206) {
        chunk = await res.arrayBuffer();
      } else if (res.ok) {
        whole = await res.arrayBuffer();
        chunk = whole.slice(start, end + 1);
      } else {
        throw new Error(`Failed to fetch video from storage (HTTP ${res.status})`);
      }
    }

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${videoSize}`
      },
      body: chunk
    });
    if (put.status !== 201 && put.status !== 206 && !put.ok) {
      const text = await put.text().catch(() => '');
      throw new Error(`Chunk ${i + 1}/${totalChunks} upload failed (HTTP ${put.status}) ${text.slice(0, 300)}`);
    }
  }
}

export interface PublishStatus {
  status: string;
  fail_reason?: string;
  publicaly_available_post_id?: number[];
  uploaded_bytes?: number;
}

export function fetchPublishStatus(accessToken: string, publishId: string): Promise<PublishStatus> {
  return apiCall<PublishStatus>(accessToken, '/post/publish/status/fetch/', {
    method: 'POST',
    body: { publish_id: publishId }
  });
}
