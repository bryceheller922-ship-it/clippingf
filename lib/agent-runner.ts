// Runs a conversation with an agent container: calls its LLM API (OpenAI-
// compatible or Anthropic), executes any platform tools it requests, and
// loops until the model produces a final text answer.

import { resolveApiKey, type AgentConfig } from './agents';
import { ALL_TOOLS, executeTool } from './agent-tools';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolTraceEntry {
  tool: string;
  args: unknown;
  result: unknown;
}

export interface AgentRunResult {
  reply: string;
  trace: ToolTraceEntry[];
}

const MAX_TOOL_ROUNDS = 8;

function workspaceContext(agent: AgentConfig): string {
  return [
    agent.system_prompt || 'You are a helpful assistant.',
    '',
    `You are "${agent.name}", an AI agent inside a clipping platform workspace. The team posts short-form clips to multiple TikTok accounts and monetizes them through Whop (Content Rewards campaigns and product sales).`,
    'You have tools to inspect and manage the workspace. Use them instead of guessing — e.g. list_clips before talking about clips. Whop clip submissions have no public API, so guide the humans to submit posted-clip URLs on the Whop campaign page and track everything with update_clip.',
    agent.tools.includes('post_clip')
      ? 'You MAY post clips to TikTok with post_clip. Confirm the target accounts and caption in conversation before posting unless the user is explicit.'
      : 'You cannot post to TikTok yourself; propose captions and plans for the humans instead.'
  ].join('\n');
}

export async function runAgent(agent: AgentConfig, messages: ChatMessage[]): Promise<AgentRunResult> {
  const apiKey = await resolveApiKey(agent);
  const tools = ALL_TOOLS.filter((t) => agent.tools.includes(t.name));
  const actor = `agent:${agent.name}`;
  const trace: ToolTraceEntry[] = [];

  if (agent.protocol === 'anthropic') {
    return runAnthropic(agent, apiKey, messages, tools, actor, trace);
  }
  return runOpenAI(agent, apiKey, messages, tools, actor, trace);
}

// ---------- OpenAI-compatible (Groq, OpenAI, OpenRouter, Together, custom) ----------

interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

async function runOpenAI(
  agent: AgentConfig,
  apiKey: string,
  messages: ChatMessage[],
  tools: (typeof ALL_TOOLS)[number][],
  actor: string,
  trace: ToolTraceEntry[]
): Promise<AgentRunResult> {
  const convo: Record<string, unknown>[] = [
    { role: 'system', content: workspaceContext(agent) },
    ...messages
  ];
  const toolDefs = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${agent.base_url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: agent.model,
        temperature: agent.temperature,
        messages: convo,
        ...(toolDefs.length ? { tools: toolDefs } : {})
      }),
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`${agent.preset} API error (HTTP ${res.status}): ${data?.error?.message ?? JSON.stringify(data).slice(0, 300)}`);
    }
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('LLM returned no message');

    const toolCalls: OAIToolCall[] = msg.tool_calls ?? [];
    if (!toolCalls.length || round === MAX_TOOL_ROUNDS) {
      return { reply: msg.content ?? '(no reply)', trace };
    }

    convo.push(msg);
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        // leave args empty on parse failure
      }
      const result = await executeTool(call.function.name, args, actor, agent.tools);
      trace.push({ tool: call.function.name, args, result });
      convo.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 20000)
      });
    }
  }
  return { reply: '(agent exceeded tool budget)', trace };
}

// ---------- Anthropic Messages API ----------

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

async function runAnthropic(
  agent: AgentConfig,
  apiKey: string,
  messages: ChatMessage[],
  tools: (typeof ALL_TOOLS)[number][],
  actor: string,
  trace: ToolTraceEntry[]
): Promise<AgentRunResult> {
  const convo: Record<string, unknown>[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${agent.base_url.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: agent.model,
        max_tokens: 4096,
        temperature: agent.temperature,
        system: workspaceContext(agent),
        messages: convo,
        ...(toolDefs.length ? { tools: toolDefs } : {})
      }),
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Anthropic API error (HTTP ${res.status}): ${data?.error?.message ?? JSON.stringify(data).slice(0, 300)}`);
    }

    const blocks: AnthropicContentBlock[] = data.content ?? [];
    const toolUses = blocks.filter((b) => b.type === 'tool_use');
    if (!toolUses.length || round === MAX_TOOL_ROUNDS) {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      return { reply: text || '(no reply)', trace };
    }

    convo.push({ role: 'assistant', content: blocks });
    const results = [];
    for (const use of toolUses) {
      const result = await executeTool(use.name!, use.input ?? {}, actor, agent.tools);
      trace.push({ tool: use.name!, args: use.input, result });
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result).slice(0, 20000)
      });
    }
    convo.push({ role: 'user', content: results });
  }
  return { reply: '(agent exceeded tool budget)', trace };
}
