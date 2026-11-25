import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { messageErreur } from '../lib/erreurs';

export interface Entreprise {
  id: string; nom: string; ninea: string | null; rccm: string | null; adresse: string | null;
  telephone: string | null; email: string | null; numero_ipres: string | null; numero_css: string | null;
  taux_at: number; taux_ipm_salarie: number; taux_ipm_employeur: number; plafond_ipm: number | null;
  periodicite_sociale: 'mensuelle' | 'trimestrielle';
  convention_id: string | null;
  prefixe_matricule: string;
  compteur_matricule: number;
  plan: string; max_employes: number; essai_fin: string; abonnement_fin: string | null;
}
export type Role = 'proprietaire' | 'gestionnaire' | 'lecteur';

interface Ctx {
  entreprises: (Entreprise & { role: Role })[];
  courante: (Entreprise & { role: Role }) | null;
  choisir: (id: string) => void;
  recharger: () => Promise<void>;
  chargement: boolean;
  erreur: string | null;
  peutEcrire: boolean;
  abonnementActif: boolean;
  finAcces: string | null;
}
const C = createContext<Ctx | null>(null);

export function EntrepriseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [entreprises, setEntreprises] = useState<(Entreprise & { role: Role })[]>([]);
  const [courantId, setCourantId] = useState<string | null>(() => localStorage.getItem('senpaie_entreprise'));
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Ne dépend que de l'identifiant : le rafraîchissement du jeton Supabase (au retour sur l'onglet)
  // crée un nouvel objet user mais ne doit ni recharger ni réafficher l'écran de chargement,
  // sinon la page en cours (ex. formulaire employé) est démontée et la saisie perdue.
  const userId = user?.id;
  const recharger = useCallback(async () => {
    if (!userId) return;
    setErreur(null);
    const { data, error } = await supabase.from('membres')
      .select('role, entreprises(*)').eq('user_id', userId);
    if (error) { setErreur(messageErreur(error)); setChargement(false); return; }
    const liste = (data ?? [])
      .filter((m) => m.entreprises)
      .map((m) => ({ ...(m.entreprises as unknown as Entreprise), role: m.role as Role }));
    setEntreprises(liste);
    setChargement(false);
  }, [userId]);

  useEffect(() => { recharger(); }, [recharger]);

  const courante = entreprises.find((e) => e.id === courantId) ?? entreprises[0] ?? null;
  const choisir = (id: string) => { setCourantId(id); localStorage.setItem('senpaie_entreprise', id); };

  const finAcces = courante
    ? [courante.essai_fin, courante.abonnement_fin].filter(Boolean).sort().reverse()[0] as string
    : null;
  const abonnementActif = !!finAcces && finAcces >= new Date().toISOString().slice(0, 10);
  const peutEcrire = !!courante && courante.role !== 'lecteur' && abonnementActif;

  return (
    <C.Provider value={{ entreprises, courante, choisir, recharger, chargement, erreur, peutEcrire, abonnementActif, finAcces }}>
      {children}
    </C.Provider>
  );
}

export function useEntreprise() {
  const c = useContext(C);
  if (!c) throw new Error('useEntreprise doit être utilisé dans EntrepriseProvider');
  return c;
}
