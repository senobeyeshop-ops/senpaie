// Accès aux données métier (Supabase) + orchestration du calcul de paie
import { supabase } from './supabase';
import { verifier } from './useRequete';
import { calculerBulletin } from '../paie/moteur';
import { PARAMETRES_DEFAUT } from '../paie/parametres';
import type { ElementPaie, Employe, ParametresPaie, ResultatBulletin, Rubrique } from '../paie/types';
import type { Entreprise } from '../context/EntrepriseProvider';

export const finDeMois = (annee: number, mois: number) => new Date(Date.UTC(annee, mois, 0)).toISOString().slice(0, 10);
export const debutDeMois = (annee: number, mois: number) => `${annee}-${String(mois).padStart(2, '0')}-01`;

export interface Periode { id: string; entreprise_id: string; annee: number; mois: number; statut: 'brouillon' | 'validee' | 'cloturee'; date_paiement: string | null }
export interface BulletinRow extends Omit<ResultatBulletin, 'detail'> {
  id: string; periode_id: string; employe_id: string; entreprise_id: string;
  detail: ResultatBulletin['detail'] & { employe?: Partial<Employe> };
}

/** Paramètres légaux applicables à la période (le plus récent ≤ fin du mois). */
export async function chargerParametres(annee: number, mois: number): Promise<ParametresPaie> {
  const { data, error } = await supabase.from('parametres_legaux').select('valeur')
    .eq('cle', 'paie_senegal').lte('date_effet', finDeMois(annee, mois))
    .order('date_effet', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data?.valeur as ParametresPaie) ?? PARAMETRES_DEFAUT;
}

/** Employés présents sur le mois (embauchés avant la fin, sortis après le début). */
export async function employesDuMois(entrepriseId: string, annee: number, mois: number): Promise<Employe[]> {
  const res = await supabase.from('employes').select('*')
    .eq('entreprise_id', entrepriseId).lte('date_embauche', finDeMois(annee, mois))
    .or(`date_sortie.is.null,date_sortie.gte.${debutDeMois(annee, mois)}`)
    .order('nom');
  return verifier(res) as Employe[];
}

/**
 * Calcule et enregistre les bulletins de tous les employés de la période.
 * Retourne le nombre de bulletins et les alertes rencontrées.
 */
export async function genererBulletins(periode: Periode, entreprise: Entreprise) {
  if (periode.statut === 'cloturee') throw new Error('Période clôturée : recalcul impossible.');

  const [params, employes, rubriques, fixes, variables] = await Promise.all([
    chargerParametres(periode.annee, periode.mois),
    employesDuMois(entreprise.id, periode.annee, periode.mois),
    supabase.from('rubriques').select('*').eq('entreprise_id', entreprise.id).then(verifier),
    supabase.from('elements_fixes').select('*').eq('entreprise_id', entreprise.id).then(verifier),
    supabase.from('elements_variables').select('*').eq('periode_id', periode.id).then(verifier),
  ]);

  if (employes.length === 0) throw new Error('Aucun employé présent sur ce mois. Ajoutez d\'abord vos employés.');

  const parId = new Map((rubriques as Rubrique[]).map((r) => [r.id, r]));
  const alertes: string[] = [];
  const lignes = employes.map((emp) => {
    const elements: ElementPaie[] = [];
    for (const x of [...(fixes as { employe_id: string; rubrique_id: string; montant: number }[]),
                     ...(variables as { employe_id: string; rubrique_id: string; montant: number }[])]) {
      if (x.employe_id !== emp.id) continue;
      const r = parId.get(x.rubrique_id);
      if (r && r.actif !== false) elements.push({ rubrique: r, montant: Number(x.montant) });
    }
    const res = calculerBulletin(
      { ...emp, salaire_base: Number(emp.salaire_base), sursalaire: Number(emp.sursalaire) },
      elements,
      { taux_at: Number(entreprise.taux_at), taux_ipm_salarie: Number(entreprise.taux_ipm_salarie),
        taux_ipm_employeur: Number(entreprise.taux_ipm_employeur), plafond_ipm: entreprise.plafond_ipm ? Number(entreprise.plafond_ipm) : null },
      params,
    );
    res.detail.alertes.forEach((a) => alertes.push(`${emp.prenom} ${emp.nom} — ${a}`));
    const { detail, ...montants } = res;
    return {
      entreprise_id: entreprise.id, periode_id: periode.id, employe_id: emp.id, ...montants,
      detail: { ...detail, employe: {
        matricule: emp.matricule, prenom: emp.prenom, nom: emp.nom, poste: emp.poste, categorie: emp.categorie,
        est_cadre: emp.est_cadre, date_embauche: emp.date_embauche, numero_ipres: emp.numero_ipres,
        numero_css: emp.numero_css, situation_familiale: emp.situation_familiale, nombre_enfants: emp.nombre_enfants,
        mode_paiement: emp.mode_paiement,
      } },
    };
  });

  const { error } = await supabase.from('bulletins').upsert(lignes, { onConflict: 'periode_id,employe_id' });
  if (error) throw error;
  return { nombre: lignes.length, alertes };
}

export async function bulletinsDePeriodes(entrepriseId: string, periodeIds: string[]): Promise<BulletinRow[]> {
  if (periodeIds.length === 0) return [];
  const res = await supabase.from('bulletins').select('*').eq('entreprise_id', entrepriseId).in('periode_id', periodeIds);
  return verifier(res) as BulletinRow[];
}
