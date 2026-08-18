import { NextRequest, NextResponse } from 'next/server';
import { deleteAgent, encryptApiKey, getAgent, safeAgent, saveAgent } from '@/lib/agents';
import { ALL_TOOLS } from '@/lib/agent-tools';
import { getUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.name === 'string' && body.name.trim()) agent.name = body.name.trim().slice(0, 60);
  if (typeof body.emoji === 'string') agent.emoji = body.emoji.slice(0, 8);
  if (typeof body.model === 'string' && body.model.trim()) agent.model = body.model.trim();
  if (typeof body.base_url === 'string' && body.base_url.trim()) agent.base_url = body.base_url.trim();
  if (typeof body.system_prompt === 'string') agent.system_prompt = body.system_prompt.slice(0, 8000);
  if (typeof body.api_key === 'string' && body.api_key) agent.api_key = encryptApiKey(body.api_key);
  if (typeof body.temperature === 'number') agent.temperature = Math.min(Math.max(body.temperature, 0), 2);
  if (typeof body.enabled === 'boolean') agent.enabled = body.enabled;
  if (Array.isArray(body.tools)) {
    const valid = new Set(ALL_TOOLS.map((t) => t.name));
    agent.tools = (body.tools as string[]).filter((t) => valid.has(t));
  }
  await saveAgent(agent);
  return NextResponse.json({ agent: safeAgent(agent) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  await deleteAgent(id);
  await logActivity(await getUser(req), 'delete_agent', `Deleted agent container "${agent.name}"`);
  return NextResponse.json({ ok: true });
}
