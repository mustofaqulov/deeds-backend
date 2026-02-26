-- ============================================================
-- Ramadan Platform — Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Profiles (extends auth.users)
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  city        text not null default 'Toshkent',
  xp          integer not null default 50,
  streak      integer not null default 0,
  tasbeh      integer not null default 0,
  last_task_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Backward-compatible migration for existing projects
alter table if exists profiles
  add column if not exists tasbeh integer not null default 0;

-- 2. Active challenges (user's personal challenge list)
create table if not exists active_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  category    text not null default 'ibadah',
  base_xp     integer not null default 20,
  icon        text not null default '✨',
  created_at  timestamptz not null default now()
);

-- 3. Completed days (which challenges done on which date + total XP earned)
create table if not exists completed_days (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  date          date not null,
  challenge_ids uuid[] not null default '{}',
  total_xp      integer not null default 0,
  created_at    timestamptz not null default now(),
  unique(user_id, date)
);

-- 4. Achievements
create table if not exists achievements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  achievement_id text not null,
  xp_reward      integer not null default 0,
  unlocked_at    timestamptz not null default now(),
  unique(user_id, achievement_id)
);

-- 5. Prayer log (one row per user per day, one column per prayer)
create table if not exists prayer_log (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references profiles(id) on delete cascade,
  date     date not null,
  fajr     text not null default 'pending',
  dhuhr    text not null default 'pending',
  asr      text not null default 'pending',
  maghrib  text not null default 'pending',
  isha     text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(user_id, date)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles         enable row level security;
alter table active_challenges enable row level security;
alter table completed_days    enable row level security;
alter table achievements      enable row level security;
alter table prayer_log        enable row level security;

-- profiles: users can read/update their own row
drop policy if exists "profiles: own row" on profiles;
create policy "profiles: own row" on profiles
  for all using (auth.uid() = id);

-- active_challenges: own rows only
drop policy if exists "challenges: own rows" on active_challenges;
create policy "challenges: own rows" on active_challenges
  for all using (auth.uid() = user_id);

-- completed_days: own rows only
drop policy if exists "completed_days: own rows" on completed_days;
create policy "completed_days: own rows" on completed_days
  for all using (auth.uid() = user_id);

-- achievements: own rows only
drop policy if exists "achievements: own rows" on achievements;
create policy "achievements: own rows" on achievements
  for all using (auth.uid() = user_id);

-- prayer_log: own rows only
drop policy if exists "prayer_log: own rows" on prayer_log;
create policy "prayer_log: own rows" on prayer_log
  for all using (auth.uid() = user_id);

-- ============================================================
-- Indexes
-- ============================================================

create index if not exists idx_active_challenges_user on active_challenges(user_id);
create index if not exists idx_completed_days_user    on completed_days(user_id);
create index if not exists idx_completed_days_date    on completed_days(user_id, date);
create index if not exists idx_achievements_user      on achievements(user_id);
create index if not exists idx_prayer_log_user_date   on prayer_log(user_id, date);
