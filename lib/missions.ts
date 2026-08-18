import { dbDelete, dbGet, dbList, dbSet } from './db';
import { getAgent } from './agents';
import { runAgent } from './agent-runner';
import { logActivity } from './activity';

// Autopilot missions: a standing goal assigned to an agent container. A
// Vercel Cron hits /api/autopilot/tick, which runs every enabled mission
// whose interval has elapsed. The agent works autonomously with whatever
// tools its container allows (post_clip, browser_task, ...) and its report
// is stored on the mission for the humans to read.

const COLLECTION = 'missions';

export interface Mission {
  id: string;
  name: string;
  goal: string;
  agent_id: string;
  enabled: boolean;
  interval_hours: number;
  last_run_at: number;
  last_result: string;
  last_error: string;
  runs: number;
  created_by: string; // email, for display
  created_by_uid: string; // whose API keys the mission runs with
  created_at: number;
}

export async function listMissions(): Promise<Mission[]> {
  const missions = await dbList<Mission>(COLLECTION);
  return missions.sort((a, b) => a.created_at - b.created_at);
}

export function getMission(id: string): Promise<Mission | null> {
  return dbGet<Mission>(COLLECTION, id);
}

export function saveMission(m: Mission): Promise<void> {
  return dbSet(COLLECTION, m.id, m);
}

export function deleteMission(id: string): Promise<void> {
  return dbDelete(COLLECTION, id);
}

function missionPrompt(m: Mission): string {
  return [
    `AUTONOMOUS MISSION RUN (no human is in this conversation — do the work now, don't ask questions).`,
    ``,
    `Mission: ${m.name}`,
    `Goal: ${m.goal}`,
    ``,
    `Instructions:`,
    `- Inspect the workspace first (clips, accounts, activity, Whop status) before acting.`,
    `- Do as much of the goal as your enabled tools allow. If a step needs a tool you don't have, skip it and say so.`,
    `- Long browser tasks: start them, note the task_id and live_url, and check on them in your NEXT run — don't wait.`,
    `- Record important state on clips (update_clip) or as notes (log_note) so your next run can pick up where you left off.`,
    `- Finish with a short report: what you did, what you found, and what the humans should look at.`,
    m.last_result ? `\nYour previous run reported:\n${m.last_result.slice(0, 2000)}` : ''
  ].join('\n');
}

export async function runMission(m: Mission): Promise<Mission> {
  const agent = await getAgent(m.agent_id);
  m.last_run_at = Date.now();
  m.runs = (m.runs ?? 0) + 1;
  try {
    if (!agent) throw new Error('Assigned agent no longer exists');
    if (!agent.enabled) throw new Error('Assigned agent is disabled');
    const result = await runAgent(agent, [{ role: 'user', content: missionPrompt(m) }], m.created_by_uid);
    m.last_result = result.reply.slice(0, 8000);
    m.last_error = '';
    await logActivity(`agent:${agent.name}`, 'mission_run', `Mission "${m.name}": ${result.reply.slice(0, 180)}`);
  } catch (e) {
    m.last_error = (e as Error).message.slice(0, 1000);
    await logActivity('autopilot', 'mission_error', `Mission "${m.name}" failed: ${m.last_error.slice(0, 180)}`);
  }
  await saveMission(m);
  return m;
}

/** Runs due missions (bounded per tick to stay inside one invocation). */
export async function runDueMissions(maxRuns = 3): Promise<{ ran: string[]; skipped: number }> {
  const missions = await listMissions();
  const due = missions.filter(
    (m) => m.enabled && Date.now() - (m.last_run_at ?? 0) >= m.interval_hours * 3600 * 1000
  );
  const ran: string[] = [];
  for (const m of due.slice(0, maxRuns)) {
    await runMission(m);
    ran.push(m.name);
  }
  return { ran, skipped: Math.max(0, due.length - maxRuns) };
}
