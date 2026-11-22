import { z } from 'zod';

export const schemaEmail = z.string().trim().toLowerCase().email('Adresse e-mail invalide');
export const schemaMotDePasse = z.string()
  .min(8, '8 caractères minimum')
  .max(72, '72 caractères maximum')
  .regex(/[A-Za-z]/, 'Au moins une lettre')
  .regex(/\d/, 'Au moins un chiffre');

export const schemaInscription = z.object({
  nom_complet: z.string().trim().min(2, 'Indiquez votre nom').max(100),
  telephone: z.string().trim().regex(/^(\+?221)?\s?[0-9 ]{9,12}$/, 'Numéro sénégalais invalide (ex : 77 123 45 67)').optional().or(z.literal('')),
  email: schemaEmail,
  mot_de_passe: schemaMotDePasse,
  confirmation: z.string(),
}).refine((d) => d.mot_de_passe === d.confirmation, { message: 'Les mots de passe ne correspondent pas', path: ['confirmation'] });

/** Transforme les erreurs zod en { champ: message } */
export function erreursChamps(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) { const k = String(i.path[0] ?? '_'); if (!out[k]) out[k] = i.message; }
  return out;
}

// Protection côté client contre les essais répétés (la vraie limite est côté Supabase Auth)
const CLE = 'senpaie_tentatives';
export function verifierTentatives(): string | null {
  const t = JSON.parse(sessionStorage.getItem(CLE) ?? '{"n":0,"jusqua":0}') as { n: number; jusqua: number };
  if (t.jusqua > Date.now()) return `Trop de tentatives. Réessayez dans ${Math.ceil((t.jusqua - Date.now()) / 1000)} s.`;
  return null;
}
export function enregistrerEchec() {
  const t = JSON.parse(sessionStorage.getItem(CLE) ?? '{"n":0,"jusqua":0}') as { n: number; jusqua: number };
  t.n += 1;
  if (t.n >= 5) { t.jusqua = Date.now() + 60_000 * Math.min(2 ** (t.n - 5), 15); }
  sessionStorage.setItem(CLE, JSON.stringify(t));
}
export const reinitialiserTentatives = () => sessionStorage.removeItem(CLE);
