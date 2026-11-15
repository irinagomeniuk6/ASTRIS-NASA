-- Run once in Supabase Dashboard -> SQL Editor -> New query.
-- ASTRIS has a server-side secret key. Never grant access to anon/authenticated.
create table if not exists public.astris_kv (
  name text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.astris_kv enable row level security;
revoke all on table public.astris_kv from anon, authenticated;
grant select, insert, update, delete on table public.astris_kv to service_role;
-- No RLS policies for public browser roles. ASTRIS Node.js is the only client.
