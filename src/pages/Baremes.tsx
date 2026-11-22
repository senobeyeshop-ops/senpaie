import { useEffect, useMemo, useState } from 'react';
import { useEntreprise } from '../context/EntrepriseProvider';
import { useRequete } from '../lib/useRequete';
import { categoriesDe, listerConventions, parCollege } from '../lib/conventions';
import { chargerParametres } from '../lib/donnees';
import { calculerParts, retenuesFiscales } from '../paie/moteur';
import { PARAMETRES_DEFAUT } from '../paie/parametres';
import type { Employe, ParametresPaie } from '../paie/types';
import { fcfa, nombre } from '../lib/format';
import { versCSV } from '../declarations/calculs';
import { telecharger } from '../lib/telecharger';
import { Badge, Bouton, Carte, Champ, Chargement, Entete, EtatErreur, Liste, Tableau } from '../components/ui';

export default function Baremes() {
  const [onglet, setOnglet] = useState<'simulateur' | 'conventions' | 'bareme'>('simulateur');
  const now = new Date();
  const [params, setParams] = useState<ParametresPaie>(PARAMETRES_DEFAUT);
  useEffect(() => { chargerParametres(now.getFullYear(), now.getMonth() + 1).then(setParams).catch(() => {}); }, []);

  return (
    <>
      <Entete titre="Barèmes & simulateur" sousTitre="Salaires catégoriels des conventions collectives et barème mensuel des retenues (IR, TRIMF)" />
      <div className="mb-6 flex flex-wrap gap-2">
        {([['simulateur', 'Simulateur brut → IR, TRIMF, parts'], ['bareme', 'Barème mensuel DGID'], ['conventions', 'Conventions collectives']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${onglet === k ? 'bg-marque-700 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{l}</button>
        ))}
      </div>
      {onglet === 'simulateur' && <Simulateur params={params} />}
      {onglet === 'bareme' && <BaremeMensuel params={params} />}
      {onglet === 'conventions' && <Conventions />}
    </>
  );
}

const PARTS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function Simulateur({ params }: { params: ParametresPaie }) {
  const [brut, setBrut] = useState('250000');
  const [situation, setSituation] = useState<Employe['situation_familiale']>('marie');
  const [enfants, setEnfants] = useState('2');
  const [partsTrimf, setPartsTrimf] = useState('1');
  const b = Math.max(0, Math.round(Number(brut) || 0));
  const parts = calculerParts({ situation_familiale: situation, nombre_enfants: Number(enfants) || 0, nb_parts_override: null });
  const r = retenuesFiscales(b, parts, Math.max(1, Number(partsTrimf) || 1), params);
  const abattement = Math.min(b * params.ir.abattement_taux, params.ir.abattement_plafond_mensuel ?? Infinity);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Carte titre="Saisie">
        <div className="space-y-4">
          <Champ label="Salaire brut imposable mensuel (FCFA)" type="number" min={0} value={brut} onChange={(e) => setBrut(e.target.value)} aide="Brut soumis à l'impôt (hors indemnités exonérées)" />
          <Liste label="Situation de famille" value={situation} onChange={(e) => setSituation(e.target.value as Employe['situation_familiale'])}>
            <option value="celibataire">Célibataire</option><option value="marie">Marié(e)</option><option value="divorce">Divorcé(e)</option><option value="veuf">Veuf / veuve</option>
          </Liste>
          <Champ label="Enfants à charge" type="number" min={0} value={enfants} onChange={(e) => setEnfants(e.target.value)} />
          <Champ label="Personnes pour la TRIMF" type="number" min={1} value={partsTrimf} onChange={(e) => setPartsTrimf(e.target.value)} aide="Le barème indique la TRIMF « par personne »" />
        </div>
      </Carte>
      <Carte titre="Résultat mensuel" className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <Bloc t="Nombre de parts" v={String(parts).replace('.', ',')} />
          <Bloc t="IR retenu" v={fcfa(r.ir)} fort />
          <Bloc t="TRIMF" v={fcfa(r.trimf)} fort />
        </div>
        <table className="mt-5 w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <Ligne l="Salaire brut imposable" v={fcfa(b)} />
            <Ligne l={`Abattement 30 % (plafonné à ${nombre(params.ir.abattement_plafond_mensuel ?? 75000)})`} v={`− ${fcfa(abattement)}`} />
            <Ligne l="Revenu net imposable (arrondi au millier inférieur) × 12" v={fcfa(r.netImposableAnnuel)} />
            <Ligne l="IR annuel selon le barème progressif" v={fcfa(r.irBrutAnnuel)} />
            <Ligne l={`Réduction pour charges de famille (${String(parts).replace('.', ',')} parts)`} v={`− ${fcfa(r.reduction)}`} />
            <Ligne l="IR mensuel = (IR annuel − réduction) ÷ 12" v={fcfa(r.ir)} fort />
            <Ligne l="TRIMF mensuelle = tarif annuel de la tranche ÷ 12" v={fcfa(r.trimf)} fort />
            <Ligne l="Total des retenues fiscales du salarié" v={fcfa(r.ir + r.trimf)} />
          </tbody>
        </table>
        <p className="mt-4 text-xs text-slate-500">Parts : règle de l'annexe 1 du Guide fiscal des PME (marié = 1,5 ; + 0,5 par enfant à charge ; 5 parts maximum). La méthode de calcul de l'IR reproduit le barème mensuel des retenues à la source de la DGID.</p>
      </Carte>
      <Carte titre="IR pour ce salaire selon le nombre de parts" className="lg:col-span-3">
        <Tableau entetes={PARTS.map((x) => `${String(x).replace('.', ',')} part${x > 1 ? 's' : ''}`)}>
          <tr>{PARTS.map((x) => <td key={x} className={`px-4 py-2 ${x === parts ? 'bg-marque-50 font-bold text-marque-900' : ''}`}>{nombre(retenuesFiscales(b, x, 1, params).ir)}</td>)}</tr>
        </Tableau>
      </Carte>
    </div>
  );
}

