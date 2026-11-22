import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { messageErreur } from '../lib/erreurs';
import { useEntreprise } from '../context/EntrepriseProvider';
import { useAuth } from '../auth/AuthProvider';
import { Bouton, Champ, Chargement } from '../components/ui';
import { AuthCadre } from './AuthCadre';

export default function Onboarding() {
  const { entreprises, chargement, recharger, choisir } = useEntreprise();
  const { deconnexion } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ nom: '', ninea: '', adresse: '', telephone: '', email: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const nouvelle = new URLSearchParams(location.search).has('nouvelle');

  if (chargement) return <Chargement />;
  if (entreprises.length > 0 && !nouvelle) return <Navigate to="/" replace />;

  async function soumettre(e: FormEvent) {
    e.preventDefault(); setErreur(null);
    if (f.nom.trim().length < 2) { setErreur('Indiquez la raison sociale de l\'entreprise.'); return; }
    if (f.ninea && !/^[0-9A-Za-z ]{7,15}$/.test(f.ninea.trim())) { setErreur('NINEA invalide (7 à 15 caractères).'); return; }
    setEnvoi(true);
    const { data, error } = await supabase.rpc('creer_entreprise', {
      p_nom: f.nom, p_ninea: f.ninea, p_adresse: f.adresse, p_telephone: f.telephone, p_email: f.email,
    });
    setEnvoi(false);
    if (error) { setErreur(messageErreur(error)); return; }
    await recharger(); choisir(data as string);
    toast.success('Entreprise créée — votre essai gratuit de 30 jours commence !');
    nav('/employes/nouveau', { replace: true });
  }

  return (
    <AuthCadre titre="Votre entreprise" sousTitre="Dernière étape avant votre premier bulletin">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        {erreur && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}
        <Champ label="Raison sociale" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
        <Champ label="NINEA" value={f.ninea} onChange={(e) => setF({ ...f, ninea: e.target.value })} aide="Facultatif, figurera sur les bulletins et déclarations" />
        <Champ label="Adresse" value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Téléphone" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
          <Champ label="E-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <Bouton type="submit" chargement={envoi} className="w-full">Créer mon espace</Bouton>
        <button type="button" onClick={deconnexion} className="w-full text-center text-sm text-slate-500 hover:underline">Se déconnecter</button>
      </form>
    </AuthCadre>
  );
}
