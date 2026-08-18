// Aggregated workspace health: feeds the Ops Map and the Fixer assistant.
// Detects problems from stored state (fast — no external API calls).

import { readAccounts } from './store';
import { listAgents } from './agents';
import { listMissions } from './missions';
import { listClips } from './clips';
import { getSettings } from './settings';
import { getActivity } from './activity';

export interface Problem {
  id: string;
  severity: 'error' | 'warn';
  /** node id on the map this problem attaches to */
  node: string;
  title: string;
  detail: string;
  fix_hint: string;
}

export async function getHealth(uid: string) {
  const [accounts, agents, missions, clips, settings, activity] = await Promise.all([
    readAccounts().catch(() => []),
    listAgents().catch(() => []),
    listMissions().catch(() => []),
    listClips().catch(() => []),
    getSettings(uid).catch(() => ({}) as Awaited<ReturnType<typeof getSettings>>),
    getActivity(15).catch(() => [])
  ]);

  const keys = {
    tiktok: !!(settings.tiktok_client_key && settings.tiktok_client_secret),
    groq: !!settings.groq_api_key,
    whop: !!settings.whop_api_key,
    browseruse: !!settings.browseruse_api_key
  };

  const problems: Problem[] = [];

  if (!keys.tiktok) {
    problems.push({
      id: 'no-tiktok-keys',
      severity: accounts.length === 0 ? 'error' : 'warn',
      node: 'integration:tiktok',
      title: 'Your TikTok app credentials are missing',
      detail: 'You have not saved a TikTok Client key + secret, so you cannot connect accounts and tokens you connected cannot refresh.',
      fix_hint: 'My Keys page → TikTok section → paste the Client key and Client secret from developers.tiktok.com.'
    });
  }
  if (!keys.groq) {
    problems.push({
      id: 'no-groq-key',
      severity: 'warn',
      node: 'integration:groq',
      title: 'No Groq key saved',
      detail: 'Groq-preset agents without their own key, and the Fixer assistant, need your Groq API key.',
      fix_hint: 'My Keys page → Groq section → paste a key from console.groq.com/keys (free).'
    });
  }
  if (!keys.whop) {
    problems.push({
      id: 'no-whop-key',
      severity: 'warn',
      node: 'integration:whop',
      title: 'No Whop key saved',
      detail: 'Whop connection checks and payment data are unavailable for you.',
      fix_hint: 'My Keys page → Whop section → paste a key from whop.com/dashboard/developer.'
    });
  }
  if (!keys.browseruse) {
    problems.push({
      id: 'no-browseruse-key',
      severity: 'warn',
      node: 'integration:browseruse',
      title: 'No Browser Use key saved',
      detail: 'Agents cannot drive the cloud browser (needed for Whop campaign submissions).',
      fix_hint: 'My Keys page → Browser agent section → paste a key from cloud.browser-use.com.'
    });
  }

  for (const a of accounts) {
    if (Date.now() > a.refresh_expires_at) {
      problems.push({
        id: `account-expired-${a.open_id}`,
        severity: 'error',
        node: `account:${a.open_id}`,
        title: `@${a.display_name}'s TikTok session expired`,
        detail: 'The refresh token has expired, so posting to this account fails.',
        fix_hint: `Accounts page → Connect TikTok account and log in as @${a.display_name} again.`
      });
    }
  }

  for (const ag of agents) {
    if (!ag.enabled) {
      problems.push({
        id: `agent-disabled-${ag.id}`,
        severity: 'warn',
        node: `agent:${ag.id}`,
        title: `Agent "${ag.name}" is disabled`,
        detail: 'Chats and missions using this agent will fail until it is enabled.',
        fix_hint: 'Agents page → Edit the agent → re-enable it.'
      });
    }
    if (!ag.api_key && ag.preset === 'groq' && !keys.groq) {
      problems.push({
        id: `agent-nokey-${ag.id}`,
        severity: 'error',
        node: `agent:${ag.id}`,
        title: `Agent "${ag.name}" has no usable API key`,
        detail: 'It has no key of its own and you have no Groq key saved to fall back on.',
        fix_hint: 'Either edit the agent and add an API key, or save your Groq key on the My Keys page.'
      });
    }
  }

  for (const m of missions) {
    const agent = agents.find((a) => a.id === m.agent_id);
    if (!agent) {
      problems.push({
        id: `mission-noagent-${m.id}`,
        severity: 'error',
        node: `mission:${m.id}`,
        title: `Mission "${m.name}" has no agent`,
        detail: 'Its assigned agent container was deleted.',
        fix_hint: 'Delete the mission and recreate it with an existing agent.'
      });
    }
    if (m.last_error) {
      problems.push({
        id: `mission-error-${m.id}`,
        severity: 'error',
        node: `mission:${m.id}`,
        title: `Mission "${m.name}" failed its last run`,
        detail: m.last_error,
        fix_hint: 'Open the mission on the Agents page for the full error, fix the cause (often a missing key or disabled agent), then hit Run now.'
      });
    }
    if (m.enabled && m.runs === 0 && Date.now() - m.created_at > 26 * 3600 * 1000) {
      problems.push({
        id: `mission-stale-${m.id}`,
        severity: 'warn',
        node: `mission:${m.id}`,
        title: `Mission "${m.name}" has never run`,
        detail: 'It was created over a day ago but the scheduler has not run it.',
        fix_hint: 'Check that CRON_SECRET is set in Vercel and the cron job exists (vercel.json). On the Hobby plan crons fire once per day. You can always press Run now.'
      });
    }
  }

  return {
    keys,
    accounts: accounts.map((a) => ({
      open_id: a.open_id,
      display_name: a.display_name,
      avatar_url: a.avatar_url,
      added_by: a.added_by,
      expired: Date.now() > a.refresh_expires_at
    })),
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      preset: a.preset,
      model: a.model,
      enabled: a.enabled,
      has_key: !!a.api_key,
      tools: a.tools
    })),
    missions: missions.map((m) => ({
      id: m.id,
      name: m.name,
      agent_id: m.agent_id,
      enabled: m.enabled,
      running: !!m.running,
      runs: m.runs,
      interval_hours: m.interval_hours,
      last_run_at: m.last_run_at,
      last_error: m.last_error,
      last_result: (m.last_result ?? '').slice(0, 600)
    })),
    clips: {
      total: clips.length,
      ready: clips.filter((c) => c.status === 'ready').length,
      posted: clips.filter((c) => c.status === 'posted').length
    },
    recent_activity: activity,
    problems
  };
}
