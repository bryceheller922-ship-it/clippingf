import { findAccount } from './store';
import { withFreshToken } from './auth';
import { recordPost } from './clips';
import { logActivity } from './activity';
import { isStorageUrl } from './storage';
import {
  fetchPublishStatus,
  initDirectPost,
  initDraftUpload,
  queryCreatorInfo,
  uploadVideo,
  type PostInfo
} from './tiktok';

export interface PublishParams {
  openId: string;
  videoUrl: string;
  videoSize: number;
  title: string;
  privacyLevel: string;
  mode: 'DIRECT_POST' | 'DRAFT';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  clipId?: string;
  actor: string; // username or "agent:<name>" for the activity log
}

export interface PublishResult {
  publishId: string;
  note?: string;
  accountName: string;
}

/** Publishes one video to one TikTok account and records it on the clip. */
export async function publishToAccount(p: PublishParams): Promise<PublishResult> {
  if (!isStorageUrl(p.videoUrl)) throw new Error('videoUrl must be a clip stored in this workspace');
  const stored = await findAccount(p.openId);
  if (!stored) throw new Error('TikTok account not connected');
  const acct = await withFreshToken(stored);

  let publishId: string;
  let note: string | undefined;

  if (p.mode === 'DIRECT_POST') {
    const creator = await queryCreatorInfo(acct.access_token);
    let privacy = p.privacyLevel;
    if (!creator.privacy_level_options.includes(privacy)) {
      privacy = creator.privacy_level_options.includes('SELF_ONLY')
        ? 'SELF_ONLY'
        : creator.privacy_level_options[0];
      note = `"${p.privacyLevel}" isn't available for this account (unaudited TikTok apps can only post privately) — posted as ${privacy} instead.`;
    }
    const postInfo: PostInfo = {
      title: (p.title ?? '').slice(0, 2200),
      privacy_level: privacy,
      disable_comment: !!p.disableComment || creator.comment_disabled,
      disable_duet: !!p.disableDuet || creator.duet_disabled,
      disable_stitch: !!p.disableStitch || creator.stitch_disabled
    };
    const init = await initDirectPost(acct.access_token, postInfo, p.videoSize);
    await uploadVideo(init.upload_url, p.videoUrl, p.videoSize);
    publishId = init.publish_id;
  } else {
    const init = await initDraftUpload(acct.access_token, p.videoSize);
    await uploadVideo(init.upload_url, p.videoUrl, p.videoSize);
    publishId = init.publish_id;
  }

  if (p.clipId) {
    await recordPost(p.clipId, {
      open_id: acct.open_id,
      display_name: acct.display_name,
      publish_id: publishId,
      mode: p.mode,
      posted_at: Date.now(),
      posted_by: p.actor
    });
  }
  await logActivity(p.actor, 'post', `Sent "${p.title || 'clip'}" to @${acct.display_name} (${p.mode})`);
  return { publishId, note, accountName: acct.display_name };
}

export async function checkPublishStatus(openId: string, publishId: string) {
  const stored = await findAccount(openId);
  if (!stored) throw new Error('TikTok account not connected');
  const acct = await withFreshToken(stored);
  return fetchPublishStatus(acct.access_token, publishId);
}
