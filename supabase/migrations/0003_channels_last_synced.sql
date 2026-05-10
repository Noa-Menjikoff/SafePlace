-- Suivi du dernier sync de commentaires par chaîne.
alter table public.channels
  add column if not exists last_synced_at timestamptz;

-- Index pour piloter le cron (sync des chaînes les moins récentes).
create index if not exists idx_channels_last_synced
  on public.channels (last_synced_at nulls first);
