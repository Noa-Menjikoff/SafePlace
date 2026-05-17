-- SafeSpace — Questions → Idées de contenu (Feature 2)
-- Clustering thématique des questions non répondues sur 90 jours pour
-- transformer le bruit en pipeline d'idées de vidéos.

create table if not exists public.question_topics (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels not null,
  label text not null,                    -- titre canonique du topic
  example_text text,                      -- 1 commentaire représentatif (≤ 280 chars)
  question_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'pending', -- 'pending' | 'answered' | 'dismissed'
  answered_video_id text,                 -- vidéo YouTube qui a répondu au topic
  answered_at timestamptz,
  language text not null default 'fr',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_topics_channel_status
  on public.question_topics (channel_id, status, question_count desc);

create index if not exists idx_topics_channel_last_seen
  on public.question_topics (channel_id, last_seen_at desc);

alter table public.question_topics enable row level security;

drop policy if exists "users read own topics" on public.question_topics;
create policy "users read own topics" on public.question_topics
  for select using (
    channel_id in (select id from public.channels where user_id = auth.uid())
  );

drop policy if exists "users update own topics" on public.question_topics;
create policy "users update own topics" on public.question_topics
  for update using (
    channel_id in (select id from public.channels where user_id = auth.uid())
  );

-- Lien commentaire ↔ topic (un commentaire peut appartenir à un topic, ou non)
alter table public.comments
  add column if not exists topic_id uuid references public.question_topics on delete set null;

create index if not exists idx_comments_topic
  on public.comments (topic_id)
  where topic_id is not null;
