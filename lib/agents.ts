import { redis } from './redis';
import { decrypt, encrypt } from './crypto';
import { getSettings } from './settings';

// "Agent containers": each agent is a self-contained AI config — provider,
// API key, model, role prompt and a permission list of platform tools it may
// call. Any OpenAI-compatible API works (Groq, OpenAI, OpenRouter, Together,
// local gateways, ...), plus Anthropic's native API.

const KEY = 'agents';

export type AgentProtocol = 'openai' | 'anthropic';

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  preset: string;
  protocol: AgentProtocol;
  base_url: string;
  /** encrypted at rest; empty string means "use the workspace Groq key" (groq preset only) */
  api_key: string;
  model: string;
  system_prompt: string;
  tools: string[];
  temperature: number;
  enabled: boolean;
  created_by: string;
  created_at: number;
}

export const AGENT_PRESETS: Record<
  string,
  { label: string; protocol: AgentProtocol; base_url: string; default_model: string }
> = {
  groq: {
    label: 'Groq',
    protocol: 'openai',
    base_url: 'https://api.groq.com/openai/v1',
    default_model: 'llama-3.3-70b-versatile'
  },
  openai: {
    label: 'OpenAI',
    protocol: 'openai',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o-mini'
  },
  openrouter: {
    label: 'OpenRouter',
    protocol: 'openai',
    base_url: 'https://openrouter.ai/api/v1',
    default_model: 'meta-llama/llama-3.3-70b-instruct'
  },
  together: {
    label: 'Together AI',
    protocol: 'openai',
    base_url: 'https://api.together.xyz/v1',
    default_model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
  },
  anthropic: {
    label: 'Anthropic',
    protocol: 'anthropic',
    base_url: 'https://api.anthropic.com',
    default_model: 'claude-sonnet-5'
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    protocol: 'openai',
    base_url: '',
    default_model: ''
  }
};

export async function listAgents(): Promise<AgentConfig[]> {
  const all = await redis().hgetall<Record<string, AgentConfig | string>>(KEY);
  if (!all) return [];
  const agents: AgentConfig[] = [];
  for (const v of Object.values(all)) {
    try {
      agents.push(typeof v === 'string' ? (JSON.parse(v) as AgentConfig) : v);
    } catch {
      // skip corrupt entry
    }
  }
  return agents.sort((a, b) => a.created_at - b.created_at);
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  const v = await redis().hget<AgentConfig | string>(KEY, id);
  if (!v) return null;
  try {
    return typeof v === 'string' ? (JSON.parse(v) as AgentConfig) : v;
  } catch {
    return null;
  }
}

export async function saveAgent(agent: AgentConfig): Promise<void> {
  await redis().hset(KEY, { [agent.id]: JSON.stringify(agent) });
}

export async function deleteAgent(id: string): Promise<void> {
  await redis().hdel(KEY, id);
}

/** Resolve the runtime API key for an agent (decrypt, or fall back to the workspace Groq key). */
export async function resolveApiKey(agent: AgentConfig): Promise<string> {
  if (agent.api_key) {
    const key = decrypt(agent.api_key);
    if (key) return key;
  }
  if (agent.preset === 'groq') {
    const settings = await getSettings();
    if (settings.groq_api_key) return settings.groq_api_key;
  }
  throw new Error(`Agent "${agent.name}" has no usable API key — edit the agent and add one`);
}

export function encryptApiKey(plain: string): string {
  return plain ? encrypt(plain) : '';
}

/** Public view of an agent — never exposes the key. */
export function safeAgent(a: AgentConfig) {
  const { api_key, ...rest } = a;
  return { ...rest, has_key: !!api_key };
}
