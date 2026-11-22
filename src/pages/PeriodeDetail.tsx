import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { messageErreur } from '../lib/erreurs';
import { useRequete, verifier } from '../lib/useRequete';
import { employesDuMois, genererBulletins, type BulletinRow, type Periode } from '../lib/donnees';
import { fcfa, nombre, periodeLibelle } from '../lib/format';
import { versCSV } from '../declarations/calculs';
import { telecharger } from '../lib/telecharger';
import { Bouton, Carte, Champ, Chargement, Entete, EtatErreur, EtatVide, Liste, Tableau } from '../components/ui';
import { badgeStatut } from './Paie';
import type { Employe, Rubrique } from '../paie/types';

interface Variable { id: string; employe_id: string; rubrique_id: string; montant: number; commentaire: string | null }

export default function PeriodeDetail() {
  const { periodeId } = useParams();
  const { courante, peutEcrire } = useEntreprise();
  const [calcul, setCalcul] = useState(false);
  const [alertes, setAlertes] = useState<string[]>([]);

  const { data, chargement, erreur, recharger } = useRequete(async () => {
    const periode = verifier(await supabase.from('periodes_paie').select('*').eq('id', periodeId!).single()) as Periode;
    const [employes, rubriques, variables, bulletins] = await Promise.all([
      employesDuMois(courante!.id, periode.annee, periode.mois),
      supabase.from('rubriques').select('*').eq('entreprise_id', courante!.id).eq('actif', true).order('libelle').then(verifier),
      supabase.from('elements_variables').select('*').eq('periode_id', periode.id).then(verifier),
      supabase.from('bulletins').select('*').eq('periode_id', periode.id).then(verifier),
    ]);
    return { periode, employes, rubriques: rubriques as Rubrique[], variables: variables as Variable[], bulletins: bulletins as BulletinRow[] };
  }, [periodeId, courante!.id]);

  if (chargement) return <Chargement />;
  if (erreur || !data) return <EtatErreur message={erreur ?? 'Période introuvable'} reessayer={recharger} />;
  const { periode, employes, rubriques, variables, bulletins } = data;
  const modifiable = peutEcrire && periode.statut !== 'cloturee';
  const nomEmp = (id: string) => { const e = employes.find((x) => x.id === id); return e ? `${e.prenom} ${e.nom}` : '—'; };

  async function calculer() {
    setCalcul(true); setAlertes([]);
    try {
      const r = await genererBulletins(periode, courante!);
      setAlertes(r.alertes);
      toast.success(`${r.nombre} bulletin(s) calculé(s)`);
      recharger();
    } catch (e) { toast.error(messageErreur(e)); }
    finally { setCalcul(false); }
  }

  async function changerStatut(statut: Periode['statut']) {
    if (statut === 'cloturee' && !confirm('Clôturer la période ? Les bulletins ne pourront plus être modifiés.')) return;
    const { error } = await supabase.from('periodes_paie').update({ statut }).eq('id', periode.id);
    if (error) toast.error(messageErreur(error)); else { toast.success('Statut mis à jour'); recharger(); }
  }

  function exporterLivre() {
    telecharger(`livre-de-paie-${periode.annee}-${String(periode.mois).padStart(2, '0')}.csv`, versCSV(bulletins.map((b) => ({
      matricule: b.detail.employe?.matricule, nom: nomEmp(b.employe_id), brut: b.brut, ipres_rg_sal: b.ipres_rg_sal, ipres_rcc_sal: b.ipres_rcc_sal,
      ipm_sal: b.ipm_sal, ir: b.ir, trimf: b.trimf, autres_retenues: b.autres_retenues, net_a_payer: b.net_a_payer,
      ipres_rg_pat: b.ipres_rg_pat, ipres_rcc_pat: b.ipres_rcc_pat, css_pf: b.css_pf, css_at: b.css_at, ipm_pat: b.ipm_pat, cfce: b.cfce, cout_employeur: b.cout_employeur,
    }))));
  }

  const total = (k: keyof BulletinRow) => bulletins.reduce((s, b) => s + Number(b[k] ?? 0), 0);

  return (
    <>
      <Entete titre={`Paie de ${periodeLibelle(periode.annee, periode.mois)}`} sousTitre={`${employes.length} employé(s) présent(s) sur le mois`}
        actions={<>
          {badgeStatut(periode.statut)}
          {modifiable && <Bouton onClick={calculer} chargement={calcul}>{bulletins.length ? 'Recalculer' : 'Calculer les bulletins'}</Bouton>}
          {peutEcrire && periode.statut === 'brouillon' && bulletins.length > 0 && <Bouton variante="secondaire" onClick={() => changerStatut('validee')}>Valider</Bouton>}
          {peutEcrire && periode.statut === 'validee' && <><Bouton variante="secondaire" onClick={() => changerStatut('brouillon')}>Repasser en brouillon</Bouton><Bouton variante="secondaire" onClick={() => changerStatut('cloturee')}>Clôturer</Bouton></>}
        </>} />

      {alertes.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Points d'attention :</b><ul className="mt-1 list-disc pl-5">{alertes.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      {employes.length === 0 ? (
        <EtatVide icone="👥" titre="Aucun employé sur ce mois" texte="Ajoutez des employés (date d'embauche antérieure à la fin du mois) pour calculer la paie." action={{ libelle: 'Ajouter un employé', vers: '/employes/nouveau' }} />
      ) : (
        <>
          <Variables periode={periode} employes={employes} rubriques={rubriques} variables={variables} modifiable={modifiable} onChange={recharger} />

          <Carte titre="Bulletins" className="mt-6" actions={bulletins.length > 0 && <Bouton variante="secondaire" onClick={exporterLivre}>Exporter le livre de paie (Excel)</Bouton>}>
            {bulletins.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Aucun bulletin calculé. Cliquez sur « Calculer les bulletins ».</p>
            ) : (
              <Tableau entetes={['Employé', 'Brut', 'IPRES sal.', 'IR', 'TRIMF', 'Net à payer', 'Coût employeur', '']}>
                {bulletins.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2 font-medium">{nomEmp(b.employe_id)}</td>
                    <td className="px-4 py-2">{nombre(b.brut)}</td>
                    <td className="px-4 py-2">{nombre(b.ipres_rg_sal + b.ipres_rcc_sal)}</td>
                    <td className="px-4 py-2">{nombre(b.ir)}</td>
                    <td className="px-4 py-2">{nombre(b.trimf)}</td>
                    <td className="px-4 py-2 font-semibold">{nombre(b.net_a_payer)}</td>
                    <td className="px-4 py-2">{nombre(b.cout_employeur)}</td>
                    <td className="px-4 py-2 text-right"><Link className="text-marque-700 hover:underline" to={`/paie/${periode.id}/bulletin/${b.id}`} target="_blank">Bulletin PDF</Link></td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2">{nombre(total('brut'))}</td>
                  <td className="px-4 py-2">{nombre(total('ipres_rg_sal') + total('ipres_rcc_sal'))}</td>
                  <td className="px-4 py-2">{nombre(total('ir'))}</td>
                  <td className="px-4 py-2">{nombre(total('trimf'))}</td>
                  <td className="px-4 py-2">{fcfa(total('net_a_payer'))}</td>
                  <td className="px-4 py-2">{fcfa(total('cout_employeur'))}</td><td />
                </tr>
              </Tableau>
            )}
          </Carte>
        </>
      )}
    </>
  );
}

