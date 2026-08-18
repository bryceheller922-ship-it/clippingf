import { dbDelete, dbGet, dbList, dbSet } from './db';
import { decrypt, encrypt } from './crypto';
import { getSettings } from './settings';

// "Agent containers": each agent is a self-contained AI config — provider,
// API key, model, role prompt and a permission list of platform tools it may
// call. Any OpenAI-compatible API works (Groq, OpenAI, OpenRouter, Together,
// local gateways, ...), plus Anthropic's native API.

const COLLECTION = 'agents';

export type AgentProtocol = 'openai' | 'anthropic';

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  preset: string;
  protocol: AgentProtocol;
  base_url: string;
  /** encrypted at rest; empty string means "use the requesting user's Groq key" (groq preset only) */
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
  const agents = await dbList<AgentConfig>(COLLECTION);
  return agents.sort((a, b) => a.created_at - b.created_at);
}

export function getAgent(id: string): Promise<AgentConfig | null> {
  return dbGet<AgentConfig>(COLLECTION, id);
}

export function saveAgent(agent: AgentConfig): Promise<void> {
  return dbSet(COLLECTION, agent.id, agent);
}

export function deleteAgent(id: string): Promise<void> {
  return dbDelete(COLLECTION, id);
}

/**
 * Resolve the runtime API key for an agent: its own key first, otherwise the
 * requesting user's Groq key from their personal settings (groq preset only).
 */
export async function resolveApiKey(agent: AgentConfig, uid: string): Promise<string> {
  if (agent.api_key) {
    const key = decrypt(agent.api_key);
    if (key) return key;
  }
  if (agent.preset === 'groq') {
    const settings = await getSettings(uid);
    if (settings.groq_api_key) return settings.groq_api_key;
  }
  throw new Error(`Agent "${agent.name}" has no usable API key — add one to the agent or save your Groq key in Settings`);
}

export function encryptApiKey(plain: string): string {
  return plain ? encrypt(plain) : '';
}

/** Public view of an agent — never exposes the key. */
export function safeAgent(a: AgentConfig) {
  const { api_key, ...rest } = a;
  return { ...rest, has_key: !!api_key };
}
