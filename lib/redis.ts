import { Redis } from '@upstash/redis';

// Shared workspace storage — both partners see the same accounts, clips,
// agents and settings. Attach "Upstash for Redis" from the Vercel Marketplace
// (Storage tab) and these env vars are injected automatically.
let client: Redis | null = null;

export function redis(): Redis {
  if (client) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Redis is not configured. Attach an Upstash Redis store to the Vercel project (Storage → Upstash for Redis) or set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.'
    );
  }
  client = new Redis({ url, token });
  return client;
}
