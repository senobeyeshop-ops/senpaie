import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { useRequete, verifier } from '../lib/useRequete';
import { fcfa } from '../lib/format';
import { Badge, Chargement, Entete, EtatErreur, EtatVide, Tableau } from '../components/ui';
import type { Employe } from '../paie/types';

export default function Employes() {
  const { courante, peutEcrire } = useEntreprise();
  const nav = useNavigate();
  const [recherche, setRecherche] = useState('');
  const [voirInactifs, setVoirInactifs] = useState(false);
  const { data, chargement, erreur, recharger } = useRequete(
    async () => verifier(await supabase.from('employes').select('*').eq('entreprise_id', courante!.id).order('nom')) as Employe[],
    [courante!.id]);

  const filtres = useMemo(() => (data ?? []).filter((e) =>
    (voirInactifs || e.actif) &&
    `${e.matricule} ${e.prenom} ${e.nom} ${e.poste ?? ''}`.toLowerCase().includes(recherche.toLowerCase())), [data, recherche, voirInactifs]);

  const bouton = peutEcrire && <Link to="/employes/nouveau" className="rounded-lg bg-marque-700 px-4 py-2 text-sm font-medium text-white hover:bg-marque-900">+ Nouvel employé</Link>;

  if (chargement) return <Chargement />;
  if (erreur) return <EtatErreur message={erreur} reessayer={recharger} />;

  return (
    <>
      <Entete titre="Employés" sousTitre={`${(data ?? []).filter((e) => e.actif).length} actif(s) sur ${courante!.max_employes} autorisés`} actions={bouton} />
      {(data ?? []).length === 0 ? (
        <EtatVide icone="👥" titre="Aucun employé" texte="Ajoutez vos salariés pour pouvoir éditer leurs bulletins de paie." action={peutEcrire ? { libelle: 'Ajouter un employé', vers: '/employes/nouveau' } : undefined} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <input placeholder="Rechercher (nom, matricule, poste)…" value={recherche} onChange={(e) => setRecherche(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={voirInactifs} onChange={(e) => setVoirInactifs(e.target.checked)} /> Afficher les sortis</label>
          </div>
          {filtres.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Aucun employé ne correspond à « {recherche} ».</p>
          ) : (
            <Tableau entetes={['Matricule', 'Nom', 'Poste', 'Statut', 'Salaire de base', '']}>
              {filtres.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/employes/${e.id}`)}>
                  <td className="px-4 py-3 font-mono text-xs">{e.matricule}</td>
                  <td className="px-4 py-3 font-medium">{e.prenom} {e.nom}</td>
                  <td className="px-4 py-3 text-slate-600">{e.poste ?? '—'}</td>
                  <td className="px-4 py-3">{e.actif ? <Badge couleur="vert">{e.est_cadre ? 'Cadre' : 'Non-cadre'}</Badge> : <Badge>Sorti</Badge>}</td>
                  <td className="px-4 py-3">{fcfa(e.salaire_base)}</td>
                  <td className="px-4 py-3 text-right text-marque-700">Modifier →</td>
                </tr>
              ))}
            </Tableau>
          )}
        </>
      )}
    </>
  );
}
