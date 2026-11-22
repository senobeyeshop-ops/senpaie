import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true si les variables d'environnement Supabase sont absentes (affiche un écran d'aide) */
export const configManquante = !url || !anonKey;

// La clé "anon" est publique par conception : la sécurité repose sur la RLS.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'absente', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const LIEN_ACHAT = (import.meta.env.VITE_LIEN_ACHAT_LICENCE as string | undefined) ?? '';
export const WHATSAPP = (import.meta.env.VITE_WHATSAPP_SUPPORT as string | undefined) ?? '';