function BaremeMensuel({ params }: { params: ParametresPaie }) {
  const [de, setDe] = useState('50000');
  const [a, setA] = useState('300000');
  const [pas, setPas] = useState('1000');
  const lignes = useMemo(() => {
    const d = Math.max(0, Number(de) || 0), f = Math.max(d, Number(a) || 0), s = Math.max(500, Number(pas) || 1000);
    const out: Record<string, number>[] = [];
    for (let b = d; b <= f && out.length < 2000; b += s) {
      const row: Record<string, number> = { brut: b, trimf: retenuesFiscales(b, 1, 1, params).trimf };
      PARTS.forEach((x) => { row[`ir_${String(x).replace('.', '_')}p`] = retenuesFiscales(b, x, 1, params).ir; });
      out.push(row);
    }
    return out;
  }, [de, a, pas, params]);

  return (
    <Carte titre="Barème mensuel des retenues à la source sur salaires" actions={<Bouton variante="secondaire" onClick={() => telecharger('bareme-mensuel-retenues.csv', versCSV(lignes))}>Exporter (Excel)</Bouton>}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-40"><Champ label="Brut de" type="number" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="w-40"><Champ label="à" type="number" value={a} onChange={(e) => setA(e.target.value)} /></div>
        <div className="w-32"><Liste label="Pas" value={pas} onChange={(e) => setPas(e.target.value)}>{['1000', '5000', '10000', '50000'].map((x) => <option key={x} value={x}>{nombre(Number(x))}</option>)}</Liste></div>
        <span className="text-xs text-slate-500">{lignes.length} lignes{lignes.length >= 2000 ? ' (limité à 2 000)' : ''}</span>
      </div>
      <Tableau entetes={['Revenu brut', 'TRIMF / pers.', ...PARTS.map((x) => `${String(x).replace('.', ',')} p.`)]}>
        {lignes.slice(0, 500).map((r) => (
          <tr key={r.brut}>{Object.values(r).map((v, i) => <td key={i} className={`whitespace-nowrap px-3 py-1.5 text-right ${i === 0 ? 'font-semibold' : ''}`}>{nombre(v)}</td>)}</tr>
        ))}
      </Tableau>
      {lignes.length > 500 && <p className="mt-2 text-xs text-slate-500">Affichage limité à 500 lignes : utilisez l'export pour la totalité.</p>}
    </Carte>
  );
}

function Conventions() {
  const { data: convs, chargement, erreur, recharger } = useRequete(listerConventions, []);
  const { courante } = useEntreprise();
  const [conv, setConv] = useState<string>('');
  const [recherche, setRecherche] = useState('');
  useEffect(() => {
    if (!conv && convs?.length) setConv((courante as { convention_id?: string } | null)?.convention_id ?? convs[0].id);
  }, [convs]);
  const cats = useRequete(async () => (conv ? categoriesDe(conv) : []), [conv]);
  const groupes = useMemo(() => parCollege((cats.data ?? []).filter((c) => `${c.college} ${c.categorie}`.toLowerCase().includes(recherche.toLowerCase()))), [cats.data, recherche]);

  if (chargement) return <Chargement />;
  if (erreur) return <EtatErreur message={erreur} reessayer={recharger} />;
  const nomConv = convs?.find((c) => c.id === conv)?.nom ?? '';

  return (
    <Carte titre="Salaires catégoriels minimums (base 173,33 h) — en vigueur depuis le 1er janvier 2020"
      actions={<Bouton variante="secondaire" disabled={!cats.data?.length} onClick={() => telecharger(`salaires-categoriels-${nomConv}.csv`, versCSV((cats.data ?? []).map((c) => ({ convention: nomConv, college: c.college, categorie: c.categorie, salaire_mensuel: c.salaire_mensuel, taux_horaire: c.taux_horaire ?? '', taux_journalier: c.taux_journalier ?? '' }))))}>Exporter (Excel)</Bouton>}>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Liste label="Convention collective" value={conv} onChange={(e) => setConv(e.target.value)}>{convs?.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Liste>
        <Champ label="Rechercher une catégorie" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. 5ème, M2, P1A…" />
      </div>
      {cats.chargement ? <Chargement /> : groupes.map(([college, liste]) => (
        <div key={college} className="mb-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{college}</h3>
          <Tableau entetes={['Catégorie', 'Salaire mensuel minimum', 'Taux horaire', 'Taux journalier', '']}>
            {liste.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-medium">{c.categorie}</td>
                <td className="px-4 py-2">{fcfa(c.salaire_mensuel)}{c.unite !== 'mensuel' && <span className="ml-1 text-xs text-slate-400">({c.unite === 'horaire' ? '× 173,33 h' : '× 26 jours'})</span>}</td>
                <td className="px-4 py-2">{c.taux_horaire ? `${Number(c.taux_horaire).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} F/h` : '—'}</td>
                <td className="px-4 py-2">{c.taux_journalier ? `${Number(c.taux_journalier).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} F/j` : '—'}</td>
                <td className="px-4 py-2">{c.corrige && <Badge couleur="bleu">corrigé</Badge>}</td>
              </tr>
            ))}
          </Tableau>
        </div>
      ))}
      <p className="text-xs text-slate-500">Source : Ministère du Travail — barèmes des salaires catégoriels du secteur privé applicables au 1er janvier 2020 (Commission mixte paritaire). Vérifiez les revalorisations intervenues depuis dans votre branche.</p>
    </Carte>
  );
}

const Bloc = ({ t, v, fort }: { t: string; v: string; fort?: boolean }) => (
  <div className={`rounded-lg p-4 ${fort ? 'bg-marque-700 text-white' : 'bg-slate-50'}`}><p className={`text-xs ${fort ? 'text-green-100' : 'text-slate-500'}`}>{t}</p><p className="mt-1 text-xl font-bold">{v}</p></div>
);
const Ligne = ({ l, v, fort }: { l: string; v: string; fort?: boolean }) => (
  <tr><td className="py-2 text-slate-600">{l}</td><td className={`py-2 text-right ${fort ? 'font-bold text-marque-900' : ''}`}>{v}</td></tr>
);
