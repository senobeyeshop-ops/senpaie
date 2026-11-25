-- =====================================================================
-- 0010 — Indemnités hors brut + primes de caisse et de panier
-- À exécuter dans l'éditeur SQL du projet Supabase de SenPaie.
-- L'application fonctionne déjà sans ce script (les codes IND_TRANSP et
-- PRIME_REND sont traités hors brut par défaut) ; il permet en plus de
-- choisir rubrique par rubrique et crée les nouvelles primes partout.
-- =====================================================================

-- 1) Drapeau « hors brut » sur les rubriques
alter table public.rubriques add column if not exists hors_brut boolean;
update public.rubriques set hors_brut = true where code in ('IND_TRANSP', 'PRIME_REND') and hors_brut is null;

-- 2) Primes de caisse et de panier pour toutes les entreprises existantes
insert into public.rubriques (entreprise_id, code, libelle, type, soumis_cotisations, soumis_impot)
select e.id, v.code, v.libelle, 'gain', true, true
from public.entreprises e
cross join (values ('PRIME_CAISSE', 'Prime de caisse'), ('PRIME_PANIER', 'Prime de panier')) as v(code, libelle)
on conflict (entreprise_id, code) do nothing;

-- 3) … et pour chaque nouvelle entreprise
create or replace function public.tg_rubriques_supplementaires()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.rubriques (entreprise_id, code, libelle, type, soumis_cotisations, soumis_impot)
  values (new.id, 'PRIME_CAISSE', 'Prime de caisse', 'gain', true, true),
         (new.id, 'PRIME_PANIER', 'Prime de panier', 'gain', true, true)
  on conflict (entreprise_id, code) do nothing;
  return new;
end; $$;

drop trigger if exists trg_entreprises_rubriques_sup on public.entreprises;
create trigger trg_entreprises_rubriques_sup after insert on public.entreprises
for each row execute function public.tg_rubriques_supplementaires();
