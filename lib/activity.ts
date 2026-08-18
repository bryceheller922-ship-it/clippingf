import { dbList, dbSet } from './db';

const COLLECTION = 'activity';

export interface ActivityEntry {
  ts: number;
  actor: string; // user email or "agent:<name>"
  action: string;
  detail?: string;
}

export async function logActivity(actor: string, action: string, detail?: string): Promise<void> {
  try {
    const entry: ActivityEntry = { ts: Date.now(), actor, action, detail };
    await dbSet(COLLECTION, `${entry.ts}-${crypto.randomUUID().slice(0, 8)}`, entry);
  } catch {
    // activity logging must never break the main flow
  }
}

export async function getActivity(limit = 50): Promise<ActivityEntry[]> {
  const rows = await dbList<ActivityEntry>(COLLECTION, limit);
  return rows.sort((a, b) => b.ts - a.ts);
}
