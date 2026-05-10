-- Le créateur peut masquer un commentaire de son Clean Feed sans le supprimer
-- de YouTube. Les commentaires toxiques sont aussi masqués (via is_toxic).

alter table public.comments
  add column if not exists is_hidden boolean not null default false;

create index if not exists idx_comments_visibility
  on public.comments (channel_id, is_hidden, is_toxic);
