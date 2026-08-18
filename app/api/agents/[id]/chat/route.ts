import { NextRequest, NextResponse } from 'next/server';
import { getAgent } from '@/lib/agents';
import { runAgent, type ChatMessage } from '@/lib/agent-runner';

// Agent runs can chain several LLM + tool calls (including posting to TikTok).
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  if (!agent.enabled) return NextResponse.json({ error: 'Agent is disabled' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const messages = (body.messages ?? []) as ChatMessage[];
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }
  const clean = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-30);

  try {
    const result = await runAgent(agent, clean);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
