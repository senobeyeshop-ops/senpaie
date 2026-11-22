import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { messageErreur } from '../lib/erreurs';
import { enregistrerEchec, reinitialiserTentatives, schemaEmail, verifierTentatives } from '../auth/validation';
import { Bouton, Champ } from '../components/ui';
import { AuthCadre } from './AuthCadre';

export default function Connexion() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { depuis?: string } };
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (session) return <Navigate to={loc.state?.depuis ?? '/'} replace />;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    const bloque = verifierTentatives();
    if (bloque) { setErreur(bloque); return; }
    const em = schemaEmail.safeParse(email);
    if (!em.success) { setErreur('Adresse e-mail invalide'); return; }
    if (!mdp) { setErreur('Saisissez votre mot de passe'); return; }
    setChargement(true);
    const { error } = await supabase.auth.signInWithPassword({ email: em.data, password: mdp });
    setChargement(false);
    if (error) { enregistrerEchec(); setErreur(messageErreur(error)); return; }
    reinitialiserTentatives();
    toast.success('Bienvenue sur SenPaie');
    nav(loc.state?.depuis ?? '/', { replace: true });
  }

  return (
    <AuthCadre titre="Connexion" sousTitre="Accédez à votre espace paie">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        {erreur && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}
        <Champ label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Champ label="Mot de passe" type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
        <div className="text-right"><Link to="/mot-de-passe-oublie" className="text-sm text-marque-700 hover:underline">Mot de passe oublié ?</Link></div>
        <Bouton type="submit" chargement={chargement} className="w-full">Se connecter</Bouton>
        <p className="text-center text-sm text-slate-600">Pas encore de compte ? <Link to="/inscription" className="font-medium text-marque-700 hover:underline">Essai gratuit 30 jours</Link></p>
      </form>
    </AuthCadre>
  );
}
