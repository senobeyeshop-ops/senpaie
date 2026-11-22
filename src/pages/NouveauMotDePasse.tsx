import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { messageErreur } from '../lib/erreurs';
import { schemaMotDePasse } from '../auth/validation';
import { Bouton, Champ } from '../components/ui';
import { AuthCadre } from './AuthCadre';

export default function NouveauMotDePasse() {
  const nav = useNavigate();
  const [mdp, setMdp] = useState('');
  const [conf, setConf] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Le lien e-mail ouvre une session temporaire de récupération
    supabase.auth.getSession().then(({ data }) => setSessionOk(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((evt) => { if (evt === 'PASSWORD_RECOVERY') setSessionOk(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function soumettre(e: FormEvent) {
    e.preventDefault(); setErreur(null);
    const r = schemaMotDePasse.safeParse(mdp);
    if (!r.success) { setErreur(r.error.issues[0].message); return; }
    if (mdp !== conf) { setErreur('Les mots de passe ne correspondent pas'); return; }
    setChargement(true);
    const { error } = await supabase.auth.updateUser({ password: mdp });
    setChargement(false);
    if (error) { setErreur(messageErreur(error)); return; }
    toast.success('Mot de passe modifié');
    nav('/', { replace: true });
  }

  return (
    <AuthCadre titre="Nouveau mot de passe">
      {sessionOk === false ? (
        <p className="text-slate-600">Ce lien est invalide ou a expiré. Refaites une demande depuis « Mot de passe oublié ».</p>
      ) : (
        <form onSubmit={soumettre} className="space-y-4" noValidate>
          {erreur && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}
          <Champ label="Nouveau mot de passe" type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} aide="8 caractères minimum, avec lettres et chiffres" />
          <Champ label="Confirmer" type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} />
          <Bouton type="submit" chargement={chargement} className="w-full">Enregistrer</Bouton>
        </form>
      )}
    </AuthCadre>
  );
}
