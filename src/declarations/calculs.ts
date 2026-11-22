// =====================================================================
// Préparation des déclarations à partir des bulletins et paiements tiers
//  VRS   : Versement des retenues sur salaires (IR + TRIMF) + CFCE → DGID (mensuel)
//  BRS   : Bordereau des retenues à la source sur paiements aux tiers → DGID (mensuel)
//  IPRES : Cotisations retraite RG + RCC (mensuel ou trimestriel)
//  CSS   : Prestations familiales + accidents du travail (mensuel ou trimestriel)
// =====================================================================

export interface BulletinDecl {
  employe_id: string;
  matricule: string;
  nom_complet: string;
  numero_ipres?: string | null;
  numero_css?: string | null;
  est_cadre: boolean;
  brut: number;
  brut_cotisable: number;
  brut_imposable: number;
  ipres_rg_sal: number; ipres_rg_pat: number;
  ipres_rcc_sal: number; ipres_rcc_pat: number;
  css_pf: number; css_at: number;
  ir: number; trimf: number; cfce: number;
  base_ipres_rg: number; base_ipres_rcc: number; base_css: number;
}

export interface PaiementTiersDecl {
  prestataire: string;
  ninea: string | null;
  date_paiement: string;
  nature: string;
  reference: string | null;
  montant_brut: number;
  taux_retenue: number;
  montant_retenue: number;
}

const somme = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);

export function preparerVRS(bulletins: BulletinDecl[]) {
  const lignes = bulletins.map((b) => ({
    matricule: b.matricule, nom: b.nom_complet,
    brut_imposable: b.brut_imposable, ir: b.ir, trimf: b.trimf, cfce: b.cfce,
  }));
  const total_ir = somme(lignes, (l) => l.ir);
  const total_trimf = somme(lignes, (l) => l.trimf);
  const total_cfce = somme(lignes, (l) => l.cfce);
  return {
    effectif: lignes.length,
    masse_salariale_imposable: somme(lignes, (l) => l.brut_imposable),
    total_ir, total_trimf, total_cfce,
    montant_total: total_ir + total_trimf + total_cfce,
    lignes,
  };
}

export function preparerBRS(paiements: PaiementTiersDecl[]) {
  return {
    nombre_paiements: paiements.length,
    total_brut: somme(paiements, (p) => p.montant_brut),
    montant_total: somme(paiements, (p) => p.montant_retenue),
    lignes: paiements,
  };
}

export function preparerIPRES(bulletins: BulletinDecl[]) {
  const lignes = bulletins.map((b) => ({
    matricule: b.matricule, nom: b.nom_complet, numero_ipres: b.numero_ipres ?? '',
    cadre: b.est_cadre, brut: b.brut_cotisable,
    base_rg: b.base_ipres_rg, rg_sal: b.ipres_rg_sal, rg_pat: b.ipres_rg_pat,
    base_rcc: b.base_ipres_rcc, rcc_sal: b.ipres_rcc_sal, rcc_pat: b.ipres_rcc_pat,
  }));
  const total_rg = somme(lignes, (l) => l.rg_sal + l.rg_pat);
  const total_rcc = somme(lignes, (l) => l.rcc_sal + l.rcc_pat);
  return {
    effectif: lignes.length,
    effectif_cadres: lignes.filter((l) => l.cadre).length,
    total_base_rg: somme(lignes, (l) => l.base_rg),
    total_base_rcc: somme(lignes, (l) => l.base_rcc),
    total_rg, total_rcc,
    montant_total: total_rg + total_rcc,
    lignes,
  };
}

export function preparerCSS(bulletins: BulletinDecl[]) {
  const lignes = bulletins.map((b) => ({
    matricule: b.matricule, nom: b.nom_complet, numero_css: b.numero_css ?? '',
    brut: b.brut_cotisable, base: b.base_css, pf: b.css_pf, at: b.css_at,
  }));
  const total_pf = somme(lignes, (l) => l.pf);
  const total_at = somme(lignes, (l) => l.at);
  return {
    effectif: lignes.length,
    total_base: somme(lignes, (l) => l.base),
    total_pf, total_at,
    montant_total: total_pf + total_at,
    lignes,
  };
}

/** Date limite : jour J du mois suivant la fin de la période. */
export function dateLimite(annee: number, mois: number, jour = 15): string {
  const d = new Date(Date.UTC(annee, mois, jour)); // mois (1-12) → index du mois suivant
  return d.toISOString().slice(0, 10);
}

/** Mois couverts par un trimestre (1 → [1,2,3]). */
export const moisDuTrimestre = (t: number) => [3 * t - 2, 3 * t - 1, 3 * t];

/** Export CSV compatible Excel français (séparateur ; et BOM UTF-8). */
export function versCSV(lignes: Record<string, unknown>[]): string {
  if (lignes.length === 0) return '';
  const cols = Object.keys(lignes[0]);
  const echap = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.join(';'), ...lignes.map((l) => cols.map((c) => echap(l[c])).join(';'))].join('\n');
}
