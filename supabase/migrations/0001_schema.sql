-- =====================================================================
-- SenPaie — Schéma principal (PostgreSQL / Supabase)
-- Paie des PME sénégalaises + déclarations VRS, BRS, IPRES, CSS
-- Conventions : snake_case, clés UUID, montants en FCFA (numeric(14,0))
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Profils utilisateurs (1-1 avec auth.users)
-- ---------------------------------------------------------------------
create table public.profils (
  id           uuid primary key references auth.users(id) on delete cascade,
  nom_complet  text,
  telephone    text,
  created_at   timestamptz not null default now()
);

-- Administrateurs de la plateforme (toi) : voient tous les clients
create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Entreprises (locataires / tenants)
-- ---------------------------------------------------------------------
create table public.entreprises (
  id                    uuid primary key default gen_random_uuid(),
  nom                   text not null check (length(trim(nom)) between 2 and 150),
  ninea                 text,
  rccm                  text,
  adresse               text,
  telephone             text,
  email                 text,
  numero_ipres          text,
  numero_css            text,
  -- Taux accident du travail CSS fixé par la CSS selon le risque (1, 3 ou 5 %)
  taux_at               numeric(5,4) not null default 0.01 check (taux_at between 0 and 0.10),
  -- IPM (Institution de Prévoyance Maladie) propre à l'entreprise, optionnelle
  taux_ipm_salarie      numeric(5,4) not null default 0 check (taux_ipm_salarie between 0 and 0.10),
  taux_ipm_employeur    numeric(5,4) not null default 0 check (taux_ipm_employeur between 0 and 0.10),
  plafond_ipm           numeric(14,0) check (plafond_ipm is null or plafond_ipm > 0),
  periodicite_sociale   text not null default 'mensuelle' check (periodicite_sociale in ('mensuelle','trimestrielle')),
  -- Abonnement
  plan                  text not null default 'essai' check (plan in ('essai','starter','pro','entreprise')),
  max_employes          integer not null default 5 check (max_employes > 0),
  essai_fin             date not null default (current_date + 30),
  abonnement_fin        date,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Membres d'une entreprise (multi-utilisateurs)
create table public.membres (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('proprietaire','gestionnaire','lecteur')),
  created_at    timestamptz not null default now(),
  primary key (entreprise_id, user_id)
);
create index idx_membres_user on public.membres(user_id);

-- ---------------------------------------------------------------------
-- Employés
-- ---------------------------------------------------------------------
create table public.employes (
  id                   uuid primary key default gen_random_uuid(),
  entreprise_id        uuid not null references public.entreprises(id) on delete cascade,
  matricule            text not null,
  prenom               text not null,
  nom                  text not null,
  sexe                 text check (sexe in ('M','F')),
  date_naissance       date,
  telephone            text,
  poste                text,
  categorie            text,           -- catégorie de la convention collective
  est_cadre            boolean not null default false,  -- cotise au régime complémentaire cadres IPRES
  type_contrat         text not null default 'CDI' check (type_contrat in ('CDI','CDD','Stage','Journalier','Autre')),
  date_embauche        date not null default current_date,
  date_sortie          date,
  situation_familiale  text not null default 'celibataire' check (situation_familiale in ('celibataire','marie','divorce','veuf')),
  conjoint_sans_revenu boolean not null default false,
  nombre_enfants       integer not null default 0 check (nombre_enfants between 0 and 30),
  nb_parts_override    numeric(3,1) check (nb_parts_override is null or nb_parts_override between 1 and 5),
  parts_trimf          integer not null default 1 check (parts_trimf between 1 and 10),
  numero_ipres         text,
  numero_css           text,
  mode_paiement        text not null default 'virement' check (mode_paiement in ('virement','wave','orange_money','especes','cheque')),
  coordonnees_paiement text,           -- RIB ou numéro mobile money
  salaire_base         numeric(14,0) not null check (salaire_base >= 0),
  sursalaire           numeric(14,0) not null default 0 check (sursalaire >= 0),
  actif                boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (entreprise_id, matricule),
  check (date_sortie is null or date_sortie >= date_embauche)
);
create index idx_employes_entreprise on public.employes(entreprise_id, actif);

