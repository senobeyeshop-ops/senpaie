import { supabase } from './supabase';
import { verifier } from './useRequete';

export interface Convention { id: string; code: string; nom: string; date_effet: string }
export interface CategorieConv {
  id: string; convention_id: string; college: string; categorie: string; ordre: number;
  unite: 'mensuel' | 'horaire' | 'journalier'; taux_horaire: number | null; taux_journalier: number | null;
  salaire_mensuel: number; corrige: boolean;
}

let cacheConv: Convention[] | null = null;
const cacheCat = new Map<string, CategorieConv[]>();

export async function listerConventions(): Promise<Convention[]> {
  if (cacheConv) return cacheConv;
  cacheConv = verifier(await supabase.from('conventions_collectives').select('*').order('nom')) as Convention[];
  return cacheConv;
}

export async function categoriesDe(conventionId: string): Promise<CategorieConv[]> {
  const c = cacheCat.get(conventionId);
  if (c) return c;
  const rows = verifier(await supabase.from('categories_conventionnelles').select('*')
    .eq('convention_id', conventionId).order('ordre')) as CategorieConv[];
  cacheCat.set(conventionId, rows);
  return rows;
}

/** Regroupe les catégories par collège (ouvriers, employés, maîtrise, cadres…) en gardant l'ordre du barème. */
export function parCollege(cats: CategorieConv[]): [string, CategorieConv[]][] {
  const m = new Map<string, CategorieConv[]>();
  for (const c of cats) { if (!m.has(c.college)) m.set(c.college, []); m.get(c.college)!.push(c); }
  return [...m.entries()];
}
