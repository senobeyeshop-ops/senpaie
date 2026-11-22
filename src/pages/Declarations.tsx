import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { messageErreur } from '../lib/erreurs';
import { useRequete, verifier } from '../lib/useRequete';
import { bulletinsDePeriodes, debutDeMois, finDeMois, type BulletinRow, type Periode } from '../lib/donnees';
import { dateFr, fcfa, MOIS, nombre } from '../lib/format';
import { dateLimite, moisDuTrimestre, preparerBRS, preparerCSS, preparerIPRES, preparerVRS, versCSV, type BulletinDecl } from '../declarations/calculs';
import { telecharger } from '../lib/telecharger';
import { Badge, Bouton, Carte, Chargement, Entete, EtatErreur, EtatVide, Liste, Tableau } from '../components/ui';

type TypeDecl = 'VRS' | 'BRS' | 'IPRES' | 'CSS';
const INFO: Record<TypeDecl, { titre: string; organisme: string; description: string }> = {
  VRS: { titre: 'VRS — Retenues sur salaires', organisme: 'DGID (eTax)', description: 'IR et TRIMF retenus aux salariés + CFCE (3 % employeur).' },
  BRS: { titre: 'BRS — Retenues à la source sur tiers', organisme: 'DGID (eTax)', description: 'Retenues opérées sur les paiements aux prestataires (honoraires, prestations, loyers…).' },
  IPRES: { titre: 'Déclaration IPRES', organisme: 'IPRES', description: 'Retraite : régime général (14 %) et régime complémentaire cadres (6 %).' },
  CSS: { titre: 'Déclaration CSS', organisme: 'Caisse de Sécurité Sociale', description: 'Prestations familiales (7 %) et accidents du travail.' },
};

interface Resultat { type: TypeDecl; annee: number; mois: number | null; trimestre: number | null; libelle: string; limite: string; donnees: { montant_total: number; lignes: Record<string, unknown>[] } & Record<string, unknown> }