function Variables({ periode, employes, rubriques, variables, modifiable, onChange }:
  { periode: Periode; employes: Employe[]; rubriques: Rubrique[]; variables: Variable[]; modifiable: boolean; onChange: () => void }) {
  const { courante } = useEntreprise();
  const [emp, setEmp] = useState('');
  const [rub, setRub] = useState('');
  const [mt, setMt] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function ajouter() {
    const m = Number(mt);
    if (!emp || !rub) { toast.error('Choisissez l\'employé et la rubrique.'); return; }
    if (!Number.isInteger(m) || m <= 0) { toast.error('Le montant doit être un nombre entier positif (FCFA).'); return; }
    setEnvoi(true);
    const { error } = await supabase.from('elements_variables').insert({ entreprise_id: courante!.id, periode_id: periode.id, employe_id: emp, rubrique_id: rub, montant: m });
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    setMt(''); onChange(); toast.success('Élément ajouté — pensez à recalculer');
  }
  async function supprimer(id: string) {
    const { error } = await supabase.from('elements_variables').delete().eq('id', id);
    if (error) toast.error(messageErreur(error)); else onChange();
  }

  return (
    <Carte titre="Éléments variables du mois" actions={<span className="text-xs text-slate-500">Heures sup, primes exceptionnelles, absences, avances…</span>}>
      {variables.length === 0 ? <p className="text-sm text-slate-500">Aucun élément variable ce mois-ci.</p> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {variables.map((v) => (
            <li key={v.id} className="flex items-center justify-between py-2">
              <span>{employes.find((e) => e.id === v.employe_id)?.prenom} {employes.find((e) => e.id === v.employe_id)?.nom} — {rubriques.find((r) => r.id === v.rubrique_id)?.libelle}</span>
              <span className="flex gap-4"><b>{fcfa(v.montant)}</b>{modifiable && <button className="text-red-600 hover:underline" onClick={() => supprimer(v.id)}>Supprimer</button>}</span>
            </li>
          ))}
        </ul>
      )}
      {modifiable && (
        <div className="mt-4 grid gap-3 md:grid-cols-4 md:items-end">
          <Liste label="Employé" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Choisir…</option>{employes.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}</Liste>
          <Liste label="Rubrique" value={rub} onChange={(e) => setRub(e.target.value)}><option value="">Choisir…</option>{rubriques.map((r) => <option key={r.id} value={r.id}>{r.libelle}</option>)}</Liste>
          <Champ label="Montant (FCFA)" type="number" min={0} value={mt} onChange={(e) => setMt(e.target.value)} />
          <Bouton variante="secondaire" onClick={ajouter} chargement={envoi}>Ajouter</Bouton>
        </div>
      )}
    </Carte>
  );
}
