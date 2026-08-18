import { redis } from './redis';
import { decrypt, encrypt } from './crypto';

// Workspace settings. Secret values (API keys) are encrypted at rest.
const KEY = 'settings';
const SECRET_FIELDS = new Set(['whop_api_key', 'groq_api_key', 'browseruse_api_key']);

export interface Settings {
  whop_api_key?: string;
  groq_api_key?: string;
  browseruse_api_key?: string;
  default_hashtags?: string;
}

export async function getSettings(): Promise<Settings> {
  const raw = (await redis().hgetall<Record<string, string>>(KEY)) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = SECRET_FIELDS.has(k) ? decrypt(String(v)) ?? '' : String(v);
  }
  const settings = out as Settings;
  // Env vars act as defaults so you can configure keys without the UI.
  if (!settings.groq_api_key && process.env.GROQ_API_KEY) settings.groq_api_key = process.env.GROQ_API_KEY;
  if (!settings.whop_api_key && process.env.WHOP_API_KEY) settings.whop_api_key = process.env.WHOP_API_KEY;
  if (!settings.browseruse_api_key && process.env.BROWSERUSE_API_KEY) {
    settings.browseruse_api_key = process.env.BROWSERUSE_API_KEY;
  }
  return settings;
}

export async function patchSettings(patch: Record<string, string>): Promise<void> {
  const allowed = ['whop_api_key', 'groq_api_key', 'browseruse_api_key', 'default_hashtags'];
  const toSet: Record<string, string> = {};
  const toDel: string[] = [];
  for (const k of allowed) {
    if (!(k in patch)) continue;
    const v = patch[k] ?? '';
    if (v === '') toDel.push(k);
    else toSet[k] = SECRET_FIELDS.has(k) ? encrypt(v) : v;
  }
  if (Object.keys(toSet).length) await redis().hset(KEY, toSet);
  if (toDel.length) await redis().hdel(KEY, ...toDel);
}

export function maskSecret(v?: string): string {
  if (!v) return '';
  return v.length <= 8 ? '••••' : `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
