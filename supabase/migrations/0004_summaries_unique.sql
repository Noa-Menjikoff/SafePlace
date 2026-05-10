-- Une seule synthèse par chaîne et par semaine.
-- Permet l'upsert dans generateChannelSummary.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'summaries_channel_id_week_start_key'
      and conrelid = 'public.summaries'::regclass
  ) then
    alter table public.summaries
      add constraint summaries_channel_id_week_start_key
      unique (channel_id, week_start);
  end if;
end $$;
