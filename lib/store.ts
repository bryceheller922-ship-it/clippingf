import { dbDelete, dbGet, dbList, dbSet } from './db';
import { decrypt, encrypt } from './crypto';

// Connected TikTok accounts are workspace-shared (Supabase `docs` table,
// collection "accounts"). Tokens are AES-256-GCM encrypted at rest.

const COLLECTION = 'accounts';

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

function unpack(enc: string | null): StoredAccount | null {
  if (!enc) return null;
  const json = decrypt(enc);
  if (!json) return null;
  try {
    const acct = JSON.parse(json) as StoredAccount;
    return acct.open_id && acct.refresh_token ? acct : null;
  } catch {
    return null;
  }
}

export async function readAccounts(): Promise<StoredAccount[]> {
  const rows = await dbList<{ enc: string }>(COLLECTION);
  return rows
    .map((r) => unpack(r.enc))
    .filter((a): a is StoredAccount => !!a)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export async function findAccount(openId: string): Promise<StoredAccount | null> {
  const row = await dbGet<{ enc: string }>(COLLECTION, openId);
  return unpack(row?.enc ?? null);
}

export async function writeAccount(acct: StoredAccount): Promise<void> {
  await dbSet(COLLECTION, acct.open_id, { enc: encrypt(JSON.stringify(acct)) });
}

export async function deleteAccount(openId: string): Promise<void> {
  await dbDelete(COLLECTION, openId);
}
