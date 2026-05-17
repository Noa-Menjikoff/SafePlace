-- SafeSpace — Feature 2 polish : notifications "nouveau topic émerge"
-- On track la date du premier email envoyé pour un topic (NULL = jamais
-- notifié). Le cron re-vérifie chaque jour et envoie un digest aux users
-- qui ont des topics fraîchement passés au-dessus du seuil de 5 questions.

alter table public.question_topics
  add column if not exists notified_at timestamptz;

create index if not exists idx_topics_unnotified
  on public.question_topics (channel_id, status, question_count desc)
  where notified_at is null and status = 'pending';
