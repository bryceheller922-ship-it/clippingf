import { NextRequest, NextResponse } from 'next/server';
import { deleteMission, getMission, saveMission } from '@/lib/missions';
import { getUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const mission = await getMission(id);
  if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.name === 'string' && body.name.trim()) mission.name = body.name.trim().slice(0, 100);
  if (typeof body.goal === 'string' && body.goal.trim()) mission.goal = body.goal.trim().slice(0, 4000);
  if (typeof body.enabled === 'boolean') mission.enabled = body.enabled;
  if (typeof body.interval_hours === 'number') {
    mission.interval_hours = Math.min(Math.max(body.interval_hours, 1), 168);
  }
  await saveMission(mission);
  return NextResponse.json({ mission });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const mission = await getMission(id);
  if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
  await deleteMission(id);
  await logActivity(await getUser(req), 'delete_mission', `Deleted mission "${mission.name}"`);
  return NextResponse.json({ ok: true });
}
