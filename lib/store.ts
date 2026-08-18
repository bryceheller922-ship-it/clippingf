import { redis } from './redis';
import { decrypt, encrypt } from './crypto';

// Connected TikTok accounts live in Redis so the whole workspace (you and
// your partner) shares them. Tokens are AES-256-GCM encrypted at rest with
// SESSION_SECRET.

const KEY = 'tt:accounts';

export interface StoredAccount {
  open_id: string;
  display_name: string;
  avatar_url: string;
  access_token: string;
  refresh_token: string;
  /** epoch ms when access_token expires */
  expires_at: number;
  /** epoch ms when refresh_token expires */
  refresh_expires_at: number;
  scope: string;
  added_by?: string;
}

export async function readAccounts(): Promise<StoredAccount[]> {
  const all = await redis().hgetall<Record<string, string>>(KEY);
  if (!all) return [];
  const accounts: StoredAccount[] = [];
  for (const enc of Object.values(all)) {
    const json = decrypt(String(enc));
    if (!json) continue;
    try {
      const acct = JSON.parse(json) as StoredAccount;
      if (acct.open_id && acct.refresh_token) accounts.push(acct);
    } catch {
      // corrupt entry — skip
    }
  }
  return accounts.sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export async function findAccount(openId: string): Promise<StoredAccount | null> {
  const enc = await redis().hget<string>(KEY, openId);
  if (!enc) return null;
  const json = decrypt(String(enc));
  if (!json) return null;
  try {
    return JSON.parse(json) as StoredAccount;
  } catch {
    return null;
  }
}

export async function writeAccount(acct: StoredAccount): Promise<void> {
  await redis().hset(KEY, { [acct.open_id]: encrypt(JSON.stringify(acct)) });
}

export async function deleteAccount(openId: string): Promise<void> {
  await redis().hdel(KEY, openId);
}
