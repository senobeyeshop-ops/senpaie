import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { messageErreur } from '../lib/erreurs';
import { erreursChamps, schemaInscription } from '../auth/validation';
import { Bouton, Champ } from '../components/ui';
import { AuthCadre } from './AuthCadre';

export default function Inscription() {
  const { session } = useAuth();
  const [f, setF] = useState({ nom_complet: '', telephone: '', email: '', mot_de_passe: '', confirmation: '' });
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  if (session) return <Navigate to="/" replace />;

  const maj = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function soumettre(e: FormEvent) {
    e.preventDefault(); setErreur(null);
    const r = schemaInscription.safeParse(f);
    if (!r.success) { setErreurs(erreursChamps(r.error)); return; }
    setErreurs({}); setChargement(true);
    const { data, error } = await supabase.auth.signUp({
      email: r.data.email, password: r.data.mot_de_passe,
      options: {
        data: { nom_complet: r.data.nom_complet, telephone: r.data.telephone },
        emailRedirectTo: `${window.location.origin}/bienvenue`,
      },
    });
    setChargement(false);
    if (error) { setErreur(messageErreur(error)); return; }
    if (!data.session) setEnvoye(true); // confirmation e-mail activée
  }

  if (envoye) return (
    <AuthCadre titre="Vérifiez vos e-mails 📩">
      <p className="text-slate-600">Un lien de confirmation a été envoyé à <b>{f.email}</b>. Cliquez dessus pour activer votre compte et démarrer votre essai gratuit de 30 jours.</p>
      <Link to="/connexion" className="mt-6 inline-block text-marque-700 hover:underline">Retour à la connexion</Link>
    </AuthCadre>
  );

  return (
    <AuthCadre titre="Créer un compte" sousTitre="30 jours d'essai gratuit, sans engagement">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        {erreur && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}
        <Champ label="Nom complet" value={f.nom_complet} onChange={maj('nom_complet')} erreur={erreurs.nom_complet} required />
        <Champ label="Téléphone" type="tel" placeholder="77 123 45 67" value={f.telephone} onChange={maj('telephone')} erreur={erreurs.telephone} />
        <Champ label="E-mail" type="email" autoComplete="email" value={f.email} onChange={maj('email')} erreur={erreurs.email} required />
        <Champ label="Mot de passe" type="password" autoComplete="new-password" value={f.mot_de_passe} onChange={maj('mot_de_passe')} erreur={erreurs.mot_de_passe} aide="8 caractères minimum, avec lettres et chiffres" required />
        <Champ label="Confirmer le mot de passe" type="password" autoComplete="new-password" value={f.confirmation} onChange={maj('confirmation')} erreur={erreurs.confirmation} required />
        <Bouton type="submit" chargement={chargement} className="w-full">Créer mon compte</Bouton>
        <p className="text-center text-sm text-slate-600">Déjà inscrit ? <Link to="/connexion" className="font-medium text-marque-700 hover:underline">Se connecter</Link></p>
      </form>
    </AuthCadre>
  );
}
