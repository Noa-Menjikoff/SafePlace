-- SafeSpace — schéma initial
-- À exécuter dans le SQL editor Supabase

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  platform text not null,
  platform_id text not null,
  name text not null,
  thumbnail_url text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  subscriber_count integer,
  created_at timestamptz default now(),
  unique (user_id, platform_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels not null,
  platform_comment_id text not null unique,
  author_name text,
  author_avatar text,
  text text not null,
  category text,
  is_toxic boolean default false,
  toxicity_score numeric,
  is_saved_to_wall boolean default false,
  published_at timestamptz,
  video_id text,
  video_title text,
  created_at timestamptz default now()
);

create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels not null,
  week_start date not null,
  insights jsonb,
  raw_count integer,
  positive_ratio numeric,
  community_score integer,
  created_at timestamptz default now()
);

create table if not exists public.support_wall (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  comment_id uuid references public.comments,
  custom_text text,
  author_name text,
  created_at timestamptz default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  mood text not null,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users,
  plan text default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  filter_mode text default 'standard',
  language text default 'fr',
  metric_shield boolean default false,
  created_at timestamptz default now()
);

-- RLS
alter table public.channels enable row level security;
alter table public.comments enable row level security;
alter table public.summaries enable row level security;
alter table public.support_wall enable row level security;
alter table public.checkins enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "users own channels" on public.channels;
create policy "users own channels" on public.channels for all using (auth.uid() = user_id);

drop policy if exists "users own wall" on public.support_wall;
create policy "users own wall" on public.support_wall for all using (auth.uid() = user_id);

drop policy if exists "users own checkins" on public.checkins;
create policy "users own checkins" on public.checkins for all using (auth.uid() = user_id);

drop policy if exists "users own profiles" on public.profiles;
create policy "users own profiles" on public.profiles for all using (auth.uid() = id);

drop policy if exists "users read own comments via channels" on public.comments;
create policy "users read own comments via channels" on public.comments
  for select using (
    channel_id in (select id from public.channels where user_id = auth.uid())
  );

drop policy if exists "users read own summaries via channels" on public.summaries;
create policy "users read own summaries via channels" on public.summaries
  for select using (
    channel_id in (select id from public.channels where user_id = auth.uid())
  );

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Indexes
create index if not exists idx_comments_channel_published
  on public.comments (channel_id, published_at desc);
create index if not exists idx_channels_user
  on public.channels (user_id);
create index if not exists idx_checkins_user_created
  on public.checkins (user_id, created_at desc);
create index if not exists idx_summaries_channel_week
  on public.summaries (channel_id, week_start desc);
