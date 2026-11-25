// Types partagés du moteur de paie SenPaie

export interface Tranche { jusqua: number | null; taux: number }
export interface Reduction { parts: number; taux: number; min: number; max: number }
export interface TrancheTrimf { jusqua: number | null; montant_annuel: number }

export interface ParametresPaie {
  ipres_rg: { taux_sal: number; taux_pat: number; plafond: number };
  ipres_rcc: { taux_sal: number; taux_pat: number; plafond: number };
  css_pf: { taux_pat: number; plafond: number };
  css_at: { plafond: number };
  cfce: { taux: number };
  ir: {
    abattement_taux: number;
    abattement_plafond_annuel: number;
    /** Méthode DGID : plafond mensuel de l'abattement (75 000) */
    abattement_plafond_mensuel?: number;
    /** Arrondi du net imposable mensuel au multiple inférieur (1 000) */
    arrondi_base?: number;
    /** Déduire les cotisations retraite avant abattement (false selon le barème DGID) */
    deduire_retraite?: boolean;
    bareme: Tranche[];
    reductions: Reduction[];
    parts_max: number;
  };
  trimf: TrancheTrimf[];
  brs: { taux_defaut: number };
  echeances: { jour_limite_vrs: number; jour_limite_brs: number; jour_limite_social: number };
}

export type TypeRubrique = 'gain' | 'deduction_brut' | 'retenue';

export interface Rubrique {
  id: string;
  code: string;
  libelle: string;
  type: TypeRubrique;
  soumis_cotisations: boolean;
  soumis_impot: boolean;
  plafond_exoneration: number | null;
  actif?: boolean;
  // Versée en plus du net, hors salaire brut (non cotisable, non imposable dans la limite du plafond)
  hors_brut?: boolean;
}

export interface Employe {
  id: string;
  matricule: string;
  prenom: string;
  nom: string;
  poste: string | null;
  categorie: string | null;
  est_cadre: boolean;
  date_embauche: string;
  situation_familiale: 'celibataire' | 'marie' | 'divorce' | 'veuf';
  conjoint_sans_revenu: boolean;
  nombre_enfants: number;
  nb_parts_override: number | null;
  parts_trimf: number;
  numero_ipres: string | null;
  numero_css: string | null;
  salaire_base: number;
  sursalaire: number;
  mode_paiement: string;
  actif: boolean;
}

export interface EntrepriseTaux {
  taux_at: number;
  taux_ipm_salarie: number;
  taux_ipm_employeur: number;
  plafond_ipm: number | null;
}

export interface ElementPaie { rubrique: Rubrique; montant: number }

export interface LigneBulletin {
  code: string;
  libelle: string;
  base?: number;
  taux?: number;
  gain?: number;
  retenue?: number;
  patronal?: number;
  // Ligne d'indemnité hors brut (affichée après les cotisations)
  hors_brut?: boolean;
}

export interface ResultatBulletin {
  brut: number;
  brut_cotisable: number;
  brut_imposable: number;
  ipres_rg_sal: number;
  ipres_rg_pat: number;
  ipres_rcc_sal: number;
  ipres_rcc_pat: number;
  css_pf: number;
  css_at: number;
  ipm_sal: number;
  ipm_pat: number;
  ir: number;
  trimf: number;
  cfce: number;
  autres_retenues: number;
  net_a_payer: number;
  cout_employeur: number;
  nb_parts: number;
  detail: {
    lignes: LigneBulletin[];
    bases: {
      ipres_rg: number;
      ipres_rcc: number;
      css: number;
      net_imposable_annuel: number;
      ir_brut_annuel: number;
      reduction_famille_annuelle: number;
    };
    alertes: string[];
    // Total des indemnités hors brut ajoutées au net
    hors_brut?: number;
  };
}
