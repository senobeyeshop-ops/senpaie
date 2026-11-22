import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { useRequete, verifier } from '../lib/useRequete';
import { fcfa, periodeLibelle } from '../lib/format';
import { Carte, Chargement, Entete, EtatErreur, EtatVide } from '../components/ui';
import { dateLimite } from '../declarations/calculs';

export default function TableauDeBord() {
  const { courante } = useEntreprise();
  const eid = courante!.id;
  const { data, chargement, erreur, recharger } = useRequete(async () => {
    const [nbEmp, periodes] = await Promise.all([
      supabase.from('employes').select('id', { count: 'exact', head: true }).eq('entreprise_id', eid).eq('actif', true),
      supabase.from('periodes_paie').select('*').eq('entreprise_id', eid).order('annee', { ascending: false }).order('mois', { ascending: false }).limit(1).then(verifier),
    ]);
    if (nbEmp.error) throw nbEmp.error;
    const derniere = (periodes as { id: string; annee: number; mois: number; statut: string }[])[0] ?? null;
    let totaux = null as null | Record<string, number>;
    if (derniere) {
      const b = verifier(await supabase.from('bulletins').select('brut,net_a_payer,cout_employeur,ir,trimf,cfce,ipres_rg_sal,ipres_rg_pat,ipres_rcc_sal,ipres_rcc_pat,css_pf,css_at').eq('periode_id', derniere.id)) as Record<string, number>[];
      totaux = b.reduce((acc, r) => { for (const k in r) acc[k] = (acc[k] ?? 0) + Number(r[k]); return acc; }, { n: b.length } as Record<string, number>);
    }
    return { nbEmployes: nbEmp.count ?? 0, derniere, totaux };
  }, [eid]);

  if (chargement) return <Chargement />;
  if (erreur || !data) return <EtatErreur message={erreur ?? 'Erreur'} reessayer={recharger} />;

  if (data.nbEmployes === 0) {
    return (
      <>
        <Entete titre={`Bonjour 👋`} sousTitre={courante!.nom} />
        <EtatVide icone="🚀" titre="Commençons par vos employés"
          texte="Ajoutez vos salariés (salaire de base, situation familiale, statut cadre). SenPaie calculera ensuite automatiquement les bulletins et toutes vos déclarations."
          action={{ libelle: 'Ajouter mon premier employé', vers: '/employes/nouveau' }} />
      </>
    );
  }

  const t = data.totaux;
  const d = data.derniere;
  return (
    <>
      <Entete titre="Tableau de bord" sousTitre={courante!.nom}
        actions={<Link to="/paie" className="rounded-lg bg-marque-700 px-4 py-2 text-sm font-medium text-white hover:bg-marque-900">Préparer la paie</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicateur titre="Employés actifs" valeur={String(data.nbEmployes)} sous={`Limite formule : ${courante!.max_employes}`} />
        <Indicateur titre="Masse salariale brute" valeur={t ? fcfa(t.brut) : '—'} sous={d ? periodeLibelle(d.annee, d.mois) : 'Aucune paie'} />
        <Indicateur titre="Net à payer" valeur={t ? fcfa(t.net_a_payer) : '—'} sous={t ? `${t.n} bulletin(s)` : ''} />
        <Indicateur titre="Coût employeur" valeur={t ? fcfa(t.cout_employeur) : '—'} sous="Brut + charges patronales" />
      </div>

      {d && t ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Carte titre="À reverser à la DGID (VRS)">
            <p className="text-2xl font-bold">{fcfa(t.ir + t.trimf + t.cfce)}</p>
            <p className="mt-1 text-sm text-slate-500">IR {fcfa(t.ir)} · TRIMF {fcfa(t.trimf)} · CFCE {fcfa(t.cfce)}</p>
            <p className="mt-2 text-xs text-amber-700">Échéance : {new Date(dateLimite(d.annee, d.mois)).toLocaleDateString('fr-FR')}</p>
          </Carte>
          <Carte titre="À verser à l'IPRES">
            <p className="text-2xl font-bold">{fcfa(t.ipres_rg_sal + t.ipres_rg_pat + t.ipres_rcc_sal + t.ipres_rcc_pat)}</p>
            <p className="mt-1 text-sm text-slate-500">Régime général + cadres (parts salariale et patronale)</p>
          </Carte>
          <Carte titre="À verser à la CSS">
            <p className="text-2xl font-bold">{fcfa(t.css_pf + t.css_at)}</p>
            <p className="mt-1 text-sm text-slate-500">Prestations familiales {fcfa(t.css_pf)} · AT {fcfa(t.css_at)}</p>
          </Carte>
        </div>
      ) : (
        <div className="mt-6">
          <EtatVide icone="🧾" titre="Aucune paie calculée pour l'instant" texte="Ouvrez votre premier mois de paie pour générer les bulletins." action={{ libelle: 'Ouvrir un mois de paie', vers: '/paie' }} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link className="text-marque-700 hover:underline" to="/declarations">→ Préparer les déclarations</Link>
        <Link className="text-marque-700 hover:underline" to="/brs">→ Saisir un paiement prestataire (BRS)</Link>
      </div>
    </>
  );
}

function Indicateur({ titre, valeur, sous }: { titre: string; valeur: string; sous?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{titre}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{valeur}</p>
      {sous && <p className="mt-1 text-xs text-slate-400">{sous}</p>}
    </div>
  );
}
