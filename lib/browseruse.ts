// Browser Use Cloud client (https://cloud.browser-use.com) — lets agent
// containers drive a real remote browser. Tasks are async: create one, then
// poll until it finishes. Persistent logins use Browser Use "profiles": log
// into a site once in a profile and every task run with that profileId keeps
// the session (cookies, local storage).

import { getSettings } from './settings';

const API = 'https://api.browser-use.com/api/v2';

async function apiKey(uid: string): Promise<string> {
  const settings = await getSettings(uid);
  const key = settings.browseruse_api_key || process.env.BROWSERUSE_API_KEY;
  if (!key) {
    throw new Error('No Browser Use API key configured — add yours in Settings (get it at cloud.browser-use.com)');
  }
  return key;
}

async function buFetch<T>(uid: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'X-Browser-Use-API-Key': await apiKey(uid),
      'Content-Type': 'application/json'
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Browser Use API ${path} failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data as T;
}

export interface BrowserTaskRef {
  id: string;
  sessionId?: string;
}

export function createBrowserTask(uid: string, opts: {
  task: string;
  profileId?: string;
  allowedDomains?: string[];
  startUrl?: string;
  maxSteps?: number;
}): Promise<BrowserTaskRef> {
  return buFetch<BrowserTaskRef>(uid, '/tasks', {
    method: 'POST',
    body: {
      task: opts.task,
      ...(opts.profileId ? { profileId: opts.profileId } : {}),
      ...(opts.allowedDomains?.length ? { allowedDomains: opts.allowedDomains } : {}),
      ...(opts.startUrl ? { startUrl: opts.startUrl } : {}),
      maxSteps: Math.min(opts.maxSteps ?? 50, 150)
    }
  });
}

interface RawTask {
  id: string;
  status?: string;
  output?: string;
  isSuccess?: boolean;
  liveUrl?: string;
  steps?: { url?: string; nextGoal?: string; evaluationPreviousGoal?: string }[];
}

export async function getBrowserTask(uid: string, taskId: string) {
  const t = await buFetch<RawTask>(uid, `/tasks/${taskId}`);
  return {
    id: t.id,
    status: t.status,
    is_success: t.isSuccess,
    output: t.output?.slice(0, 4000),
    live_url: t.liveUrl,
    steps_taken: t.steps?.length ?? 0,
    recent_steps: (t.steps ?? []).slice(-3).map((s) => ({ url: s.url, goal: s.nextGoal }))
  };
}

export interface BrowserProfile {
  id: string;
  name?: string;
}

export async function listProfiles(uid: string): Promise<BrowserProfile[]> {
  const data = await buFetch<{ items?: BrowserProfile[]; profiles?: BrowserProfile[] }>(uid, '/profiles');
  return data.items ?? data.profiles ?? [];
}
