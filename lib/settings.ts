import { dbGet, dbSet } from './db';
import { decrypt, encrypt } from './crypto';

// Per-user settings: every workspace member saves their OWN API keys in the
// UI (Settings page). Secrets are encrypted at rest; env vars act as
// workspace-wide fallbacks so nothing breaks before keys are entered.

const COLLECTION = 'usersettings';
const SECRET_FIELDS = new Set(['whop_api_key', 'groq_api_key', 'browseruse_api_key']);
const ALLOWED_FIELDS = ['whop_api_key', 'groq_api_key', 'browseruse_api_key', 'default_hashtags'];

export interface Settings {
  whop_api_key?: string;
  groq_api_key?: string;
  browseruse_api_key?: string;
  default_hashtags?: string;
}

export async function getSettings(uid: string): Promise<Settings> {
  const raw = (uid ? await dbGet<Record<string, string>>(COLLECTION, uid) : null) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = SECRET_FIELDS.has(k) ? decrypt(String(v)) ?? '' : String(v);
  }
  const settings = out as Settings;
  if (!settings.groq_api_key && process.env.GROQ_API_KEY) settings.groq_api_key = process.env.GROQ_API_KEY;
  if (!settings.whop_api_key && process.env.WHOP_API_KEY) settings.whop_api_key = process.env.WHOP_API_KEY;
  if (!settings.browseruse_api_key && process.env.BROWSERUSE_API_KEY) {
    settings.browseruse_api_key = process.env.BROWSERUSE_API_KEY;
  }
  return settings;
}

export async function patchSettings(uid: string, patch: Record<string, string>): Promise<void> {
  if (!uid) throw new Error('No user id in session');
  const current = (await dbGet<Record<string, string>>(COLLECTION, uid)) ?? {};
  for (const k of ALLOWED_FIELDS) {
    if (!(k in patch)) continue;
    const v = patch[k] ?? '';
    if (v === '') delete current[k];
    else current[k] = SECRET_FIELDS.has(k) ? encrypt(v) : v;
  }
  await dbSet(COLLECTION, uid, current);
}

export function maskSecret(v?: string): string {
  if (!v) return '';
  return v.length <= 8 ? '••••' : `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
