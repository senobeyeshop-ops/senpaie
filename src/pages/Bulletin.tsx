import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { useRequete, verifier } from '../lib/useRequete';
import { dateFr, MOIS, nombre, pct } from '../lib/format';
import { Bouton, Chargement, EtatErreur } from '../components/ui';
import type { BulletinRow, Periode } from '../lib/donnees';

const libSituation: Record<string, string> = { celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf / veuve' };
const libMode: Record<string, string> = { virement: 'Virement', wave: 'Wave', orange_money: 'Orange Money', especes: 'Espèces', cheque: 'Chèque' };

export default function Bulletin() {
  const { bulletinId, periodeId } = useParams();
  const { courante: e } = useEntreprise();
  const { data, chargement, erreur, recharger } = useRequete(async () => {
    const b = verifier(await supabase.from('bulletins').select('*').eq('id', bulletinId!).single()) as BulletinRow;
    const p = verifier(await supabase.from('periodes_paie').select('*').eq('id', periodeId!).single()) as Periode;
    return { b, p };
  }, [bulletinId, periodeId]);

  if (chargement) return <Chargement />;
  if (erreur || !data) return <div className="p-8"><EtatErreur message={erreur ?? 'Bulletin introuvable'} reessayer={recharger} /></div>;
  const { b, p } = data;
  const emp = b.detail.employe ?? {};
  const lignes = b.detail.lignes ?? [];
  const lignesBrut = lignes.filter((l) => !l.hors_brut);
  const lignesHorsBrut = lignes.filter((l) => l.hors_brut);
  const horsBrut = Number(b.detail.hors_brut ?? 0);
  const cellule = 'border border-slate-200 px-2 py-1';

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-between px-2">
        <Link to={`/paie/${p.id}`} className="text-sm text-marque-700 hover:underline">← Retour à la période</Link>
        <Bouton onClick={() => window.print()}>Imprimer / Enregistrer en PDF</Bouton>
      </div>
      <article className="print-page mx-auto max-w-[210mm] bg-white p-8 text-[12px] shadow">
        <header className="flex justify-between border-b-2 border-marque-700 pb-3">
          <div>
            <h1 className="text-lg font-bold text-marque-900">{e?.nom}</h1>
            <p>{e?.adresse}</p>
            <p>NINEA : {e?.ninea ?? '—'} · IPRES : {e?.numero_ipres ?? '—'} · CSS : {e?.numero_css ?? '—'}</p>
          </div>
          <div className="text-right">
            <h2 className="text-base font-bold uppercase">Bulletin de paie</h2>
            <p>Période : {MOIS[p.mois - 1]} {p.annee}</p>
            {p.date_paiement && <p>Payé le : {dateFr(p.date_paiement)}</p>}
          </div>
        </header>

        <section className="mt-3 grid grid-cols-2 gap-x-6 gap-y-0.5 rounded border border-slate-300 p-3">
          <p><b>Nom :</b> {emp.prenom} {emp.nom}</p>
          <p><b>Matricule :</b> {emp.matricule}</p>
          <p><b>Emploi :</b> {emp.poste ?? '—'}</p>
          <p><b>Catégorie :</b> {emp.categorie ?? '—'} {emp.est_cadre ? '(Cadre)' : ''}</p>
          <p><b>Date d'embauche :</b> {dateFr(emp.date_embauche)}</p>
          <p><b>N° IPRES / CSS :</b> {emp.numero_ipres ?? '—'} / {emp.numero_css ?? '—'}</p>
          <p><b>Situation :</b> {libSituation[emp.situation_familiale ?? ''] ?? '—'} · {emp.nombre_enfants ?? 0} enfant(s)</p>
          <p><b>Parts fiscales :</b> {b.nb_parts}</p>
        </section>

        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr className="bg-marque-700 text-white">
              <th className="border border-slate-300 px-2 py-1 text-left">Rubrique</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Base</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Taux</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Gains</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Retenues</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Part patronale</th>
            </tr>
          </thead>
          <tbody>
            {lignesBrut.map((l, i) => (
              <Fragment key={i}>
                {l.code === 'IPRES_RG' && (
                  <tr className="bg-slate-50 font-semibold">
                    <td className={cellule}>Salaire brut</td><td className={cellule} /><td className={cellule} />
                    <td className={`${cellule} text-right`}>{nombre(b.brut)}</td><td className={cellule} /><td className={cellule} />
                  </tr>
                )}
                <tr className={l.code === 'IPRES_RG' ? 'border-t-2 border-slate-400' : ''}>
                <td className="border border-slate-200 px-2 py-1">{l.libelle}</td>
                <td className="border border-slate-200 px-2 py-1 text-right">{l.base != null ? nombre(l.base) : ''}</td>
                <td className="border border-slate-200 px-2 py-1 text-right">{l.taux != null ? pct(l.taux) : ''}</td>
                <td className="border border-slate-200 px-2 py-1 text-right">{l.gain ? nombre(l.gain) : ''}</td>
                <td className="border border-slate-200 px-2 py-1 text-right">{l.retenue ? nombre(l.retenue) : ''}</td>
                <td className="border border-slate-200 px-2 py-1 text-right">{l.patronal ? nombre(l.patronal) : ''}</td>
                </tr>
              </Fragment>
            ))}
            {lignesHorsBrut.length > 0 && (
              <tr className="border-t-2 border-slate-400 bg-slate-50 font-semibold">
                <td className={cellule} colSpan={6}>Indemnités hors brut (non soumises)</td>
              </tr>
            )}
            {lignesHorsBrut.map((l, i) => (
              <tr key={`hb${i}`}>
                <td className={cellule}>{l.libelle}</td><td className={cellule} /><td className={cellule} />
                <td className={`${cellule} text-right`}>{l.gain ? nombre(l.gain) : ''}</td><td className={cellule} /><td className={cellule} />
              </tr>
            ))}
          </tbody>
        </table>

        <section className={`mt-3 grid ${horsBrut > 0 ? 'grid-cols-5' : 'grid-cols-4'} gap-2 text-center`}>
          <Total t="Salaire brut" v={b.brut} />
          <Total t="Total retenues" v={b.brut + horsBrut - b.net_a_payer} />
          {horsBrut > 0 && <Total t="Indemnités hors brut" v={horsBrut} />}
          <Total t="Charges patronales" v={b.cout_employeur - b.brut - horsBrut} />
          <div className="rounded bg-marque-700 p-2 text-white"><p className="text-[10px] uppercase">Net à payer</p><p className="text-base font-bold">{nombre(b.net_a_payer)} FCFA</p></div>
        </section>
        <p className="mt-2 text-[11px]">Mode de paiement : {libMode[emp.mode_paiement ?? ''] ?? '—'} · Brut imposable : {nombre(b.brut_imposable)} · Coût total employeur : {nombre(b.cout_employeur)} FCFA</p>

        <footer className="mt-10 grid grid-cols-2 gap-8 text-[11px]">
          <div className="border-t border-slate-400 pt-1">Signature de l'employeur</div>
          <div className="border-t border-slate-400 pt-1">Signature du salarié</div>
        </footer>
        <p className="mt-6 text-center text-[10px] text-slate-400">Pour vous aider à faire valoir vos droits, conservez ce bulletin sans limitation de durée. — Édité avec SenPaie</p>
      </article>
    </div>
  );
}

const Total = ({ t, v }: { t: string; v: number }) => (
  <div className="rounded border border-slate-300 p-2"><p className="text-[10px] uppercase text-slate-500">{t}</p><p className="text-sm font-bold">{nombre(v)}</p></div>
);