export default function Declarations() {
  const { courante, peutEcrire } = useEntreprise();
  const now = new Date();
  const [type, setType] = useState<TypeDecl>('VRS');
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() || 12);
  const [trimestre, setTrimestre] = useState(Math.max(1, Math.ceil(now.getMonth() / 3)));
  const [res, setRes] = useState<Resultat | null>(null);
  const [prep, setPrep] = useState(false);
  const trimestriel = (type === 'IPRES' || type === 'CSS') && courante!.periodicite_sociale === 'trimestrielle';

  const historique = useRequete(async () =>
    verifier(await supabase.from('declarations').select('*').eq('entreprise_id', courante!.id)
      .order('annee', { ascending: false }).order('created_at', { ascending: false }).limit(50)) as
      { id: string; type: TypeDecl; annee: number; mois: number | null; trimestre: number | null; montant_total: number; statut: string; date_limite: string | null; reference_paiement: string | null }[],
  [courante!.id]);

  async function preparer() {
    setPrep(true); setRes(null);
    try {
      const listeMois = trimestriel ? moisDuTrimestre(trimestre) : [mois];
      const moisFin = listeMois[listeMois.length - 1];
      const libelle = trimestriel ? `T${trimestre} ${annee}` : `${MOIS[mois - 1]} ${annee}`;
      let donnees: Resultat['donnees'];

      if (type === 'BRS') {
        const rows = verifier(await supabase.from('paiements_tiers').select('*, prestataires(nom, ninea)')
          .eq('entreprise_id', courante!.id).gte('date_paiement', debutDeMois(annee, mois)).lte('date_paiement', finDeMois(annee, mois)).order('date_paiement')) as
          ({ date_paiement: string; nature: string; reference: string | null; montant_brut: number; taux_retenue: number; montant_retenue: number; prestataires: { nom: string; ninea: string | null } })[];
        donnees = preparerBRS(rows.map((r) => ({ prestataire: r.prestataires?.nom ?? '', ninea: r.prestataires?.ninea ?? null, date_paiement: r.date_paiement, nature: r.nature, reference: r.reference, montant_brut: Number(r.montant_brut), taux_retenue: Number(r.taux_retenue), montant_retenue: Number(r.montant_retenue) }))) as unknown as Resultat['donnees'];
      } else {
        const periodes = verifier(await supabase.from('periodes_paie').select('*').eq('entreprise_id', courante!.id).eq('annee', annee).in('mois', listeMois)) as Periode[];
        if (periodes.length === 0) throw new Error(`Aucune paie calculée pour ${libelle}. Calculez d'abord les bulletins.`);
        const bulletins = await bulletinsDePeriodes(courante!.id, periodes.map((p) => p.id));
        if (bulletins.length === 0) throw new Error(`Aucun bulletin pour ${libelle}. Calculez d'abord les bulletins.`);
        const decl = agreger(bulletins);
        donnees = (type === 'VRS' ? preparerVRS(decl) : type === 'IPRES' ? preparerIPRES(decl) : preparerCSS(decl)) as unknown as Resultat['donnees'];
      }
      setRes({ type, annee, mois: trimestriel ? null : mois, trimestre: trimestriel ? trimestre : null, libelle, limite: dateLimite(annee, moisFin), donnees });
    } catch (e) { toast.error(messageErreur(e)); }
    finally { setPrep(false); }
  }

  async function enregistrer() {
    if (!res) return;
    const ligne = { entreprise_id: courante!.id, type: res.type, annee: res.annee, mois: res.mois, trimestre: res.trimestre, montant_total: res.donnees.montant_total, detail: res.donnees, date_limite: res.limite };
    // Mise à jour si une déclaration existe déjà pour cette période
    const exist = historique.data?.find((d) => d.type === res.type && d.annee === res.annee && d.mois === res.mois && d.trimestre === res.trimestre);
    const { error } = exist
      ? await supabase.from('declarations').update(ligne).eq('id', exist.id)
      : await supabase.from('declarations').insert(ligne);
    if (error) { toast.error(messageErreur(error)); return; }
    toast.success('Déclaration enregistrée'); historique.recharger();
  }

  async function marquer(id: string, statut: 'deposee' | 'payee') {
    const reference = statut === 'payee' ? prompt('Référence du paiement (quittance eTax, reçu IPRES/CSS) :') ?? null : null;
    const { error } = await supabase.from('declarations').update({ statut, date_depot: new Date().toISOString().slice(0, 10), ...(reference ? { reference_paiement: reference } : {}) }).eq('id', id);
    if (error) toast.error(messageErreur(error)); else historique.recharger();
  }

  return (
    <>
      <Entete titre="Déclarations" sousTitre="Préparez vos déclarations fiscales (VRS, BRS) et sociales (IPRES, CSS) à partir de vos bulletins" />
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        {(Object.keys(INFO) as TypeDecl[]).map((t) => (
          <button key={t} onClick={() => { setType(t); setRes(null); }}
            className={`rounded-xl border p-4 text-left transition ${type === t ? 'border-marque-700 bg-marque-50 ring-2 ring-marque-600' : 'border-slate-200 bg-white hover:border-marque-600'}`}>
            <p className="font-semibold">{t}</p><p className="text-xs text-slate-500">{INFO[t].organisme}</p>
          </button>
        ))}
      </div>

      <Carte titre={INFO[type].titre}>
        <p className="mb-4 text-sm text-slate-600">{INFO[type].description}</p>
        <div className="flex flex-wrap items-end gap-3">
          {trimestriel
            ? <div className="w-40"><Liste label="Trimestre" value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))}>{[1, 2, 3, 4].map((t) => <option key={t} value={t}>T{t}</option>)}</Liste></div>
            : <div className="w-44"><Liste label="Mois" value={mois} onChange={(e) => setMois(Number(e.target.value))}>{MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Liste></div>}
          <div className="w-32"><Liste label="Année" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>{[0, 1, 2].map((d) => now.getFullYear() - d).map((a) => <option key={a}>{a}</option>)}</Liste></div>
          <Bouton onClick={preparer} chargement={prep}>Préparer la déclaration</Bouton>
        </div>
      </Carte>

      {res && <Apercu res={res} peutEcrire={peutEcrire} enregistrer={enregistrer} />}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Historique</h2>
      {historique.chargement ? <Chargement /> : historique.erreur ? <EtatErreur message={historique.erreur} reessayer={historique.recharger} /> :
        (historique.data ?? []).length === 0 ? <EtatVide icone="🏛️" titre="Aucune déclaration enregistrée" texte="Préparez une déclaration ci-dessus puis cliquez sur « Enregistrer » pour en garder la trace et suivre son dépôt." /> : (
          <Tableau entetes={['Type', 'Période', 'Montant', 'Échéance', 'Statut', '']}>
            {historique.data!.map((d) => {
              const enRetard = d.statut === 'brouillon' && d.date_limite && d.date_limite < new Date().toISOString().slice(0, 10);
              return (
                <tr key={d.id}>
                  <td className="px-4 py-2 font-semibold">{d.type}</td>
                  <td className="px-4 py-2">{d.trimestre ? `T${d.trimestre} ${d.annee}` : `${MOIS[(d.mois ?? 1) - 1]} ${d.annee}`}</td>
                  <td className="px-4 py-2">{fcfa(d.montant_total)}</td>
                  <td className="px-4 py-2">{dateFr(d.date_limite)} {enRetard && <Badge couleur="rouge">En retard</Badge>}</td>
                  <td className="px-4 py-2">{d.statut === 'payee' ? <Badge couleur="vert">Payée</Badge> : d.statut === 'deposee' ? <Badge couleur="bleu">Déposée</Badge> : <Badge couleur="orange">À déposer</Badge>}</td>
                  <td className="space-x-3 px-4 py-2 text-right">
                    {peutEcrire && d.statut === 'brouillon' && <button className="text-marque-700 hover:underline" onClick={() => marquer(d.id, 'deposee')}>Marquer déposée</button>}
                    {peutEcrire && d.statut !== 'payee' && <button className="text-marque-700 hover:underline" onClick={() => marquer(d.id, 'payee')}>Marquer payée</button>}
                  </td>
                </tr>
              );
            })}
          </Tableau>
        )}
    </>
  );
}

