import { redis } from './redis';

const KEY = 'activity';
const MAX_ENTRIES = 300;

export interface ActivityEntry {
  ts: number;
  actor: string; // username or "agent:<name>"
  action: string;
  detail?: string;
}

export async function logActivity(actor: string, action: string, detail?: string): Promise<void> {
  try {
    const entry: ActivityEntry = { ts: Date.now(), actor, action, detail };
    await redis().lpush(KEY, JSON.stringify(entry));
    await redis().ltrim(KEY, 0, MAX_ENTRIES - 1);
  } catch {
    // activity logging must never break the main flow
  }
}

export async function getActivity(limit = 50): Promise<ActivityEntry[]> {
  const raw = await redis().lrange<string | ActivityEntry>(KEY, 0, limit - 1);
  return raw
    .map((r) => {
      try {
        return typeof r === 'string' ? (JSON.parse(r) as ActivityEntry) : r;
      } catch {
        return null;
      }
    })
    .filter((e): e is ActivityEntry => !!e);
}
