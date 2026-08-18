import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// All workspace data lives in one Supabase Postgres table (`docs`) accessed
// exclusively with the service-role key — see supabase/schema.sql.

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function dbGet<T>(collection: string, id: string): Promise<T | null> {
  const { data, error } = await supabase()
    .from('docs')
    .select('data')
    .eq('collection', collection)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`db get ${collection}/${id}: ${error.message}`);
  return (data?.data as T) ?? null;
}

export async function dbSet(collection: string, id: string, data: unknown): Promise<void> {
  const { error } = await supabase()
    .from('docs')
    .upsert({ collection, id, data, updated_at: new Date().toISOString() });
  if (error) throw new Error(`db set ${collection}/${id}: ${error.message}`);
}

export async function dbDelete(collection: string, id: string): Promise<void> {
  const { error } = await supabase().from('docs').delete().eq('collection', collection).eq('id', id);
  if (error) throw new Error(`db delete ${collection}/${id}: ${error.message}`);
}

/** Newest-first by insertion time. */
export async function dbList<T>(collection: string, limit = 500): Promise<T[]> {
  const { data, error } = await supabase()
    .from('docs')
    .select('data')
    .eq('collection', collection)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`db list ${collection}: ${error.message}`);
  return (data ?? []).map((r) => r.data as T);
}
