import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useEntreprise } from '../context/EntrepriseProvider';
import { dateFr, joursRestants } from '../lib/format';

const liens = [
  { vers: '/', libelle: 'Tableau de bord', icone: '📊' },
  { vers: '/employes', libelle: 'Employés', icone: '👥' },
  { vers: '/paie', libelle: 'Paie & bulletins', icone: '🧾' },
  { vers: '/declarations', libelle: 'Déclarations', icone: '🏛️' },
  { vers: '/brs', libelle: 'Prestataires (BRS)', icone: '🤝' },
  { vers: '/baremes', libelle: 'Barèmes & simulateur', icone: '📚' },
  { vers: '/parametres', libelle: 'Paramètres', icone: '⚙️' },
  { vers: '/abonnement', libelle: 'Abonnement', icone: '🔑' },
];

function useEnLigne() {
  const [enLigne, set] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => set(true), off = () => set(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return enLigne;
}

export function Layout() {
  const { user, estAdmin, deconnexion } = useAuth();
  const { entreprises, courante, choisir, abonnementActif, finAcces } = useEntreprise();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const enLigne = useEnLigne();
  const jours = finAcces ? joursRestants(finAcces) : 0;

  return (
    <div className="min-h-screen md:flex">
      <aside className={`no-print fixed inset-y-0 left-0 z-30 w-64 transform bg-marque-900 text-white transition md:static md:translate-x-0 ${menuOuvert ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-3">
          <div className="relative h-40 overflow-hidden rounded-xl bg-white">
            <img src="/LOGO%20SENPAIE.jpg" alt="SenPaie — La paie sénégalaise" style={{ width: 470 }}
              className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2" />
          </div>
        </div>
        {entreprises.length > 1 && (
          <div className="px-4 pb-3">
            <select value={courante?.id} onChange={(e) => choisir(e.target.value)}
              className="w-full rounded-md bg-marque-700 px-2 py-1.5 text-sm text-white">
              {entreprises.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
        )}
        <nav className="space-y-1 px-3">
          {liens.map((l) => (
            <NavLink key={l.vers} to={l.vers} end={l.vers === '/'} onClick={() => setMenuOuvert(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-marque-700 font-semibold' : 'text-green-100 hover:bg-marque-700/60'}`}>
              <span aria-hidden>{l.icone}</span>{l.libelle}
            </NavLink>
          ))}
          {estAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-or text-marque-900 font-semibold' : 'text-amber-200 hover:bg-marque-700/60'}`}>
              <span aria-hidden>🛡️</span>Administration
            </NavLink>
          )}
        </nav>
        <div className="absolute bottom-0 w-full border-t border-marque-700 p-4 text-xs text-green-100">
          <div className="truncate">{user?.email}</div>
          <button onClick={deconnexion} className="mt-2 text-or hover:underline">Se déconnecter</button>
        </div>
      </aside>

      {menuOuvert && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setMenuOuvert(false)} />}

      <div className="flex-1">
        <header className="no-print flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
          <button onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu" className="text-2xl">☰</button>
          <span className="font-semibold">{courante?.nom}</span><span />
        </header>

        {!enLigne && (
          <div className="no-print bg-red-600 px-4 py-2 text-center text-sm text-white">
            Connexion Internet perdue. Vos modifications ne pourront pas être enregistrées tant que la connexion n'est pas rétablie.
          </div>
        )}
        {courante && !abonnementActif && (
          <div className="no-print bg-red-50 px-4 py-2 text-center text-sm text-red-800">
            Votre accès a expiré le {dateFr(finAcces)}. Consultation seule. <Link to="/abonnement" className="font-semibold underline">Activer une licence</Link>
          </div>
        )}
        {courante && abonnementActif && jours <= 7 && (
          <div className="no-print bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
            {courante.plan === 'essai' ? 'Essai gratuit' : 'Abonnement'} : il reste {jours} jour{jours > 1 ? 's' : ''}. <Link to="/abonnement" className="font-semibold underline">Renouveler</Link>
          </div>
        )}

        <main className="mx-auto max-w-7xl p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
