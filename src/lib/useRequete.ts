import { useCallback, useEffect, useState } from 'react';
import { messageErreur } from './erreurs';

/** Hook générique : gère chargement, erreur et rechargement d'une requête. */
export function useRequete<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const executer = useCallback(fn, deps);
  const recharger = useCallback(async () => {
    setChargement(true); setErreur(null);
    try { setData(await executer()); }
    catch (e) { setErreur(messageErreur(e)); }
    finally { setChargement(false); }
  }, [executer]);

  useEffect(() => { recharger(); }, [recharger]);
  return { data, chargement, erreur, recharger, setData };
}

/** Lève l'erreur Supabase pour qu'elle soit capturée par useRequete / try-catch. */
export function verifier<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
