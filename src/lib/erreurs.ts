// Traduit les erreurs techniques en messages compréhensibles (sans jargon).
export function messageErreur(err: unknown): string {
  if (!navigator.onLine) return 'Pas de connexion Internet. Vérifiez votre réseau puis réessayez.';
  const e = err as { message?: string; code?: string; status?: number } | null;
  const msg = e?.message ?? String(err ?? '');
  const code = e?.code ?? '';

  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Le serveur est injoignable. Vérifiez votre connexion puis réessayez.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(msg)) return 'Confirmez d\'abord votre adresse e-mail (lien reçu par e-mail).';
  if (/User already registered/i.test(msg)) return 'Un compte existe déjà avec cet e-mail. Connectez-vous.';
  if (/rate limit|too many/i.test(msg)) return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
  if (/Password should be/i.test(msg)) return 'Mot de passe trop faible (8 caractères minimum, avec lettres et chiffres).';
  if (/JWT expired|session/i.test(msg) && /expired|missing/i.test(msg)) return 'Votre session a expiré. Reconnectez-vous.';
  if (code === '23505') return 'Cet enregistrement existe déjà (doublon, ex. matricule déjà utilisé).';
  if (code === '23503') return 'Impossible : cet élément est utilisé ailleurs (bulletins, paiements…).';
  if (code === '42501' || /row-level security/i.test(msg)) {
    return 'Action non autorisée : droits insuffisants ou abonnement expiré (voir la page Abonnement).';
  }
  if (code === 'P0001' || code === '22023') return msg; // messages métier déjà rédigés en français
  return msg || 'Une erreur inattendue est survenue. Réessayez.';
}
