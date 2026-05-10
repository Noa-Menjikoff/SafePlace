-- Rattrapage : ajoute la contrainte unique nécessaire à l'upsert
-- du flux OAuth YouTube. À exécuter dans le SQL editor Supabase.

-- 1. Si des doublons existent déjà (rares), on garde le plus récent et on
--    supprime les autres avant d'ajouter la contrainte.
delete from public.channels c
using public.channels d
where c.user_id = d.user_id
  and c.platform_id = d.platform_id
  and c.created_at < d.created_at;

-- 2. Ajout de la contrainte unique (idempotent : on protège contre la
--    re-exécution).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channels_user_id_platform_id_key'
      and conrelid = 'public.channels'::regclass
  ) then
    alter table public.channels
      add constraint channels_user_id_platform_id_key
      unique (user_id, platform_id);
  end if;
end $$;
