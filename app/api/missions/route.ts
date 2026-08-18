import { NextRequest, NextResponse } from 'next/server';
import { listMissions, saveMission, type Mission } from '@/lib/missions';
import { getAgent } from '@/lib/agents';
import { getSession } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ missions: await listMissions() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const goal = String(body.goal ?? '').trim();
  const agentId = String(body.agent_id ?? '');
  if (!name || !goal || !agentId) {
    return NextResponse.json({ error: 'name, goal and agent_id are required' }, { status: 400 });
  }
  if (!(await getAgent(agentId))) return NextResponse.json({ error: 'Agent not found' }, { status: 400 });

  const user = await getSession(req);
  const mission: Mission = {
    id: crypto.randomUUID(),
    name: name.slice(0, 100),
    goal: goal.slice(0, 4000),
    agent_id: agentId,
    enabled: body.enabled !== false,
    interval_hours: Math.min(Math.max(Number(body.interval_hours ?? 24), 1), 168),
    last_run_at: 0,
    last_result: '',
    last_error: '',
    runs: 0,
    created_by: user.email,
    created_by_uid: user.uid,
    created_at: Date.now()
  };
  await saveMission(mission);
  await logActivity(user.email, 'create_mission', `Created mission "${mission.name}"`);
  return NextResponse.json({ mission });
}
