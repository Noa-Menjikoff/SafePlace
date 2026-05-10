-- Trace des commentaires auxquels le créateur a déjà répondu via Quick Reply.
alter table public.comments
  add column if not exists replied_at timestamptz;

create index if not exists idx_comments_replied
  on public.comments (channel_id, replied_at);
