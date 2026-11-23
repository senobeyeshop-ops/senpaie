import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { messageErreur } from '../lib/erreurs';
import { useRequete, verifier } from '../lib/useRequete';
import { dateFr, estAVie, finAccesLibelle } from '../lib/format';
import { telecharger } from '../lib/telecharger';
import { Badge, Bouton, Carte, Champ, Chargement, Entete, EtatErreur, Liste, Tableau } from '../components/ui';
import { PLANS } from './Abonnement';

interface Client { id: string; nom: string; ninea: string | null; plan: string; essai_fin: string; abonnement_fin: string | null; nb_employes: number; nb_bulletins: number; proprietaire_email: string | null; created_at: string }

export default function Admin() {
  const clients = useRequete(async () => verifier(await supabase.rpc('admin_clients')) as Client[], []);
  const stock = useRequete(async () => verifier(await supabase.from('licences').select('plan, statut, duree_jours')) as { plan: string; statut: string; duree_jours: number }[], []);
  const [g, setG] = useState({ nombre: '10', plan: 'pro', duree: '365', lot: '' });
  const [envoi, setEnvoi] = useState(false);
  const auj = new Date().toISOString().slice(0, 10);

  async function generer() {
    const plan = PLANS.find((p) => p.code === g.plan)!;
    setEnvoi(true);
    const { data, error } = await supabase.rpc('generer_licences', { p_nombre: Number(g.nombre), p_plan: g.plan, p_duree_jours: Number(g.duree), p_max_employes: plan.employes, p_lot: g.lot || null });
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    const cles = data as string[];
    telecharger(`cles-senpaie-${g.plan}-${g.duree === '0' ? 'a-vie' : g.duree + 'j'}-${Date.now()}.txt`, cles.join('\n'), 'text/plain');
    toast.success(`${cles.length} clés générées et téléchargées (à importer dans le stock Chariow)`);
    stock.recharger();
  }

  if (clients.chargement) return <Chargement />;
  if (clients.erreur) return <EtatErreur message={clients.erreur} reessayer={clients.recharger} />;
  const liste = clients.data ?? [];
  const actifs = liste.filter((c) => (c.abonnement_fin ?? c.essai_fin) >= auj || c.essai_fin >= auj);
  const payants = liste.filter((c) => c.abonnement_fin && c.abonnement_fin >= auj);

  return (
    <>
      <Entete titre="Administration SenPaie" sousTitre="Vue plateforme : clients, abonnements et licences" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[['Entreprises', liste.length], ['Accès actifs', actifs.length], ['Clients payants', payants.length], ['Licences à vie', liste.filter((c) => estAVie(c.abonnement_fin)).length], ['Clés disponibles', (stock.data ?? []).filter((l) => l.statut === 'disponible').length]].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">{k}</p><p className="text-2xl font-bold">{v}</p></div>
        ))}
      </div>

      <Carte titre="Générer un lot de clés de licence" className="mb-6">
        <div className="grid gap-3 md:grid-cols-5 md:items-end">
          <Champ label="Nombre" type="number" min={1} max={500} value={g.nombre} onChange={(e) => setG({ ...g, nombre: e.target.value })} />
          <Liste label="Formule" value={g.plan} onChange={(e) => setG({ ...g, plan: e.target.value })}>{PLANS.map((p) => <option key={p.code} value={p.code}>{p.nom} ({p.employes} empl.)</option>)}</Liste>
          <Liste label="Durée" value={g.duree} onChange={(e) => setG({ ...g, duree: e.target.value })}><option value="31">1 mois</option><option value="92">3 mois</option><option value="365">1 an</option><option value="0">À vie</option></Liste>
          <Champ label="Nom du lot" value={g.lot} onChange={(e) => setG({ ...g, lot: e.target.value })} />
          <Bouton onClick={generer} chargement={envoi}>Générer</Bouton>
        </div>
      </Carte>

      <Tableau entetes={['Entreprise', 'Propriétaire', 'Formule', 'Fin d\'accès', 'Employés', 'Bulletins', 'Inscrit le']}>
        {liste.map((c) => {
          const fin = [c.essai_fin, c.abonnement_fin].filter(Boolean).sort().reverse()[0]!;
          return (
            <tr key={c.id}>
              <td className="px-4 py-2 font-medium">{c.nom}<div className="text-xs text-slate-400">{c.ninea}</div></td>
              <td className="px-4 py-2">{c.proprietaire_email}</td>
              <td className="px-4 py-2"><Badge couleur={c.plan === 'essai' ? 'orange' : 'vert'}>{c.plan}</Badge> {estAVie(fin) && <Badge couleur="bleu">à vie</Badge>}</td>
              <td className="px-4 py-2">{finAccesLibelle(fin)} {fin < auj && <Badge couleur="rouge">Expiré</Badge>}</td>
              <td className="px-4 py-2">{c.nb_employes}</td><td className="px-4 py-2">{c.nb_bulletins}</td><td className="px-4 py-2">{dateFr(c.created_at.slice(0, 10))}</td>
            </tr>
          );
        })}
      </Tableau>
    </>
  );
}