-- ---------------------------------------------------------------------
-- Rubriques de paie (catalogue propre à chaque entreprise)
--   gain           : s'ajoute au brut (primes, indemnités, heures sup)
--   deduction_brut : diminue le brut (absence non rémunérée)
--   retenue        : retirée du net (avance, prêt, acompte)
-- ---------------------------------------------------------------------
create table public.rubriques (
  id                   uuid primary key default gen_random_uuid(),
  entreprise_id        uuid not null references public.entreprises(id) on delete cascade,
  code                 text not null,
  libelle              text not null,
  type                 text not null check (type in ('gain','deduction_brut','retenue')),
  soumis_cotisations   boolean not null default true,
  soumis_impot         boolean not null default true,
  plafond_exoneration  numeric(14,0) check (plafond_exoneration is null or plafond_exoneration >= 0),
  actif                boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (entreprise_id, code)
);

-- ---------------------------------------------------------------------
-- Périodes de paie
-- ---------------------------------------------------------------------
create table public.periodes_paie (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises(id) on delete cascade,
  annee          integer not null check (annee between 2000 and 2100),
  mois           integer not null check (mois between 1 and 12),
  statut         text not null default 'brouillon' check (statut in ('brouillon','validee','cloturee')),
  date_paiement  date,
  created_at     timestamptz not null default now(),
  unique (entreprise_id, annee, mois)
);

-- Éléments variables du mois (prime exceptionnelle, heures sup, avance…)
create table public.elements_variables (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises(id) on delete cascade,
  periode_id     uuid not null references public.periodes_paie(id) on delete cascade,
  employe_id     uuid not null references public.employes(id) on delete cascade,
  rubrique_id    uuid not null references public.rubriques(id) on delete restrict,
  montant        numeric(14,0) not null check (montant >= 0),
  commentaire    text,
  created_at     timestamptz not null default now()
);
create index idx_ev_periode on public.elements_variables(periode_id, employe_id);

-- Éléments fixes récurrents (ex : indemnité de transport chaque mois)
create table public.elements_fixes (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises(id) on delete cascade,
  employe_id     uuid not null references public.employes(id) on delete cascade,
  rubrique_id    uuid not null references public.rubriques(id) on delete restrict,
  montant        numeric(14,0) not null check (montant >= 0),
  unique (employe_id, rubrique_id)
);

-- ---------------------------------------------------------------------
-- Bulletins de paie (instantané figé du calcul)
-- ---------------------------------------------------------------------
create table public.bulletins (
  id                uuid primary key default gen_random_uuid(),
  entreprise_id     uuid not null references public.entreprises(id) on delete cascade,
  periode_id        uuid not null references public.periodes_paie(id) on delete cascade,
  employe_id        uuid not null references public.employes(id) on delete restrict,
  brut              numeric(14,0) not null default 0,
  brut_cotisable    numeric(14,0) not null default 0,
  brut_imposable    numeric(14,0) not null default 0,
  ipres_rg_sal      numeric(14,0) not null default 0,
  ipres_rg_pat      numeric(14,0) not null default 0,
  ipres_rcc_sal     numeric(14,0) not null default 0,
  ipres_rcc_pat     numeric(14,0) not null default 0,
  css_pf            numeric(14,0) not null default 0,
  css_at            numeric(14,0) not null default 0,
  ipm_sal           numeric(14,0) not null default 0,
  ipm_pat           numeric(14,0) not null default 0,
  ir                numeric(14,0) not null default 0,
  trimf             numeric(14,0) not null default 0,
  cfce              numeric(14,0) not null default 0,
  autres_retenues   numeric(14,0) not null default 0,
  net_a_payer       numeric(14,0) not null default 0,
  cout_employeur    numeric(14,0) not null default 0,
  nb_parts          numeric(3,1) not null default 1,
  detail            jsonb not null default '{}'::jsonb,   -- lignes du bulletin + bases + employé figé
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (periode_id, employe_id)
);
create index idx_bulletins_entreprise on public.bulletins(entreprise_id, periode_id);

