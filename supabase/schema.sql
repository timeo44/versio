-- ─────────────────────────────────────────────────────────────
-- Versio — Supabase schema
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- All tables are locked with RLS and no policies: only the server
-- (service-role key) can read or write. The server verifies every
-- request's Spotify token before touching the database.
-- ─────────────────────────────────────────────────────────────

-- Users who may use this Versio instance
create table if not exists public.app_users (
  spotify_id    text primary key,
  display_name  text,
  email         text,
  role          text not null default 'user'    check (role in ('admin', 'user')),
  status        text not null default 'pending' check (status in ('active', 'pending', 'blocked')),
  -- per-user overrides: {"translatePerHour":..,"translatePerDay":..,"explainPerHour":..,"explainPerDay":..}
  limits        jsonb,
  invited_via   text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- One-time invite links
create table if not exists public.invites (
  code        text primary key,
  email       text not null,
  name        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  used_by     text,
  used_at     timestamptz
);

-- Global default rate limits (single row, id = 1). null = unlimited.
create table if not exists public.app_settings (
  id                  int primary key default 1 check (id = 1),
  translate_per_hour  int default 1500,
  translate_per_day   int default 6000,
  explain_per_hour    int default 40,
  explain_per_day     int default 150,
  updated_at          timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

-- OpenAI credit tracking (balance entered by the admin + when)
alter table public.app_settings add column if not exists credit_balance numeric;
alter table public.app_settings add column if not exists credit_as_of   timestamptz;

-- Usage counters (hour and day buckets, UTC)
create table if not exists public.usage (
  spotify_id  text not null,
  kind        text not null,
  bucket      text not null,
  count       int  not null default 0,
  primary key (spotify_id, kind, bucket)
);

-- Vocabulary (optional cloud sync)
create table if not exists public.vocabulary (
  id               uuid primary key default gen_random_uuid(),
  spotify_user_id  text        not null,
  term             text        not null,
  meaning          text        not null default '',
  line             text        not null default '',
  translation      text,
  track_name       text        not null default '',
  artist_name      text        not null default '',
  target_lang      text        not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists vocabulary_user_idx on public.vocabulary (spotify_user_id, created_at desc);

alter table public.app_users    enable row level security;
alter table public.invites      enable row level security;
alter table public.app_settings enable row level security;
alter table public.usage        enable row level security;
alter table public.vocabulary   enable row level security;

-- Atomically consume `p_amount` units of quota. Returns
-- {"allowed": bool, "hour": int, "day": int, "retry_after": seconds}
create or replace function public.consume_quota(
  p_user text, p_kind text, p_amount int, p_hour_limit int, p_day_limit int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t   timestamp := now() at time zone 'utc';
  h   text := 'h:' || to_char(t, 'YYYY-MM-DD"T"HH24');
  d   text := 'd:' || to_char(t, 'YYYY-MM-DD');
  ch  int;
  cd  int;
begin
  insert into usage (spotify_id, kind, bucket, count) values (p_user, p_kind, h, p_amount)
    on conflict (spotify_id, kind, bucket) do update set count = usage.count + p_amount
    returning count into ch;
  insert into usage (spotify_id, kind, bucket, count) values (p_user, p_kind, d, p_amount)
    on conflict (spotify_id, kind, bucket) do update set count = usage.count + p_amount
    returning count into cd;

  if (p_day_limit is not null and cd > p_day_limit) or (p_hour_limit is not null and ch > p_hour_limit) then
    update usage set count = count - p_amount where spotify_id = p_user and kind = p_kind and bucket in (h, d);
    return jsonb_build_object(
      'allowed', false, 'hour', ch - p_amount, 'day', cd - p_amount,
      'retry_after', case
        when p_day_limit is not null and cd > p_day_limit
          then ceil(extract(epoch from (date_trunc('day', t) + interval '1 day' - t)))::int
        else ceil(extract(epoch from (date_trunc('hour', t) + interval '1 hour' - t)))::int
      end);
  end if;

  -- keep the table small: drop hour buckets older than 2 days now and then
  if random() < 0.01 then
    delete from usage where bucket like 'h:%' and bucket < 'h:' || to_char(t - interval '2 days', 'YYYY-MM-DD');
  end if;

  return jsonb_build_object('allowed', true, 'hour', ch, 'day', cd);
end;
$$;

revoke all on function public.consume_quota(text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.consume_quota(text, text, int, int, int) to service_role;
