import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { messageErreur } from '../lib/erreurs';
import { useRequete, verifier } from '../lib/useRequete';
import { dateFr, fcfa, pct } from '../lib/format';
import { Bouton, Carte, Champ, Chargement, Entete, EtatErreur, EtatVide, Liste, Tableau } from '../components/ui';

interface Prestataire { id: string; nom: string; ninea: string | null; telephone: string | null }
interface Paiement { id: string; prestataire_id: string; date_paiement: string; nature: string; description: string | null; reference: string | null; montant_brut: number; taux_retenue: number; montant_retenue: number }

export default function Brs() {
  const { courante, peutEcrire } = useEntreprise();
  const eid = courante!.id;
  const { data, chargement, erreur, recharger } = useRequete(async () => {
    const [prest, paie] = await Promise.all([
      supabase.from('prestataires').select('*').eq('entreprise_id', eid).order('nom').then(verifier),
      supabase.from('paiements_tiers').select('*').eq('entreprise_id', eid).order('date_paiement', { ascending: false }).limit(200).then(verifier),
    ]);
    return { prest: prest as Prestataire[], paie: paie as Paiement[] };
  }, [eid]);

  const [np, setNp] = useState({ nom: '', ninea: '', telephone: '' });
  const [pa, setPa] = useState({ prestataire_id: '', date_paiement: new Date().toISOString().slice(0, 10), nature: 'prestation', montant_brut: '', taux: '5', reference: '', description: '' });
  const [envoi, setEnvoi] = useState(false);

  async function ajouterPrestataire() {
    if (np.nom.trim().length < 2) { toast.error('Indiquez le nom du prestataire.'); return; }
    const { error } = await supabase.from('prestataires').insert({ entreprise_id: eid, nom: np.nom.trim(), ninea: np.ninea.trim() || null, telephone: np.telephone.trim() || null });
    if (error) { toast.error(messageErreur(error)); return; }
    setNp({ nom: '', ninea: '', telephone: '' }); toast.success('Prestataire ajouté'); recharger();
  }

  async function ajouterPaiement() {
    const m = Number(pa.montant_brut); const t = Number(pa.taux) / 100;
    if (!pa.prestataire_id) { toast.error('Choisissez le prestataire.'); return; }
    if (!Number.isInteger(m) || m <= 0) { toast.error('Montant brut : nombre entier positif en FCFA.'); return; }
    if (!(t >= 0 && t <= 0.5)) { toast.error('Taux de retenue entre 0 et 50 %.'); return; }
    setEnvoi(true);
    const { error } = await supabase.from('paiements_tiers').insert({ entreprise_id: eid, prestataire_id: pa.prestataire_id, date_paiement: pa.date_paiement, nature: pa.nature, montant_brut: m, taux_retenue: t, reference: pa.reference || null, description: pa.description || null });
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    setPa({ ...pa, montant_brut: '', reference: '', description: '' }); toast.success('Paiement enregistré'); recharger();
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer ce paiement ?')) return;
    const { error } = await supabase.from('paiements_tiers').delete().eq('id', id);
    if (error) toast.error(messageErreur(error)); else recharger();
  }

  if (chargement) return <Chargement />;
  if (erreur || !data) return <EtatErreur message={erreur ?? 'Erreur'} reessayer={recharger} />;
  const nomP = (id: string) => data.prest.find((p) => p.id === id)?.nom ?? '—';
  const montantPreview = Number(pa.montant_brut) > 0 ? Math.round(Number(pa.montant_brut) * Number(pa.taux) / 100) : 0;

  return (
    <>
      <Entete titre="Prestataires & retenues à la source (BRS)" sousTitre="Saisissez les paiements soumis à retenue : SenPaie prépare le bordereau mensuel." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Carte titre="Prestataires">
          {data.prest.length === 0 ? <p className="mb-4 text-sm text-slate-500">Aucun prestataire. Ajoutez-en un ci-dessous.</p> : (
            <ul className="mb-4 divide-y divide-slate-100 text-sm">{data.prest.map((p) => <li key={p.id} className="py-2"><b>{p.nom}</b> <span className="text-slate-500">{p.ninea ? `· NINEA ${p.ninea}` : '· sans NINEA'}</span></li>)}</ul>
          )}
          {peutEcrire && (
            <div className="space-y-3">
              <Champ label="Nom" value={np.nom} onChange={(e) => setNp({ ...np, nom: e.target.value })} />
              <Champ label="NINEA" value={np.ninea} onChange={(e) => setNp({ ...np, ninea: e.target.value })} />
              <Champ label="Téléphone" value={np.telephone} onChange={(e) => setNp({ ...np, telephone: e.target.value })} />
              <Bouton variante="secondaire" onClick={ajouterPrestataire} className="w-full">Ajouter le prestataire</Bouton>
            </div>
          )}
        </Carte>

        <Carte titre="Nouveau paiement" className="lg:col-span-2">
          {data.prest.length === 0 ? <p className="text-sm text-slate-500">Ajoutez d'abord un prestataire.</p> : peutEcrire ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Liste label="Prestataire" value={pa.prestataire_id} onChange={(e) => setPa({ ...pa, prestataire_id: e.target.value })}><option value="">Choisir…</option>{data.prest.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</Liste>
              <Champ label="Date de paiement" type="date" value={pa.date_paiement} onChange={(e) => setPa({ ...pa, date_paiement: e.target.value })} />
              <Liste label="Nature" value={pa.nature} onChange={(e) => setPa({ ...pa, nature: e.target.value })}>
                <option value="prestation">Prestation de services</option><option value="honoraires">Honoraires</option><option value="loyer">Loyer</option><option value="commission">Commission</option><option value="autre">Autre</option>
              </Liste>
              <Champ label="Montant brut (FCFA)" type="number" min={1} value={pa.montant_brut} onChange={(e) => setPa({ ...pa, montant_brut: e.target.value })} />
              <Champ label="Taux de retenue (%)" type="number" step="0.5" min={0} max={50} value={pa.taux} onChange={(e) => setPa({ ...pa, taux: e.target.value })} aide="5 % par défaut — à adapter selon la nature" />
              <Champ label="Référence (facture, reçu)" value={pa.reference} onChange={(e) => setPa({ ...pa, reference: e.target.value })} />
              <div className="md:col-span-3 flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
                <span>Retenue à reverser : <b>{fcfa(montantPreview)}</b> · Net versé au prestataire : <b>{fcfa((Number(pa.montant_brut) || 0) - montantPreview)}</b></span>
                <Bouton onClick={ajouterPaiement} chargement={envoi}>Enregistrer</Bouton>
              </div>
            </div>
          ) : <p className="text-sm text-slate-500">Lecture seule.</p>}
        </Carte>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Paiements enregistrés</h2>
      {data.paie.length === 0 ? <EtatVide icone="🤝" titre="Aucun paiement" texte="Les paiements saisis ici alimentent automatiquement votre BRS mensuel (menu Déclarations)." /> : (
        <Tableau entetes={['Date', 'Prestataire', 'Nature', 'Brut', 'Taux', 'Retenue', '']}>
          {data.paie.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2">{dateFr(p.date_paiement)}</td><td className="px-4 py-2">{nomP(p.prestataire_id)}</td><td className="px-4 py-2 capitalize">{p.nature}</td>
              <td className="px-4 py-2">{fcfa(p.montant_brut)}</td><td className="px-4 py-2">{pct(p.taux_retenue)}</td><td className="px-4 py-2 font-semibold">{fcfa(p.montant_retenue)}</td>
              <td className="px-4 py-2 text-right">{peutEcrire && <button className="text-red-600 hover:underline" onClick={() => supprimer(p.id)}>Supprimer</button>}</td>
            </tr>
          ))}
        </Tableau>
      )}
    </>
  );
}
