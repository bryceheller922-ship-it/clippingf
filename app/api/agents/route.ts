import { NextRequest, NextResponse } from 'next/server';
import {
  AGENT_PRESETS,
  encryptApiKey,
  listAgents,
  safeAgent,
  saveAgent,
  type AgentConfig
} from '@/lib/agents';
import { ALL_TOOLS, DEFAULT_AGENT_TOOLS } from '@/lib/agent-tools';
import { getUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const agents = await listAgents();
  return NextResponse.json({
    agents: agents.map(safeAgent),
    presets: AGENT_PRESETS,
    available_tools: ALL_TOOLS.map((t) => ({ name: t.name, description: t.description }))
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const preset = AGENT_PRESETS[body.preset as string];
  if (!preset) return NextResponse.json({ error: 'Unknown preset' }, { status: 400 });

  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });

  const baseUrl = String(body.base_url || preset.base_url).trim();
  const model = String(body.model || preset.default_model).trim();
  if (!baseUrl || !model) {
    return NextResponse.json({ error: 'base_url and model are required for this preset' }, { status: 400 });
  }

  const toolNames = new Set(ALL_TOOLS.map((t) => t.name));
  const tools = Array.isArray(body.tools)
    ? (body.tools as string[]).filter((t) => toolNames.has(t))
    : DEFAULT_AGENT_TOOLS;

  const user = await getUser(req);
  const agent: AgentConfig = {
    id: crypto.randomUUID(),
    name: name.slice(0, 60),
    emoji: String(body.emoji ?? '🤖').slice(0, 8),
    preset: String(body.preset),
    protocol: preset.protocol,
    base_url: baseUrl,
    api_key: encryptApiKey(String(body.api_key ?? '')),
    model,
    system_prompt: String(body.system_prompt ?? '').slice(0, 8000),
    tools,
    temperature: Math.min(Math.max(Number(body.temperature ?? 0.7), 0), 2),
    enabled: true,
    created_by: user,
    created_at: Date.now()
  };
  await saveAgent(agent);
  await logActivity(user, 'create_agent', `Created agent container "${agent.name}" (${agent.preset}/${agent.model})`);
  return NextResponse.json({ agent: safeAgent(agent) });
}
