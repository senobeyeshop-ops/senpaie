// =====================================================================
// Moteur de calcul de paie — Sénégal
// Fonctions pures (aucun accès réseau) : testables et réutilisables.
// Tous les montants sont en FCFA, arrondis à l'unité.
// =====================================================================
import type {
  ElementPaie, Employe, EntrepriseTaux, LigneBulletin, ParametresPaie, ResultatBulletin,
} from './types';

const arrondi = (n: number) => Math.round(n);
const plafonne = (montant: number, plafond: number) => Math.max(0, Math.min(montant, plafond));

// Rubriques versées hors brut : elles s'ajoutent au net à payer sans entrer
// dans le salaire brut (ni cotisations, ni IR/TRIMF, ni CFCE), dans la limite
// de leur plafond d'exonération s'il existe (le surplus est réintégré au brut).
export const CODES_HORS_BRUT = ['IND_TRANSP', 'PRIME_REND'];
export const estHorsBrut = (r: { code: string; type: string; hors_brut?: boolean | null }) =>
  r.type === 'gain' && (r.hors_brut ?? CODES_HORS_BRUT.includes(r.code));

/**
 * Nombre de parts fiscales — Guide fiscal des PME (DGID), annexe 1 :
 *  - célibataire, divorcé, veuf sans enfant à charge ............ 1
 *  - marié sans enfant à charge ................................. 1,5
 *  - célibataire ou divorcé : 1 + 0,5 par enfant à charge
 *  - marié, ou veuf ayant au moins 1 enfant : 1,5 + 0,5 par enfant
 *  - plafond : 5 parts.
 * Le gestionnaire peut forcer la valeur (nb_parts_override).
 */
export function calculerParts(e: Pick<Employe, 'situation_familiale' | 'nombre_enfants' | 'nb_parts_override'>, partsMax = 5): number {
  if (e.nb_parts_override != null) return Math.min(Math.max(e.nb_parts_override, 1), partsMax);
  const enfants = Math.max(0, Math.floor(e.nombre_enfants || 0));
  const base = e.situation_familiale === 'marie' || (e.situation_familiale === 'veuf' && enfants > 0) ? 1.5 : 1;
  return Math.min(base + 0.5 * enfants, partsMax);
}

/** Arrondi à l'unité, demi-unité vers le haut (comme le barème DGID). */
const arrondiDGID = (n: number) => Math.round(n + 1e-9);

/**
 * Retenues fiscales mensuelles sur un salaire brut imposable —
 * reproduit exactement le « Barème mensuel des retenues à la source
 * sur salaires » de la DGID (vérifié sur 44 559 valeurs, 0 écart).
 */
export function retenuesFiscales(brutImposable: number, parts: number, partsTrimf: number, p: ParametresPaie, retraiteSalariale = 0) {
  const base = Math.max(0, brutImposable - (p.ir.deduire_retraite ? retraiteSalariale : 0));
  let netAnnuel: number;
  if (p.ir.abattement_plafond_mensuel != null) {
    const abattement = Math.min(base * p.ir.abattement_taux, p.ir.abattement_plafond_mensuel);
    const pas = p.ir.arrondi_base ?? 1000;
    netAnnuel = Math.floor((base - abattement) / pas) * pas * 12;
  } else {
    const annuel = base * 12;
    netAnnuel = Math.floor((annuel - Math.min(annuel * p.ir.abattement_taux, p.ir.abattement_plafond_annuel)) / 1000) * 1000;
  }
  const irBrutAnnuel = irBaremeAnnuel(netAnnuel, p);
  const reduction = reductionFamille(irBrutAnnuel, parts, p);
  const ir = arrondiDGID(Math.max(0, irBrutAnnuel - reduction) / 12);
  const trimf = arrondiDGID((trimfAnnuelle(brutImposable * 12, p) * Math.max(1, partsTrimf)) / 12);
  return { netImposableAnnuel: netAnnuel, irBrutAnnuel, reduction, ir, trimf };
}

/** IR annuel brut selon le barème progressif (art. 173 CGI). */
export function irBaremeAnnuel(revenuAnnuel: number, p: ParametresPaie): number {
  let impot = 0;
  let borneBasse = 0;
  for (const t of p.ir.bareme) {
    const borneHaute = t.jusqua ?? Infinity;
    if (revenuAnnuel > borneBasse) {
      impot += (Math.min(revenuAnnuel, borneHaute) - borneBasse) * t.taux;
    }
    borneBasse = borneHaute;
    if (revenuAnnuel <= borneHaute) break;
  }
  return impot;
}

/** Réduction d'impôt pour charges de famille (art. 174 CGI). */
export function reductionFamille(irAnnuel: number, parts: number, p: ParametresPaie): number {
  // On retient la ligne de barème correspondant au nombre de parts (arrondi à 0,5 inférieur)
  const lignes = [...p.ir.reductions].sort((a, b) => a.parts - b.parts);
  const ligne = [...lignes].reverse().find((l) => l.parts <= parts) ?? lignes[0];
  if (!ligne || ligne.taux === 0) return 0;
  const brute = irAnnuel * ligne.taux;
  const encadree = Math.min(Math.max(brute, ligne.min), ligne.max);
  return Math.min(encadree, irAnnuel); // la réduction ne peut pas dépasser l'impôt
}

