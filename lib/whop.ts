// Whop integration. Reality check (per Whop's public docs): the v5 REST API
// (Bearer app/company key) exposes company, membership and payment data — but
// Content Rewards clip submissions have NO public API; clippers submit their
// posted-clip URLs through the Whop UI. So this integration:
//   1. verifies your key and shows the connected company,
//   2. pulls payment/payout data where the key allows it,
//   3. and the clip library tracks campaign URL / submitted URL / views /
//      earnings per clip, with quick links to submit on Whop.

const WHOP_API = 'https://api.whop.com/api/v5';

export interface WhopCompany {
  id: string;
  title?: string;
  route?: string;
  image_url?: string;
}

async function whopGet<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${WHOP_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Whop API ${path} failed (HTTP ${res.status}): ${data?.error?.message ?? data?.message ?? 'unknown error'}`);
  }
  return data as T;
}

export function getCompany(apiKey: string): Promise<WhopCompany> {
  return whopGet<WhopCompany>(apiKey, '/company');
}

export interface WhopPayment {
  id: string;
  final_amount?: number;
  currency?: string;
  status?: string;
  created_at?: number;
}

/** Recent payments for the company — useful if you sell clips as a Whop product. */
export async function listPayments(apiKey: string): Promise<WhopPayment[]> {
  const data = await whopGet<{ data?: WhopPayment[] }>(apiKey, '/company/payments?per=10');
  return data.data ?? [];
}