function Apercu({ res, peutEcrire, enregistrer }: { res: Resultat; peutEcrire: boolean; enregistrer: () => void }) {
  const { courante } = useEntreprise();
  const d = res.donnees as Record<string, number> & { lignes: Record<string, unknown>[] };
  const resume: [string, number][] =
    res.type === 'VRS' ? [['Effectif', d.effectif], ['IR retenu', d.total_ir], ['TRIMF', d.total_trimf], ['CFCE (3 %)', d.total_cfce]] :
    res.type === 'BRS' ? [['Paiements', d.nombre_paiements], ['Total brut payé', d.total_brut]] :
    res.type === 'IPRES' ? [['Effectif', d.effectif], ['Dont cadres', d.effectif_cadres], ['Régime général', d.total_rg], ['Régime cadres', d.total_rcc]] :
    [['Effectif', d.effectif], ['Prestations familiales', d.total_pf], ['Accidents du travail', d.total_at]];

  const fichier = `${res.type}-${res.libelle.replace(/\s/g, '-')}.csv`;
  return (
    <Carte className="mt-6" titre={`${res.type} — ${res.libelle}`} actions={
      <div className="no-print flex flex-wrap gap-2">
        <Bouton variante="secondaire" onClick={() => telecharger(fichier, versCSV(d.lignes))} disabled={d.lignes.length === 0}>Exporter (Excel)</Bouton>
        <Bouton variante="secondaire" onClick={() => window.print()}>Imprimer</Bouton>
        {peutEcrire && <Bouton onClick={enregistrer}>Enregistrer</Bouton>}
      </div>}>
      <p className="mb-4 text-sm text-slate-600">{courante!.nom} · NINEA {courante!.ninea ?? '—'} · Date limite de dépôt et paiement : <b>{dateFr(res.limite)}</b></p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {resume.map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{k}</p><p className="font-semibold">{k.startsWith('Effectif') || k.startsWith('Dont') || k === 'Paiements' ? v : fcfa(v)}</p></div>)}
        <div className="rounded-lg bg-marque-700 p-3 text-white"><p className="text-xs">Montant à payer</p><p className="text-lg font-bold">{fcfa(d.montant_total)}</p></div>
      </div>
      {d.lignes.length === 0 ? (
        <EtatVide icone="🤝" titre="Rien à déclarer sur la période" texte={res.type === 'BRS' ? 'Aucun paiement à un prestataire saisi ce mois-ci. Si c\'est le cas, faites une déclaration « néant » sur eTax.' : 'Aucune donnée.'} action={res.type === 'BRS' ? { libelle: 'Saisir un paiement', vers: '/brs' } : undefined} />
      ) : (
        <Tableau entetes={Object.keys(d.lignes[0])}>
          {d.lignes.map((l, i) => <tr key={i}>{Object.values(l).map((v, j) => <td key={j} className="whitespace-nowrap px-4 py-2">{typeof v === 'number' ? nombre(v) : typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v ?? '')}</td>)}</tr>)}
        </Tableau>
      )}
      <p className="mt-4 text-xs text-slate-500">Ce document est une aide à la préparation. Reportez les montants sur la plateforme officielle (eTax DGID, portail IPRES/CSS) et conservez la quittance.</p>
    </Carte>
  );
}

