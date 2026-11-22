-- =====================================================================
-- SenPaie — Matricule automatique des employés
-- Format : PRÉFIXE + numéro sur 4 chiffres (ex. MAT0001, MAT0002…)
--  - compteur propre à chaque entreprise, incrémenté de façon atomique
--    (verrou de ligne : pas de doublon même en saisie simultanée)
--  - si le numéro existe déjà (matricule saisi à la main), on passe au suivant
--  - un matricule saisi manuellement est conservé tel quel
-- =====================================================================
alter table public.entreprises
  add column if not exists prefixe_matricule text not null default 'MAT'
    check (prefixe_matricule ~ '^[A-Z0-9-]{0,6}$'),
  add column if not exists compteur_matricule integer not null default 0
    check (compteur_matricule >= 0);

create or replace function public.prochain_matricule(p_entreprise uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_prefixe text; v_n integer; v_mat text;
begin
  loop
    update public.entreprises
       set compteur_matricule = compteur_matricule + 1
     where id = p_entreprise
     returning prefixe_matricule, compteur_matricule into v_prefixe, v_n;
    if not found then
      raise exception 'Entreprise introuvable.' using errcode = 'P0001';
    end if;
    v_mat := v_prefixe || lpad(v_n::text, 4, '0');
    exit when not exists (select 1 from public.employes
                           where entreprise_id = p_entreprise and matricule = v_mat);
  end loop;
  return v_mat;
end; $$;

create or replace function public.tg_matricule_auto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matricule is null or btrim(new.matricule) = '' then
    new.matricule := public.prochain_matricule(new.entreprise_id);
  else
    new.matricule := upper(btrim(new.matricule));
  end if;
  return new;
end; $$;

drop trigger if exists trg_employes_matricule on public.employes;
create trigger trg_employes_matricule before insert on public.employes
  for each row execute function public.tg_matricule_auto();

-- Le compteur ne s'utilise que via le trigger (pas d'appel direct depuis l'app)
revoke execute on function public.prochain_matricule(uuid) from public, anon, authenticated;
revoke execute on function public.tg_matricule_auto() from public, anon, authenticated;