/**
 * TRIMF annuelle selon le revenu brut annuel (Guide fiscal des PME, tableau 5) :
 * tranches « 0 – 599 999 », « 600 000 – 999 999 »… : le seuil appartient à la tranche supérieure.
 */
export function trimfAnnuelle(revenuBrutAnnuel: number, p: ParametresPaie): number {
  for (const t of p.trimf) {
    if (t.jusqua === null || revenuBrutAnnuel < t.jusqua) return t.montant_annuel;
  }
  return p.trimf[p.trimf.length - 1]?.montant_annuel ?? 0;
}

/**
 * Calcule un bulletin complet pour un employé sur un mois.
 * @param elements éléments fixes + variables du mois (primes, absences, avances…)
 */
export function calculerBulletin(
  employe: Employe,
  elements: ElementPaie[],
  entreprise: EntrepriseTaux,
  p: ParametresPaie,
): ResultatBulletin {
  const lignes: LigneBulletin[] = [];
  const alertes: string[] = [];

  if (employe.salaire_base < 0) throw new Error('Salaire de base négatif');

  // 1) Gains ------------------------------------------------------------
  let brut = 0, brutCotisable = 0, brutImposable = 0, autresRetenues = 0, horsBrut = 0;
  const lignesHorsBrut: LigneBulletin[] = [];

  const ajouterGain = (code: string, libelle: string, montant: number, cotisable: boolean, imposable: boolean) => {
    brut += montant;
    if (cotisable) brutCotisable += montant;
    if (imposable) brutImposable += montant;
    lignes.push({ code, libelle, gain: arrondi(montant) });
  };

  ajouterGain('SAL_BASE', 'Salaire de base', employe.salaire_base, true, true);
  if (employe.sursalaire > 0) ajouterGain('SURSAL', 'Sursalaire', employe.sursalaire, true, true);

  for (const { rubrique: r, montant } of elements) {
    if (!Number.isFinite(montant) || montant < 0) {
      throw new Error(`Montant invalide pour la rubrique ${r.libelle}`);
    }
    if (montant === 0) continue;

    if (r.type === 'gain' && estHorsBrut(r)) {
      // Indemnité hors brut : ajoutée au net ; au-delà du plafond, le surplus entre dans le brut
      const exonere = r.plafond_exoneration != null ? Math.min(montant, r.plafond_exoneration) : montant;
      const surplus = montant - exonere;
      if (exonere > 0) {
        horsBrut += exonere;
        lignesHorsBrut.push({ code: r.code, libelle: r.libelle, gain: arrondi(exonere), hors_brut: true });
      }
      if (surplus > 0) {
        ajouterGain(r.code + '_SUP', r.libelle + ' (au-delà du plafond)', surplus, true, true);
        alertes.push(r.libelle + ' : ' + arrondi(surplus) + " FCFA au-delà du plafond d'exonération réintégrés au brut.");
      }
    } else if (r.type === 'gain') {
      // Part exonérée jusqu'au plafond, le surplus redevient cotisable et imposable
      if (r.plafond_exoneration != null && (!r.soumis_cotisations || !r.soumis_impot)) {
        const exonere = Math.min(montant, r.plafond_exoneration);
        const surplus = montant - exonere;
        brut += montant;
        brutCotisable += (r.soumis_cotisations ? montant : surplus);
        brutImposable += (r.soumis_impot ? montant : surplus);
        lignes.push({ code: r.code, libelle: r.libelle, gain: arrondi(montant) });
        if (surplus > 0) alertes.push(`${r.libelle} : ${arrondi(surplus)} FCFA au-delà du plafond d'exonération réintégrés.`);
      } else {
        ajouterGain(r.code, r.libelle, montant, r.soumis_cotisations, r.soumis_impot);
      }
    } else if (r.type === 'deduction_brut') {
      brut -= montant;
      if (r.soumis_cotisations) brutCotisable -= montant;
      if (r.soumis_impot) brutImposable -= montant;
      lignes.push({ code: r.code, libelle: r.libelle, retenue: arrondi(montant) });
    } else {
      autresRetenues += montant;
    }
  }

  brut = Math.max(0, arrondi(brut));
  brutCotisable = Math.max(0, arrondi(brutCotisable));
  brutImposable = Math.max(0, arrondi(brutImposable));

  // 2) Cotisations sociales ---------------------------------------------
  const baseRG = plafonne(brutCotisable, p.ipres_rg.plafond);
  const ipresRgSal = arrondi(baseRG * p.ipres_rg.taux_sal);
  const ipresRgPat = arrondi(baseRG * p.ipres_rg.taux_pat);
  lignes.push({ code: 'IPRES_RG', libelle: 'IPRES Régime général', base: baseRG, taux: p.ipres_rg.taux_sal, retenue: ipresRgSal, patronal: ipresRgPat });

  let baseRCC = 0, ipresRccSal = 0, ipresRccPat = 0;
  if (employe.est_cadre) {
    baseRCC = plafonne(brutCotisable, p.ipres_rcc.plafond);
    ipresRccSal = arrondi(baseRCC * p.ipres_rcc.taux_sal);
    ipresRccPat = arrondi(baseRCC * p.ipres_rcc.taux_pat);
    lignes.push({ code: 'IPRES_RCC', libelle: 'IPRES Régime cadres', base: baseRCC, taux: p.ipres_rcc.taux_sal, retenue: ipresRccSal, patronal: ipresRccPat });
  }

  const baseCSS = plafonne(brutCotisable, p.css_pf.plafond);
  const cssPf = arrondi(baseCSS * p.css_pf.taux_pat);
  const baseAT = plafonne(brutCotisable, p.css_at.plafond);
  const cssAt = arrondi(baseAT * entreprise.taux_at);
  lignes.push({ code: 'CSS_PF', libelle: 'CSS Prestations familiales', base: baseCSS, taux: p.css_pf.taux_pat, patronal: cssPf });
  lignes.push({ code: 'CSS_AT', libelle: 'CSS Accidents du travail', base: baseAT, taux: entreprise.taux_at, patronal: cssAt });

  let ipmSal = 0, ipmPat = 0;
  if (entreprise.taux_ipm_salarie > 0 || entreprise.taux_ipm_employeur > 0) {
    const baseIpm = entreprise.plafond_ipm ? plafonne(brutCotisable, entreprise.plafond_ipm) : brutCotisable;
    ipmSal = arrondi(baseIpm * entreprise.taux_ipm_salarie);
    ipmPat = arrondi(baseIpm * entreprise.taux_ipm_employeur);
    lignes.push({ code: 'IPM', libelle: 'IPM (maladie)', base: baseIpm, taux: entreprise.taux_ipm_salarie, retenue: ipmSal, patronal: ipmPat });
  }

  // 3) Impôts : IR + TRIMF (salarié), CFCE (employeur) -------------------
  const nbParts = calculerParts(employe, p.ir.parts_max);
  const fisc = retenuesFiscales(brutImposable, nbParts, employe.parts_trimf, p, ipresRgSal + ipresRccSal);
  const { netImposableAnnuel, irBrutAnnuel, reduction, ir, trimf } = fisc;
  lignes.push({ code: 'IR', libelle: `Impôt sur le revenu (${nbParts} part${nbParts > 1 ? 's' : ''})`, base: arrondi(netImposableAnnuel / 12), retenue: ir });
  lignes.push({ code: 'TRIMF', libelle: 'TRIMF', base: brutImposable, retenue: trimf });

  const cfce = arrondi(brutImposable * p.cfce.taux);
  lignes.push({ code: 'CFCE', libelle: 'CFCE (contribution forfaitaire employeur)', base: brutImposable, taux: p.cfce.taux, patronal: cfce });

  // 4) Retenues diverses après net ---------------------------------------
  for (const { rubrique: r, montant } of elements) {
    if (r.type === 'retenue' && montant > 0) {
      lignes.push({ code: r.code, libelle: r.libelle, retenue: arrondi(montant) });
    }
  }
  autresRetenues = arrondi(autresRetenues);
  horsBrut = arrondi(horsBrut);
  lignes.push(...lignesHorsBrut);

  // 5) Totaux ------------------------------------------------------------
  const totalRetenuesSal = ipresRgSal + ipresRccSal + ipmSal + ir + trimf + autresRetenues;
  const net = brut - totalRetenuesSal + horsBrut;
  if (net < 0) alertes.push('Le net à payer est négatif : vérifiez les avances et retenues.');
  const coutEmployeur = brut + horsBrut + ipresRgPat + ipresRccPat + cssPf + cssAt + ipmPat + cfce;

  return {
    brut,
    brut_cotisable: brutCotisable,
    brut_imposable: brutImposable,
    ipres_rg_sal: ipresRgSal,
    ipres_rg_pat: ipresRgPat,
    ipres_rcc_sal: ipresRccSal,
    ipres_rcc_pat: ipresRccPat,
    css_pf: cssPf,
    css_at: cssAt,
    ipm_sal: ipmSal,
    ipm_pat: ipmPat,
    ir,
    trimf,
    cfce,
    autres_retenues: autresRetenues,
    net_a_payer: net,
    cout_employeur: coutEmployeur,
    nb_parts: nbParts,
    detail: {
      lignes,
      bases: {
        ipres_rg: baseRG,
        ipres_rcc: baseRCC,
        css: baseCSS,
        net_imposable_annuel: netImposableAnnuel,
        ir_brut_annuel: arrondi(irBrutAnnuel),
        reduction_famille_annuelle: arrondi(reduction),
      },
      alertes,
      hors_brut: horsBrut,
    },
  };
}