/** Regroupe les bulletins (plusieurs mois possibles) par employé. */
function agreger(bulletins: BulletinRow[]): BulletinDecl[] {
  const map = new Map<string, BulletinDecl>();
  for (const b of bulletins) {
    const e = b.detail.employe ?? {};
    const cur = map.get(b.employe_id) ?? {
      employe_id: b.employe_id, matricule: e.matricule ?? '', nom_complet: `${e.prenom ?? ''} ${e.nom ?? ''}`.trim(),
      numero_ipres: e.numero_ipres ?? null, numero_css: e.numero_css ?? null, est_cadre: !!e.est_cadre,
      brut: 0, brut_cotisable: 0, brut_imposable: 0, ipres_rg_sal: 0, ipres_rg_pat: 0, ipres_rcc_sal: 0, ipres_rcc_pat: 0,
      css_pf: 0, css_at: 0, ir: 0, trimf: 0, cfce: 0, base_ipres_rg: 0, base_ipres_rcc: 0, base_css: 0,
    };
    const n = (v: unknown) => Number(v) || 0;
    cur.brut += n(b.brut); cur.brut_cotisable += n(b.brut_cotisable); cur.brut_imposable += n(b.brut_imposable);
    cur.ipres_rg_sal += n(b.ipres_rg_sal); cur.ipres_rg_pat += n(b.ipres_rg_pat);
    cur.ipres_rcc_sal += n(b.ipres_rcc_sal); cur.ipres_rcc_pat += n(b.ipres_rcc_pat);
    cur.css_pf += n(b.css_pf); cur.css_at += n(b.css_at); cur.ir += n(b.ir); cur.trimf += n(b.trimf); cur.cfce += n(b.cfce);
    cur.base_ipres_rg += n(b.detail.bases?.ipres_rg); cur.base_ipres_rcc += n(b.detail.bases?.ipres_rcc); cur.base_css += n(b.detail.bases?.css);
    map.set(b.employe_id, cur);
  }
  return [...map.values()];
}
