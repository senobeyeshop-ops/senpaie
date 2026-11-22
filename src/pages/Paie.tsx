import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { messageErreur } from '../lib/erreurs';
import { useRequete, verifier } from '../lib/useRequete';
import { MOIS, periodeLibelle } from '../lib/format';
import { Badge, Bouton, Carte, Chargement, Entete, EtatErreur, EtatVide, Liste, Tableau } from '../components/ui';
import type { Periode } from '../lib/donnees';

export const badgeStatut = (s: string) =>
  s === 'cloturee' ? <Badge couleur="gris">Clôturée</Badge> : s === 'validee' ? <Badge couleur="vert">Validée</Badge> : <Badge couleur="orange">Brouillon</Badge>;

export default function Paie() {
  const { courante, peutEcrire } = useEntreprise();
  const nav = useNavigate();
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [envoi, setEnvoi] = useState(false);

  const { data, chargement, erreur, recharger } = useRequete(async () =>
    verifier(await supabase.from('periodes_paie').select('*').eq('entreprise_id', courante!.id)
      .order('annee', { ascending: false }).order('mois', { ascending: false })) as Periode[], [courante!.id]);

  async function ouvrir() {
    const existe = data?.find((p) => p.annee === annee && p.mois === mois);
    if (existe) { nav(`/paie/${existe.id}`); return; }
    setEnvoi(true);
    const { data: p, error } = await supabase.from('periodes_paie').insert({ entreprise_id: courante!.id, annee, mois }).select('id').single();
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    nav(`/paie/${p.id}`);
  }

  if (chargement) return <Chargement />;
  if (erreur) return <EtatErreur message={erreur} reessayer={recharger} />;

  return (
    <>
      <Entete titre="Paie & bulletins" sousTitre="Un mois de paie = une période. Saisissez les variables, calculez, validez." />
      {peutEcrire && (
        <Carte titre="Ouvrir un mois de paie" className="mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44"><Liste label="Mois" value={mois} onChange={(e) => setMois(Number(e.target.value))}>{MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Liste></div>
            <div className="w-32"><Liste label="Année" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>{[0, 1, 2].map((d) => now.getFullYear() - d).concat(now.getFullYear() + 1).sort().map((a) => <option key={a}>{a}</option>)}</Liste></div>
            <Bouton onClick={ouvrir} chargement={envoi}>Ouvrir</Bouton>
          </div>
        </Carte>
      )}
      {(data ?? []).length === 0 ? (
        <EtatVide icone="🗓️" titre="Aucun mois de paie" texte="Ouvrez votre premier mois ci-dessus pour générer les bulletins de vos employés." />
      ) : (
        <Tableau entetes={['Période', 'Statut', '']}>
          {data!.map((p) => (
            <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/paie/${p.id}`)}>
              <td className="px-4 py-3 font-medium">{periodeLibelle(p.annee, p.mois)}</td>
              <td className="px-4 py-3">{badgeStatut(p.statut)}</td>
              <td className="px-4 py-3 text-right text-marque-700">Ouvrir →</td>
            </tr>
          ))}
        </Tableau>
      )}
    </>
  );
}
