import { useState } from 'react';
import { toast } from 'sonner';
import { supabase, LIEN_ACHAT, WHATSAPP } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { messageErreur } from '../lib/erreurs';
import { dateFr, estAVie, joursRestants } from '../lib/format';
import { Badge, Bouton, Carte, Champ, Entete } from '../components/ui';

// Formules (prix indicatifs, à ajuster) — les clés sont vendues sur la boutique Chariow
export const PLANS = [
  { code: 'starter', nom: 'Starter', employes: 10, mensuel: '3 000', annuel: '25 000', aVie: '62 500', pour: 'Très petites entreprises, commerces' },
  { code: 'pro', nom: 'Pro', employes: 50, mensuel: '6 000', annuel: '50 000', aVie: '125 000', pour: 'PME en croissance' },
  { code: 'entreprise', nom: 'Entreprise / Cabinet', employes: 300, mensuel: '9 000', annuel: '75 000', aVie: '187 500', pour: 'Cabinets comptables, PME structurées' },
];

export default function Abonnement() {
  const { courante, recharger, finAcces, abonnementActif } = useEntreprise();
  const [cle, setCle] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const proprio = courante!.role === 'proprietaire';

  async function activer() {
    const c = cle.trim().toUpperCase();
    if (!/^SENP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) { toast.error('Format de clé attendu : SENP-XXXX-XXXX-XXXX'); return; }
    setEnvoi(true);
    const { data, error } = await supabase.rpc('activer_licence', { p_entreprise: courante!.id, p_cle: c });
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    const d = data as { plan: string; abonnement_fin: string; a_vie?: boolean };
    toast.success(d.a_vie ? `Licence ${d.plan} à vie activée 🎉` : `Licence ${d.plan} activée jusqu'au ${dateFr(d.abonnement_fin)} 🎉`);
    setCle(''); recharger();
  }

  return (
    <>
      <Entete titre="Abonnement" sousTitre="Activez ou renouvelez votre licence SenPaie" />
      <Carte titre="Votre formule">
        <div className="flex flex-wrap items-center gap-4">
          <Badge couleur={abonnementActif ? 'vert' : 'rouge'}>{courante!.plan === 'essai' ? 'Essai gratuit' : courante!.plan.toUpperCase()}</Badge>
          {estAVie(finAcces) && <Badge couleur="bleu">À VIE</Badge>}
          <span className="text-sm">{estAVie(finAcces) ? <>Licence <b>à vie</b> : aucun renouvellement nécessaire.</> : abonnementActif ? <>Accès jusqu'au <b>{dateFr(finAcces)}</b> ({joursRestants(finAcces!)} jours restants)</> : <>Accès expiré depuis le <b>{dateFr(finAcces)}</b> — vos données restent consultables.</>}</span>
          <span className="text-sm text-slate-500">Jusqu'à {courante!.max_employes} employés actifs</span>
        </div>
      </Carte>

      <Carte titre="Activer une clé de licence" className="mt-6">
        {proprio ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm"><Champ label="Clé reçue après achat" placeholder="SENP-XXXX-XXXX-XXXX" value={cle} onChange={(e) => setCle(e.target.value)} /></div>
            <Bouton onClick={activer} chargement={envoi}>Activer</Bouton>
          </div>
        ) : <p className="text-sm text-slate-500">Seul le propriétaire du compte peut activer une licence.</p>}
        <p className="mt-3 text-xs text-slate-500">La durée de la licence s'ajoute à votre date de fin actuelle : vous ne perdez aucun jour en renouvelant en avance. Une licence à vie supprime toute échéance.</p>
      </Carte>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.code} className={`rounded-xl border bg-white p-6 shadow-sm ${p.code === 'pro' ? 'border-marque-700 ring-2 ring-marque-600' : 'border-slate-200'}`}>
            {p.code === 'pro' && <Badge couleur="vert">Le plus choisi</Badge>}
            <h3 className="mt-2 text-lg font-bold">{p.nom}</h3>
            <p className="text-sm text-slate-500">{p.pour}</p>
            <p className="mt-4 text-2xl font-bold">{p.mensuel} <span className="text-sm font-normal">FCFA / mois</span></p>
            <p className="text-sm text-slate-500">ou {p.annuel} FCFA / an (plus de 3 mois offerts)</p>
            <p className="mt-1 text-sm font-semibold text-marque-700">ou {p.aVie} FCFA une seule fois — licence à vie</p>
            <ul className="mt-4 space-y-1 text-sm"><li>✓ Jusqu'à {p.employes} employés</li><li>✓ Bulletins illimités</li><li>✓ VRS, BRS, IPRES, CSS</li><li>✓ Exports Excel</li></ul>
            {LIEN_ACHAT && <a href={LIEN_ACHAT} target="_blank" rel="noopener noreferrer" className="mt-5 block rounded-lg bg-marque-700 py-2 text-center text-sm font-medium text-white hover:bg-marque-900">Acheter (Wave / Orange Money)</a>}
          </div>
        ))}
      </div>
      {WHATSAPP && <p className="mt-6 text-center text-sm">Besoin d'aide ? <a className="text-marque-700 hover:underline" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">Écrivez-nous sur WhatsApp</a></p>}
    </>
  );
}
