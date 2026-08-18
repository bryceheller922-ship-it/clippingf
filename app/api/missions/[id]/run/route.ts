import { NextRequest, NextResponse } from 'next/server';
import { getMission, runMission } from '@/lib/missions';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Run a mission immediately (the "Run now" button).
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const mission = await getMission(id);
  if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
  const updated = await runMission(mission);
  return NextResponse.json({ mission: updated });
}
