-- =====================================================================
-- SenPaie — Un seul administrateur de la plateforme
-- 1) Aucun utilisateur de l'app ne peut écrire dans platform_admins
--    (droits retirés + RLS sans politique d'écriture).
-- 2) La table ne peut contenir qu'une seule ligne (index unique sur une constante).
-- 3) Toute tentative d'ajout d'un 2e admin est refusée, même depuis l'éditeur SQL.
-- Pour changer d'administrateur un jour : supprimer la ligne existante, puis insérer la nouvelle.
-- =====================================================================
revoke insert, update, delete, truncate on public.platform_admins from anon, authenticated;

create unique index if not exists uq_platform_admin_unique on public.platform_admins ((true));

create or replace function public.tg_admin_unique()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.platform_admins where user_id <> new.user_id) then
    raise exception 'SenPaie n''accepte qu''un seul administrateur de plateforme.' using errcode = '42501';
  end if;
  return new;
end; $$;

drop trigger if exists trg_admin_unique on public.platform_admins;
create trigger trg_admin_unique before insert or update on public.platform_admins
  for each row execute function public.tg_admin_unique();

-- Vérification : une seule ligne attendue
select u.email as administrateur, (select count(*) from public.platform_admins) as nb_admins,
       has_table_privilege('authenticated','public.platform_admins','insert') as clients_peuvent_ajouter
  from public.platform_admins a join auth.users u on u.id = a.user_id;
