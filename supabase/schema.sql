-- ClippingF schema. Run this once in your Supabase project's SQL editor.

-- Single document table backing all workspace data (accounts, clips, agents,
-- per-user settings, missions, activity). The service-role key is the only
-- thing that touches it — no client access, so RLS stays enabled with no
-- public policies.
create table if not exists public.docs (
  collection text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create index if not exists docs_collection_created
  on public.docs (collection, created_at desc);

alter table public.docs enable row level security;

-- Public bucket for clip videos (public read lets TikTok's servers fetch the
-- file during publishing; uploads/deletes go through the service role only).
insert into storage.buckets (id, name, public)
values ('clips', 'clips', true)
on conflict (id) do nothing;
