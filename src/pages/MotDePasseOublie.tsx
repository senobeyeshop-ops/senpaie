import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { messageErreur } from '../lib/erreurs';
import { schemaEmail } from '../auth/validation';
import { Bouton, Champ } from '../components/ui';
import { AuthCadre } from './AuthCadre';

export default function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'envoye'>('saisie');
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: FormEvent) {
    e.preventDefault(); setErreur(null);
    const r = schemaEmail.safeParse(email);
    if (!r.success) { setErreur('Adresse e-mail invalide'); return; }
    setEtat('envoi');
    const { error } = await supabase.auth.resetPasswordForEmail(r.data, { redirectTo: `${window.location.origin}/nouveau-mot-de-passe` });
    // Message identique que le compte existe ou non (pas d'énumération des comptes)
    if (error && !/not found/i.test(error.message)) { setErreur(messageErreur(error)); setEtat('saisie'); return; }
    setEtat('envoye');
  }

  return (
    <AuthCadre titre="Mot de passe oublié" sousTitre="Recevez un lien de réinitialisation par e-mail">
      {etat === 'envoye' ? (
        <p className="text-slate-600">Si un compte existe pour <b>{email}</b>, un e-mail de réinitialisation vient d'être envoyé. Pensez à vérifier vos spams.</p>
      ) : (
        <form onSubmit={soumettre} className="space-y-4" noValidate>
          {erreur && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}
          <Champ label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Bouton type="submit" chargement={etat === 'envoi'} className="w-full">Envoyer le lien</Bouton>
        </form>
      )}
      <Link to="/connexion" className="mt-6 inline-block text-sm text-marque-700 hover:underline">← Retour à la connexion</Link>
    </AuthCadre>
  );
}
