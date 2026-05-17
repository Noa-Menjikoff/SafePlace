-- SafeSpace — Threat & Stalker Detection (Feature 1)
-- Étend `comments` avec un niveau de menace + catégories analysées par Gemini,
-- ajoute le tracking d'auteur (`platform_author_id`) nécessaire aux profils
-- stalker, et crée les tables `stalker_profiles` et `threat_alerts`.
--
-- Préférences notifications ajoutées sur `profiles`.

-- 1. Extension de comments : niveau de menace + catégories + auteur canonique
alter table public.comments
  add column if not exists threat_level smallint not null default 0,
  add column if not exists threat_categories jsonb,
  add column if not exists threat_analyzed_at timestamptz,
  add column if not exists platform_author_id text;

create index if not exists idx_comments_threat
  on public.comments (channel_id, threat_level desc, published_at desc)
  where threat_level >= 1;

create index if not exists idx_comments_author
  on public.comments (channel_id, platform_author_id)
  where platform_author_id is not null;

-- 2. stalker_profiles : 1 ligne par auteur unique vu sur une chaîne
create table if not exists public.stalker_profiles (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels not null,
  platform_author_id text not null,
  author_name text,
  author_avatar text,
  comment_count integer not null default 0,
  negative_count integer not null default 0,
  threat_count integer not null default 0,
  risk_score numeric not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  blocked boolean not null default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (channel_id, platform_author_id)
);

create index if not exists idx_stalker_risk
  on public.stalker_profiles (channel_id, risk_score desc);

create index if not exists idx_stalker_blocked
  on public.stalker_profiles (channel_id, blocked)
  where blocked = true;

alter table public.stalker_profiles enable row level security;

drop policy if exists "users read own stalker profiles" on public.stalker_profiles;
create policy "users read own stalker profiles" on public.stalker_profiles
  for select using (
    channel_id in (select id from public.channels where user_id = auth.uid())
  );

drop policy if exists "users update own stalker profiles" on public.stalker_profiles;
create policy "users update own stalker profiles" on public.stalker_profiles
  for update using (
    channel_id in (select id from public.channels where user_id = auth.uid())
  );

-- 3. threat_alerts : inbox d'alertes (PII / stalker / raid / threat)
create table if not exists public.threat_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  channel_id uuid references public.channels,
  alert_type text not null,    -- 'pii' | 'stalker' | 'raid' | 'threat'
  severity smallint not null,  -- 0..3
  comment_id uuid references public.comments on delete cascade,
  stalker_id uuid references public.stalker_profiles on delete cascade,
  payload jsonb,
  email_sent boolean not null default false,
  dismissed boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_alerts_user_unread
  on public.threat_alerts (user_id, dismissed, severity desc, created_at desc);

create index if not exists idx_alerts_channel
  on public.threat_alerts (channel_id, created_at desc);

create unique index if not exists idx_alerts_dedupe_comment
  on public.threat_alerts (comment_id, alert_type)
  where comment_id is not null;

alter table public.threat_alerts enable row level security;

drop policy if exists "users own alerts" on public.threat_alerts;
create policy "users own alerts" on public.threat_alerts
  for all using (auth.uid() = user_id);

-- 4. Préférences notification dans profiles
alter table public.profiles
  add column if not exists alerts_email_mode text not null default 'digest_daily',
  -- 'immediate' | 'digest_daily' | 'digest_weekly' | 'off'
  add column if not exists alerts_min_severity smallint not null default 2;
