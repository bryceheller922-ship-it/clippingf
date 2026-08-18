// Platform tools that agent containers can call. Each agent config carries a
// whitelist (`tools`) — post_clip is powerful, so leave it unchecked for
// agents that should only advise.

import { readAccounts } from './store';
import { getClip, listClips, updateClip } from './clips';
import { getActivity, logActivity } from './activity';
import { getSettings } from './settings';
import { getCompany } from './whop';
import { publishToAccount, checkPublishStatus } from './publish';
import { createBrowserTask, getBrowserTask, listProfiles } from './browseruse';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export const ALL_TOOLS: ToolDef[] = [
  {
    name: 'list_tiktok_accounts',
    description: 'List the TikTok accounts connected to this workspace (open_id, display name).',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_clips',
    description: 'List clips in the library with status, where they were posted, and Whop tracking info.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ready', 'posted', 'archived'], description: 'Optional status filter' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_clip',
    description: 'Get full details for one clip by id.',
    parameters: {
      type: 'object',
      properties: { clip_id: { type: 'string' } },
      required: ['clip_id'],
      additionalProperties: false
    }
  },
  {
    name: 'update_clip',
    description:
      'Update a clip: title, notes, status, or Whop tracking (campaign_url, submitted_url, status, views, earnings_usd).',
    parameters: {
      type: 'object',
      properties: {
        clip_id: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string' },
        status: { type: 'string', enum: ['ready', 'posted', 'archived'] },
        whop_campaign_url: { type: 'string' },
        whop_submitted_url: { type: 'string' },
        whop_status: { type: 'string', enum: ['not_submitted', 'submitted', 'approved', 'rejected', 'paid'] },
        whop_views: { type: 'number' },
        whop_earnings_usd: { type: 'number' }
      },
      required: ['clip_id'],
      additionalProperties: false
    }
  },
  {
    name: 'post_clip',
    description:
      'Post a clip from the library to one or more connected TikTok accounts. mode DIRECT_POST publishes immediately; DRAFT sends to the TikTok app inbox.',
    parameters: {
      type: 'object',
      properties: {
        clip_id: { type: 'string' },
        account_open_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
        caption: { type: 'string' },
        privacy_level: {
          type: 'string',
          enum: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR'],
          description: 'Defaults to SELF_ONLY'
        },
        mode: { type: 'string', enum: ['DIRECT_POST', 'DRAFT'], description: 'Defaults to DIRECT_POST' }
      },
      required: ['clip_id', 'account_open_ids', 'caption'],
      additionalProperties: false
    }
  },
  {
    name: 'get_publish_status',
    description: 'Check TikTok publish status for a publish_id on a given account.',
    parameters: {
      type: 'object',
      properties: { account_open_id: { type: 'string' }, publish_id: { type: 'string' } },
      required: ['account_open_id', 'publish_id'],
      additionalProperties: false
    }
  },
  {
    name: 'get_whop_status',
    description: 'Check whether the Whop API key is connected and which company it belongs to.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_activity',
    description: 'Read the recent workspace activity log (posts, uploads, agent actions).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max entries, default 25' } },
      additionalProperties: false
    }
  },
  {
    name: 'browser_task',
    description:
      'Start a task in a real remote browser (Browser Use Cloud). The browser agent follows your plain-English instructions — e.g. navigating to a Whop Content Rewards campaign and submitting a posted TikTok URL. Tasks run async: this returns a task_id and live view URL immediately; poll with browser_task_status. Pass profile_id (from list_browser_profiles) to run in a browser profile the humans have logged into (keeps site sessions). Restrict allowed_domains to the sites the task needs.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Detailed plain-English instructions, including exact URLs and what to click/type. State clearly what success looks like.' },
        profile_id: { type: 'string', description: 'Browser profile id with saved logins' },
        allowed_domains: { type: 'array', items: { type: 'string' }, description: 'e.g. ["whop.com"]' },
        start_url: { type: 'string' },
        max_steps: { type: 'number', description: 'Default 50, max 150' }
      },
      required: ['task'],
      additionalProperties: false
    }
  },
  {
    name: 'browser_task_status',
    description: 'Check a browser task: status (started/finished/stopped), success flag, output text, and recent steps.',
    parameters: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false
    }
  },
  {
    name: 'list_browser_profiles',
    description: 'List Browser Use profiles (cloud Chrome profiles with saved logins) available for browser_task.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'log_note',
    description: 'Write a note into the workspace activity log so the humans see it.',
    parameters: {
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note'],
      additionalProperties: false
    }
  }
];

/** Tools that let an agent act on the outside world — off by default, opt-in per agent. */
export const DANGEROUS_TOOLS = new Set(['post_clip', 'browser_task']);

export const DEFAULT_AGENT_TOOLS = ALL_TOOLS.map((t) => t.name).filter((n) => !DANGEROUS_TOOLS.has(n));

type Args = Record<string, unknown>;

