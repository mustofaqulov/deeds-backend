-- ============================================================
-- Ramadan Platform - Supabase Schema (Backend Compatible)
-- Run in Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1) Profiles
-- ============================================================

create table if not exists profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  name             text not null,
  email            text not null,
  city             text not null default 'Toshkent',
  xp               integer not null default 50,
  streak           integer not null default 0,
  tasbeh           integer not null default 0,
  daily_goal       integer not null default 3,
  sound_enabled    boolean not null default true,
  onboarding_done  boolean not null default false,
  last_task_at     timestamptz,
  nafs_stage       integer,
  nafs_assessed_at timestamptz,
  app_state        jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

alter table if exists profiles
  add column if not exists tasbeh integer not null default 0,
  add column if not exists daily_goal integer not null default 3,
  add column if not exists sound_enabled boolean not null default true,
  add column if not exists onboarding_done boolean not null default false,
  add column if not exists last_task_at timestamptz,
  add column if not exists nafs_stage integer,
  add column if not exists nafs_assessed_at timestamptz,
  add column if not exists app_state jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_daily_goal_check'
  ) then
    alter table profiles
      add constraint profiles_daily_goal_check check (daily_goal >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_nafs_stage_check'
  ) then
    alter table profiles
      add constraint profiles_nafs_stage_check check (nafs_stage is null or (nafs_stage between 1 and 7));
  end if;
end $$;

-- ============================================================
-- 2) Active challenges
-- ============================================================

create table if not exists active_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  frontend_id text,
  title       text not null,
  category    text not null default 'ibadah',
  base_xp     integer not null default 20,
  icon        text not null default '✨',
  created_at  timestamptz not null default now()
);

alter table if exists active_challenges
  add column if not exists frontend_id text,
  add column if not exists category text not null default 'ibadah',
  add column if not exists base_xp integer not null default 20,
  add column if not exists icon text not null default '✨';

create unique index if not exists uniq_active_challenges_user_frontend
  on active_challenges(user_id, frontend_id)
  where frontend_id is not null;

-- ============================================================
-- 3) Completed days
-- ============================================================

create table if not exists completed_days (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  date          date not null,
  challenge_ids text[] not null default '{}',
  total_xp      integer not null default 0,
  created_at    timestamptz not null default now(),
  unique(user_id, date)
);

alter table if exists completed_days
  add column if not exists total_xp integer not null default 0;

do $$
declare
  challenge_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into challenge_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'completed_days'
    and a.attname = 'challenge_ids'
    and not a.attisdropped;

  if challenge_type is null then
    alter table completed_days
      add column challenge_ids text[] not null default '{}';
  elsif challenge_type <> 'text[]' then
    execute '
      alter table completed_days
      alter column challenge_ids type text[]
      using coalesce(challenge_ids::text[], ''{}''::text[])
    ';
  end if;
end $$;

alter table if exists completed_days
  alter column challenge_ids set default '{}',
  alter column challenge_ids set not null;

-- ============================================================
-- 4) Achievements
-- ============================================================

create table if not exists achievements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  achievement_id text not null,
  xp_reward      integer not null default 0,
  unlocked_at    timestamptz not null default now(),
  unique(user_id, achievement_id)
);

-- ============================================================
-- 5) Prayer log
-- ============================================================

create table if not exists prayer_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  date       date not null,
  fajr       text not null default 'pending',
  dhuhr      text not null default 'pending',
  asr        text not null default 'pending',
  maghrib    text not null default 'pending',
  isha       text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(user_id, date)
);

-- ============================================================
-- 6) Nafs ulama advice (global content for Nafs page)
-- ============================================================

create table if not exists nafs_ulama_advice (
  id         text primary key,
  scholar    text not null,
  work       text not null,
  advice     text not null,
  action     text not null,
  source     text not null default '#',
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists nafs_ulama_advice
  add column if not exists source text not null default '#',
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles          enable row level security;
alter table active_challenges enable row level security;
alter table completed_days    enable row level security;
alter table achievements      enable row level security;
alter table prayer_log        enable row level security;
alter table nafs_ulama_advice enable row level security;

drop policy if exists "profiles: own row" on profiles;
create policy "profiles: own row" on profiles
  for all using (auth.uid() = id);

drop policy if exists "challenges: own rows" on active_challenges;
create policy "challenges: own rows" on active_challenges
  for all using (auth.uid() = user_id);

drop policy if exists "completed_days: own rows" on completed_days;
create policy "completed_days: own rows" on completed_days
  for all using (auth.uid() = user_id);

drop policy if exists "achievements: own rows" on achievements;
create policy "achievements: own rows" on achievements
  for all using (auth.uid() = user_id);

drop policy if exists "prayer_log: own rows" on prayer_log;
create policy "prayer_log: own rows" on prayer_log
  for all using (auth.uid() = user_id);

drop policy if exists "nafs_ulama_advice: authenticated read" on nafs_ulama_advice;
create policy "nafs_ulama_advice: authenticated read" on nafs_ulama_advice
  for select
  using (auth.role() = 'authenticated');

-- ============================================================
-- Indexes
-- ============================================================

create index if not exists idx_profiles_city             on profiles(city);
create index if not exists idx_active_challenges_user    on active_challenges(user_id);
create index if not exists idx_completed_days_user       on completed_days(user_id);
create index if not exists idx_completed_days_user_date  on completed_days(user_id, date);
create index if not exists idx_achievements_user         on achievements(user_id);
create index if not exists idx_prayer_log_user_date      on prayer_log(user_id, date);
create index if not exists idx_nafs_ulama_sort           on nafs_ulama_advice(sort_order, created_at);
create index if not exists idx_nafs_ulama_active         on nafs_ulama_advice(is_active);
