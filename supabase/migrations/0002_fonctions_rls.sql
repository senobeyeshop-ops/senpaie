-- =====================================================================
-- SenPaie — Fonctions métier, triggers et sécurité (RLS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de sécurité (SECURITY DEFINER + search_path figé)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.est_membre(p_entreprise uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres
                 where entreprise_id = p_entreprise and user_id = auth.uid());
$$;

-- Peut modifier les données (propriétaire ou gestionnaire)
create or replace function public.peut_ecrire(p_entreprise uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres
                 where entreprise_id = p_entreprise and user_id = auth.uid()
                   and role in ('proprietaire','gestionnaire'));
$$;

create or replace function public.est_proprietaire(p_entreprise uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres
                 where entreprise_id = p_entreprise and user_id = auth.uid()
                   and role = 'proprietaire');
$$;

-- Abonnement valide = essai en cours OU licence en cours
create or replace function public.abonnement_actif(p_entreprise uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entreprises e
    where e.id = p_entreprise
      and greatest(e.essai_fin, coalesce(e.abonnement_fin, e.essai_fin)) >= current_date
  );
$$;

-- Écriture autorisée = rôle suffisant + abonnement actif
create or replace function public.peut_ecrire_actif(p_entreprise uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.peut_ecrire(p_entreprise) and public.abonnement_actif(p_entreprise);
$$;

-- ---------------------------------------------------------------------
-- Triggers génériques
-- ---------------------------------------------------------------------
create or replace function public.tg_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger trg_entreprises_upd before update on public.entreprises for each row execute function public.tg_updated_at();
create trigger trg_employes_upd    before update on public.employes    for each row execute function public.tg_updated_at();
create trigger trg_bulletins_upd   before update on public.bulletins   for each row execute function public.tg_updated_at();
create trigger trg_declarations_upd before update on public.declarations for each row execute function public.tg_updated_at();

-- Profil créé automatiquement à l'inscription
create or replace function public.tg_nouvel_utilisateur()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils(id, nom_complet, telephone)
  values (new.id,
          nullif(new.raw_user_meta_data->>'nom_complet',''),
          nullif(new.raw_user_meta_data->>'telephone',''))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger trg_auth_nouvel_utilisateur
  after insert on auth.users for each row execute function public.tg_nouvel_utilisateur();

-- Les champs d'abonnement ne sont modifiables que par les fonctions internes ou l'admin
create or replace function public.tg_proteger_abonnement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('senpaie.bypass', true) = 'on' or public.is_platform_admin() then
    return new;
  end if;
  if new.plan is distinct from old.plan
     or new.max_employes is distinct from old.max_employes
     or new.essai_fin is distinct from old.essai_fin
     or new.abonnement_fin is distinct from old.abonnement_fin
     or new.created_by is distinct from old.created_by then
    raise exception 'Les informations d''abonnement ne peuvent pas être modifiées directement.'
      using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger trg_entreprises_proteger before update on public.entreprises
  for each row execute function public.tg_proteger_abonnement();

-- Limite du nombre d'employés actifs selon le plan
create or replace function public.tg_limite_employes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max integer; v_nb integer;
begin
  if new.actif is not true then return new; end if;
  if tg_op = 'UPDATE' and old.actif is true then return new; end if;
  -- Pas les droits : on laisse la RLS refuser sans révéler d'information
  if not public.peut_ecrire(new.entreprise_id) then return new; end if;
  select max_employes into v_max from public.entreprises where id = new.entreprise_id;
  select count(*) into v_nb from public.employes
   where entreprise_id = new.entreprise_id and actif and id <> new.id;
  if v_nb >= v_max then
    raise exception 'Limite de % employés actifs atteinte pour votre formule. Passez à une formule supérieure.', v_max
      using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger trg_employes_limite before insert or update of actif on public.employes
  for each row execute function public.tg_limite_employes();

-- Une période clôturée ne peut plus recevoir de bulletins modifiés
create or replace function public.tg_periode_verrouillee()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_statut text; v_periode uuid;
begin
  v_periode := coalesce(new.periode_id, old.periode_id);
  select statut into v_statut from public.periodes_paie where id = v_periode;
  if v_statut = 'cloturee' then
    raise exception 'Cette période de paie est clôturée : modification impossible.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger trg_bulletins_verrou before insert or update or delete on public.bulletins
  for each row execute function public.tg_periode_verrouillee();
create trigger trg_ev_verrou before insert or update or delete on public.elements_variables
  for each row execute function public.tg_periode_verrouillee();

-- ---------------------------------------------------------------------
-- RPC : création d'une entreprise (onboarding) avec essai de 30 jours
-- ---------------------------------------------------------------------
create or replace function public.creer_entreprise(
  p_nom text, p_ninea text default null, p_adresse text default null,
  p_telephone text default null, p_email text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_nom is null or length(trim(p_nom)) < 2 then
    raise exception 'Le nom de l''entreprise est obligatoire.' using errcode = '22023';
  end if;
  if (select count(*) from public.membres where user_id = v_uid and role = 'proprietaire') >= 5 then
    raise exception 'Nombre maximal d''entreprises atteint pour ce compte.' using errcode = 'P0001';
  end if;

  insert into public.entreprises(nom, ninea, adresse, telephone, email, created_by)
  values (trim(p_nom), nullif(trim(p_ninea),''), nullif(trim(p_adresse),''),
          nullif(trim(p_telephone),''), nullif(trim(p_email),''), v_uid)
  returning id into v_id;

  insert into public.membres(entreprise_id, user_id, role) values (v_id, v_uid, 'proprietaire');

  -- Rubriques par défaut (modifiables). Les exonérations sont à vérifier
  -- avec le CGI / la convention collective applicable.
  insert into public.rubriques(entreprise_id, code, libelle, type, soumis_cotisations, soumis_impot, plafond_exoneration) values
    (v_id, 'PRIME_ANC',   'Prime d''ancienneté',            'gain', true,  true,  null),
    (v_id, 'HS',          'Heures supplémentaires',         'gain', true,  true,  null),
    (v_id, 'PRIME_REND',  'Prime de rendement',             'gain', true,  true,  null),
    (v_id, 'IND_LOG',     'Indemnité de logement',          'gain', true,  true,  null),
    (v_id, 'IND_TRANSP',  'Indemnité de transport',         'gain', false, false, 26000),
    (v_id, 'AVANTAGE_NAT','Avantage en nature',             'gain', true,  true,  null),
    (v_id, 'ABSENCE',     'Absence non rémunérée',          'deduction_brut', true, true, null),
    (v_id, 'AVANCE',      'Avance / acompte sur salaire',   'retenue', false, false, null),
    (v_id, 'PRET',        'Remboursement de prêt',          'retenue', false, false, null);

  insert into public.journal_audit(entreprise_id, user_id, action, table_cible, cible_id)
  values (v_id, v_uid, 'creation_entreprise', 'entreprises', v_id);
  return v_id;
end; $$;

-- ---------------------------------------------------------------------
-- RPC : activation d'une clé de licence
-- ---------------------------------------------------------------------
create or replace function public.activer_licence(p_entreprise uuid, p_cle text)
returns json language plpgsql security definer set search_path = public as $$
declare v_lic public.licences; v_fin date; v_base date;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.est_proprietaire(p_entreprise) then
    raise exception 'Seul le propriétaire du compte peut activer une licence.' using errcode = '42501';
  end if;

  select * into v_lic from public.licences
   where cle = upper(trim(p_cle)) for update;

  if not found or v_lic.statut <> 'disponible' then
    -- Message volontairement identique (pas d'énumération des clés)
    raise exception 'Clé de licence invalide ou déjà utilisée.' using errcode = 'P0001';
  end if;

  select greatest(current_date, coalesce(abonnement_fin, current_date)) into v_base
    from public.entreprises where id = p_entreprise;
  v_fin := v_base + v_lic.duree_jours;

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
          json_build_object('plan', v_lic.plan, 'fin', v_fin)::jsonb);

  return json_build_object('plan', v_lic.plan, 'abonnement_fin', v_fin, 'max_employes', v_lic.max_employes);
end; $$;

-- ---------------------------------------------------------------------
-- RPC admin : générer un lot de clés (à importer dans le stock Chariow)
-- Format : SENP-XXXX-XXXX-XXXX
-- ---------------------------------------------------------------------
create or replace function public.generer_licences(
  p_nombre integer, p_plan text, p_duree_jours integer, p_max_employes integer, p_lot text default null)
returns setof text language plpgsql security definer set search_path = public as $$
declare i integer; v_cle text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé à l''administrateur de la plateforme.' using errcode = '42501';
  end if;
  if p_nombre not between 1 and 500 then
    raise exception 'Nombre de clés entre 1 et 500.' using errcode = '22023';
  end if;
  for i in 1..p_nombre loop
    loop
      select 'SENP-' || string_agg(
               case when n in (5,10) then '-' else substr(alphabet, 1 + (get_byte(gen_random_bytes(1),0) % 32), 1) end, '')
        into v_cle
        from generate_series(1,14) as n;
      begin
        insert into public.licences(cle, plan, duree_jours, max_employes, lot)
        values (v_cle, p_plan, p_duree_jours, p_max_employes, p_lot);
        exit;
      exception when unique_violation then
        -- collision extrêmement rare : on régénère
      end;
    end loop;
    return next v_cle;
  end loop;
end; $$;

-- ---------------------------------------------------------------------
-- RPC : ajouter un membre existant (par e-mail) à l'entreprise
-- ---------------------------------------------------------------------
create or replace function public.ajouter_membre(p_entreprise uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  if not public.est_proprietaire(p_entreprise) then
    raise exception 'Seul le propriétaire peut ajouter des membres.' using errcode = '42501';
  end if;
  if p_role not in ('gestionnaire','lecteur') then
    raise exception 'Rôle invalide.' using errcode = '22023';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Aucun compte SenPaie avec cet e-mail. Demandez à la personne de s''inscrire d''abord.' using errcode = 'P0001';
  end if;
  insert into public.membres(entreprise_id, user_id, role) values (p_entreprise, v_user, p_role)
  on conflict (entreprise_id, user_id) do update set role = excluded.role;
end; $$;

-- ---------------------------------------------------------------------
-- RPC admin : vue d'ensemble des clients
-- ---------------------------------------------------------------------
create or replace function public.admin_clients()
returns table (id uuid, nom text, ninea text, plan text, essai_fin date, abonnement_fin date,
               nb_employes bigint, nb_bulletins bigint, proprietaire_email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé à l''administrateur de la plateforme.' using errcode = '42501';
  end if;
  return query
  select e.id, e.nom, e.ninea, e.plan, e.essai_fin, e.abonnement_fin,
         (select count(*) from public.employes x where x.entreprise_id = e.id and x.actif),
         (select count(*) from public.bulletins b where b.entreprise_id = e.id),
         (select u.email::text from auth.users u where u.id = e.created_by),
         e.created_at
    from public.entreprises e order by e.created_at desc;
end; $$;

-- Les fonctions ne sont exécutables que par les utilisateurs connectés
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profils            enable row level security;
alter table public.platform_admins    enable row level security;
alter table public.entreprises        enable row level security;
alter table public.membres            enable row level security;
alter table public.employes           enable row level security;
alter table public.rubriques          enable row level security;
alter table public.periodes_paie      enable row level security;
alter table public.elements_variables enable row level security;
alter table public.elements_fixes     enable row level security;
alter table public.bulletins          enable row level security;
alter table public.prestataires       enable row level security;
alter table public.paiements_tiers    enable row level security;
alter table public.declarations       enable row level security;
alter table public.parametres_legaux  enable row level security;
alter table public.licences           enable row level security;
alter table public.journal_audit      enable row level security;

-- Profils : chacun le sien
create policy profils_select on public.profils for select to authenticated using (id = auth.uid() or public.is_platform_admin());
create policy profils_update on public.profils for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Admins : lecture de sa propre ligne (pour savoir si on est admin)
create policy admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());

-- Entreprises : création uniquement via creer_entreprise()
create policy ent_select on public.entreprises for select to authenticated
  using (public.est_membre(id) or public.is_platform_admin());
create policy ent_update on public.entreprises for update to authenticated
  using (public.peut_ecrire(id) or public.is_platform_admin())
  with check (public.peut_ecrire(id) or public.is_platform_admin());

-- Membres
create policy membres_select on public.membres for select to authenticated
  using (user_id = auth.uid() or public.est_membre(entreprise_id) or public.is_platform_admin());
create policy membres_delete on public.membres for delete to authenticated
  using (public.est_proprietaire(entreprise_id) and user_id <> auth.uid());

-- Tables métier : lecture membres ; écriture gestionnaires avec abonnement actif
do $$
declare t text;
begin
  foreach t in array array['employes','rubriques','periodes_paie','elements_variables','elements_fixes',
                           'bulletins','prestataires','paiements_tiers','declarations']
  loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated
                      using (public.est_membre(entreprise_id) or public.is_platform_admin());', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated
                      with check (public.peut_ecrire_actif(entreprise_id));', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated
                      using (public.peut_ecrire_actif(entreprise_id))
                      with check (public.peut_ecrire_actif(entreprise_id));', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated
                      using (public.peut_ecrire_actif(entreprise_id));', t);
  end loop;
end $$;

-- Paramètres légaux : lecture pour tous les connectés, écriture admin
create policy param_select on public.parametres_legaux for select to authenticated using (true);
create policy param_write  on public.parametres_legaux for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Licences : admin uniquement (les clients passent par activer_licence)
create policy licences_admin on public.licences for select to authenticated using (public.is_platform_admin());
create policy licences_admin_upd on public.licences for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Journal : lecture par les membres de l'entreprise
create policy audit_select on public.journal_audit for select to authenticated
  using (public.est_membre(entreprise_id) or public.is_platform_admin());