-- ---------------------------------------------------------------------
-- BRS : prestataires et paiements soumis à retenue à la source
-- ---------------------------------------------------------------------
create table public.prestataires (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises(id) on delete cascade,
  nom            text not null,
  ninea          text,
  telephone      text,
  adresse        text,
  created_at     timestamptz not null default now()
);

create table public.paiements_tiers (
  id               uuid primary key default gen_random_uuid(),
  entreprise_id    uuid not null references public.entreprises(id) on delete cascade,
  prestataire_id   uuid not null references public.prestataires(id) on delete restrict,
  date_paiement    date not null,
  nature           text not null default 'prestation' check (nature in ('prestation','honoraires','loyer','commission','autre')),
  description      text,
  reference        text,
  montant_brut     numeric(14,0) not null check (montant_brut > 0),
  taux_retenue     numeric(5,4) not null default 0.05 check (taux_retenue between 0 and 0.5),
  montant_retenue  numeric(14,0) generated always as (round(montant_brut * taux_retenue)) stored,
  created_at       timestamptz not null default now()
);
create index idx_paiements_tiers_date on public.paiements_tiers(entreprise_id, date_paiement);

-- ---------------------------------------------------------------------
-- Déclarations générées (VRS, BRS, IPRES, CSS)
-- ---------------------------------------------------------------------
create table public.declarations (
  id                  uuid primary key default gen_random_uuid(),
  entreprise_id       uuid not null references public.entreprises(id) on delete cascade,
  type                text not null check (type in ('VRS','BRS','IPRES','CSS')),
  annee               integer not null,
  mois                integer check (mois between 1 and 12),
  trimestre           integer check (trimestre between 1 and 4),
  montant_total       numeric(14,0) not null default 0,
  detail              jsonb not null default '{}'::jsonb,
  statut              text not null default 'brouillon' check (statut in ('brouillon','deposee','payee')),
  date_limite         date,
  date_depot          date,
  reference_paiement  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((mois is not null) <> (trimestre is not null))
);
create unique index uq_declarations_periode
  on public.declarations(entreprise_id, type, annee, coalesce(mois,0), coalesce(trimestre,0));

-- ---------------------------------------------------------------------
-- Paramètres légaux (taux, plafonds, barèmes) — versionnés par date
-- ---------------------------------------------------------------------
create table public.parametres_legaux (
  id          uuid primary key default gen_random_uuid(),
  cle         text not null,
  date_effet  date not null,
  valeur      jsonb not null,
  source      text,
  created_at  timestamptz not null default now(),
  unique (cle, date_effet)
);

-- ---------------------------------------------------------------------
-- Licences (clés vendues sur Chariow, activées dans l'app)
-- ---------------------------------------------------------------------
create table public.licences (
  id             uuid primary key default gen_random_uuid(),
  cle            text not null unique,
  plan           text not null check (plan in ('starter','pro','entreprise')),
  duree_jours    integer not null check (duree_jours between 1 and 1100),
  max_employes   integer not null check (max_employes > 0),
  lot            text,
  statut         text not null default 'disponible' check (statut in ('disponible','utilisee','revoquee')),
  entreprise_id  uuid references public.entreprises(id) on delete set null,
  activee_le     timestamptz,
  activee_par    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index idx_licences_statut on public.licences(statut, lot);

-- ---------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------
create table public.journal_audit (
  id             bigint generated always as identity primary key,
  entreprise_id  uuid references public.entreprises(id) on delete cascade,
  user_id        uuid,
  action         text not null,
  table_cible    text,
  cible_id       uuid,
  details        jsonb,
  created_at     timestamptz not null default now()
);
create index idx_audit_entreprise on public.journal_audit(entreprise_id, created_at desc);