export async function executeTool(name: string, args: Args, actor: string, allowed: string[]): Promise<unknown> {
  if (!allowed.includes(name)) {
    return { error: `Tool "${name}" is not enabled for this agent. Enabled tools: ${allowed.join(', ')}` };
  }
  switch (name) {
    case 'list_tiktok_accounts': {
      const accounts = await readAccounts();
      return accounts.map((a) => ({ open_id: a.open_id, display_name: a.display_name }));
    }
    case 'list_clips': {
      const clips = await listClips();
      const status = args.status as string | undefined;
      return clips
        .filter((c) => !status || c.status === status)
        .map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          uploaded_by: c.uploaded_by,
          created_at: new Date(c.created_at).toISOString(),
          size_mb: +(c.size / 1e6).toFixed(1),
          posts: c.posts.map((p) => ({ account: p.display_name, mode: p.mode, publish_id: p.publish_id })),
          whop: c.whop,
          notes: c.notes
        }));
    }
    case 'get_clip': {
      const clip = await getClip(String(args.clip_id ?? ''));
      return clip ?? { error: 'Clip not found' };
    }
    case 'update_clip': {
      const whop: Record<string, unknown> = {};
      if (args.whop_campaign_url !== undefined) whop.campaign_url = args.whop_campaign_url;
      if (args.whop_submitted_url !== undefined) whop.submitted_url = args.whop_submitted_url;
      if (args.whop_status !== undefined) whop.status = args.whop_status;
      if (args.whop_views !== undefined) whop.views = args.whop_views;
      if (args.whop_earnings_usd !== undefined) whop.earnings_usd = args.whop_earnings_usd;
      const clip = await updateClip(String(args.clip_id ?? ''), {
        title: args.title as string | undefined,
        notes: args.notes as string | undefined,
        status: args.status as 'ready' | 'posted' | 'archived' | undefined,
        whop: Object.keys(whop).length ? whop : undefined
      });
      if (!clip) return { error: 'Clip not found' };
      await logActivity(actor, 'update_clip', `Updated "${clip.title}"`);
      return { ok: true, clip: { id: clip.id, title: clip.title, status: clip.status, whop: clip.whop } };
    }
    case 'post_clip': {
      const clip = await getClip(String(args.clip_id ?? ''));
      if (!clip) return { error: 'Clip not found' };
      const openIds = (args.account_open_ids as string[]) ?? [];
      const results = [];
      for (const openId of openIds) {
        try {
          const r = await publishToAccount({
            openId,
            videoUrl: clip.blob_url,
            videoSize: clip.size,
            title: String(args.caption ?? clip.title),
            privacyLevel: String(args.privacy_level ?? 'SELF_ONLY'),
            mode: (args.mode as 'DIRECT_POST' | 'DRAFT') ?? 'DIRECT_POST',
            clipId: clip.id,
            actor
          });
          results.push({ account: r.accountName, publish_id: r.publishId, note: r.note });
        } catch (e) {
          results.push({ account_open_id: openId, error: (e as Error).message });
        }
      }
      return { results };
    }
    case 'get_publish_status': {
      try {
        return await checkPublishStatus(String(args.account_open_id ?? ''), String(args.publish_id ?? ''));
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    case 'get_whop_status': {
      const settings = await getSettings();
      if (!settings.whop_api_key) return { connected: false, note: 'No Whop API key configured in Settings' };
      try {
        const company = await getCompany(settings.whop_api_key);
        return { connected: true, company };
      } catch (e) {
        return { connected: false, error: (e as Error).message };
      }
    }
    case 'browser_task': {
      try {
        const ref = await createBrowserTask({
          task: String(args.task ?? ''),
          profileId: args.profile_id ? String(args.profile_id) : undefined,
          allowedDomains: Array.isArray(args.allowed_domains) ? (args.allowed_domains as string[]) : undefined,
          startUrl: args.start_url ? String(args.start_url) : undefined,
          maxSteps: args.max_steps ? Number(args.max_steps) : undefined
        });
        await logActivity(actor, 'browser_task', `Started browser task ${ref.id}: ${String(args.task).slice(0, 140)}`);
        const status = await getBrowserTask(ref.id).catch(() => null);
        return {
          task_id: ref.id,
          session_id: ref.sessionId,
          live_url: status?.live_url,
          note: 'Task started. It runs asynchronously in the cloud browser — poll browser_task_status for the result. The humans can watch it at the live_url.'
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    case 'browser_task_status': {
      try {
        return await getBrowserTask(String(args.task_id ?? ''));
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    case 'list_browser_profiles': {
      try {
        return await listProfiles();
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    case 'get_activity':
      return getActivity(Math.min(Number(args.limit ?? 25), 100));
    case 'log_note': {
      await logActivity(actor, 'note', String(args.note ?? '').slice(0, 1000));
      return { ok: true };
    }
    default:
      return { error: `Unknown tool "${name}"` };
  }
}
