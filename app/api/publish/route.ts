import { NextRequest, NextResponse } from 'next/server';
import { findAccount } from '@/lib/store';
import { withFreshToken } from '@/lib/auth';
import {
  initDirectPost,
  initDraftUpload,
  queryCreatorInfo,
  uploadVideo,
  type PostInfo
} from '@/lib/tiktok';

// Downloading the video from Blob and re-uploading it to TikTok can take a
// while for big files. Lower this to 60 if your Vercel plan rejects it.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface PublishRequest {
  openId: string;
  videoUrl: string;
  videoSize: number;
  title: string;
  privacyLevel: string;
  mode: 'DIRECT_POST' | 'DRAFT';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export async function POST(req: NextRequest) {
  let body: PublishRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { openId, videoUrl, videoSize, title, privacyLevel, mode } = body;
  if (!openId || !videoUrl || !videoSize || !mode) {
    return NextResponse.json({ error: 'openId, videoUrl, videoSize and mode are required' }, { status: 400 });
  }
  // Only publish videos that went through our own blob store.
  if (!/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(videoUrl)) {
    return NextResponse.json({ error: 'videoUrl must be a Vercel Blob URL' }, { status: 400 });
  }

  const stored = findAccount(req, openId);
  if (!stored) return NextResponse.json({ error: 'Account not connected' }, { status: 404 });

  const res = NextResponse.json({});
  try {
    const acct = await withFreshToken(stored, res);
    let publishId: string;
    let note: string | undefined;

    if (mode === 'DIRECT_POST') {
      const creator = await queryCreatorInfo(acct.access_token);
      let privacy = privacyLevel;
      if (!creator.privacy_level_options.includes(privacy)) {
        privacy = creator.privacy_level_options.includes('SELF_ONLY')
          ? 'SELF_ONLY'
          : creator.privacy_level_options[0];
        note = `"${privacyLevel}" isn't available for this account (unaudited TikTok apps can only post privately) — posted as ${privacy} instead.`;
      }
      const postInfo: PostInfo = {
        title: (title ?? '').slice(0, 2200),
        privacy_level: privacy,
        disable_comment: !!body.disableComment || creator.comment_disabled,
        disable_duet: !!body.disableDuet || creator.duet_disabled,
        disable_stitch: !!body.disableStitch || creator.stitch_disabled
      };
      const init = await initDirectPost(acct.access_token, postInfo, videoSize);
      await uploadVideo(init.upload_url, videoUrl, videoSize);
      publishId = init.publish_id;
    } else {
      const init = await initDraftUpload(acct.access_token, videoSize);
      await uploadVideo(init.upload_url, videoUrl, videoSize);
      publishId = init.publish_id;
    }

    const out = NextResponse.json({ publishId, note });
    res.headers.getSetCookie().forEach((c) => out.headers.append('Set-Cookie', c));
    return out;
  } catch (e) {
    const out = NextResponse.json({ error: (e as Error).message }, { status: 502 });
    res.headers.getSetCookie().forEach((c) => out.headers.append('Set-Cookie', c));
    return out;
  }
}
