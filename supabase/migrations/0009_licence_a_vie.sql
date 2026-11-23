-- =====================================================================
-- SenPaie — Licence à vie
-- Convention : licences.duree_jours = 0  <=>  licence à vie.
-- À l'activation, l'accès est fixé au 31/12/2999 (= sans échéance).
-- Une entreprise déjà « à vie » ne peut pas activer une clé à durée limitée
-- (elle perdrait son accès illimité) ; une clé à vie d'une formule
-- supérieure reste possible pour monter en gamme.
-- =====================================================================
alter table public.licences drop constraint if exists licences_duree_jours_check;
alter table public.licences add constraint licences_duree_jours_check check (duree_jours between 0 and 1100);
comment on column public.licences.duree_jours is 'Durée en jours ; 0 = licence à vie';

create or replace function public.activer_licence(p_entreprise uuid, p_cle text)
returns json language plpgsql security definer set search_path = public as $$
declare v_lic public.licences; v_fin date; v_base date; v_fin_actuelle date;
  c_a_vie constant date := date '2999-12-31';
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.est_proprietaire(p_entreprise) then
    raise exception 'Seul le propriétaire du compte peut activer une licence.' using errcode = '42501';
  end if;

  select * into v_lic from public.licences where cle = upper(trim(p_cle)) for update;
  if not found or v_lic.statut <> 'disponible' then
    raise exception 'Clé de licence invalide ou déjà utilisée.' using errcode = 'P0001';
  end if;

  select abonnement_fin into v_fin_actuelle from public.entreprises where id = p_entreprise;

  if v_lic.duree_jours = 0 then
    v_fin := c_a_vie;
  else
    if v_fin_actuelle >= c_a_vie then
      raise exception 'Votre licence est déjà à vie : cette clé à durée limitée n''est pas nécessaire.' using errcode = 'P0001';
    end if;
    v_base := greatest(current_date, coalesce(v_fin_actuelle, current_date));
    v_fin := v_base + v_lic.duree_jours;
  end if;

  perform set_config('senpaie.bypass', 'on', true);
  update public.entreprises
     set plan = v_lic.plan, max_employes = v_lic.max_employes, abonnement_fin = v_fin
   where id = p_entreprise;
  perform set_config('senpaie.bypass', 'off', true);

  update public.licences
     set statut = 'utilisee', entreprise_id = p_entreprise, activee_le = now(), activee_par = auth.uid()
   where id = v_lic.id;

  insert into public.journal_audit(entreprise_id, user_id, action, table_cible, cible_id, details)
  values (p_entreprise, auth.uid(), 'activation_licence', 'licences', v_lic.id,
          json_build_object('plan', v_lic.plan, 'fin', v_fin, 'a_vie', v_lic.duree_jours = 0)::jsonb);

  return json_build_object('plan', v_lic.plan, 'abonnement_fin', v_fin,
                           'max_employes', v_lic.max_employes, 'a_vie', v_lic.duree_jours = 0);
end; $$;

revoke execute on function public.activer_licence(uuid, text) from public, anon;
grant execute on function public.activer_licence(uuid, text) to authenticated;
