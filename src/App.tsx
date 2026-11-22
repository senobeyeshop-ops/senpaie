import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { EntrepriseProvider, useEntreprise } from './context/EntrepriseProvider';
import { Layout } from './components/Layout';
import { Chargement, EtatErreur } from './components/ui';
import { configManquante } from './lib/supabase';
import Connexion from './pages/Connexion';
import Inscription from './pages/Inscription';
import MotDePasseOublie from './pages/MotDePasseOublie';
import NouveauMotDePasse from './pages/NouveauMotDePasse';
import NotFound from './pages/NotFound';

// Chargement différé des pages lourdes (bundle initial plus léger)
const TableauDeBord = lazy(() => import('./pages/TableauDeBord'));
const Employes = lazy(() => import('./pages/Employes'));
const EmployeForm = lazy(() => import('./pages/EmployeForm'));
const Paie = lazy(() => import('./pages/Paie'));
const PeriodeDetail = lazy(() => import('./pages/PeriodeDetail'));
const Bulletin = lazy(() => import('./pages/Bulletin'));
const Declarations = lazy(() => import('./pages/Declarations'));
const Brs = lazy(() => import('./pages/Brs'));
const Parametres = lazy(() => import('./pages/Parametres'));
const Abonnement = lazy(() => import('./pages/Abonnement'));
const Admin = lazy(() => import('./pages/Admin'));
const Baremes = lazy(() => import('./pages/Baremes'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, pret } = useAuth();
  const loc = useLocation();
  if (!pret) return <Chargement />;
  if (!session) return <Navigate to="/connexion" replace state={{ depuis: loc.pathname }} />;
  return <>{children}</>;
}

function RequireEntreprise({ children }: { children: React.ReactNode }) {
  const { courante, chargement, erreur, recharger } = useEntreprise();
  if (chargement) return <Chargement />;
  if (erreur) return <div className="p-8"><EtatErreur message={erreur} reessayer={recharger} /></div>;
  if (!courante) return <Navigate to="/bienvenue" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { estAdmin } = useAuth();
  return estAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  if (configManquante) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border bg-white p-8">
          <h1 className="text-lg font-semibold">Configuration manquante</h1>
          <p className="mt-2 text-sm text-slate-600">Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> (fichier <code>.env.local</code> en local, ou variables d'environnement Netlify), puis relancez le build.</p>
        </div>
      </div>
    );
  }
  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
        <Route path="/nouveau-mot-de-passe" element={<NouveauMotDePasse />} />

        <Route path="/*" element={<RequireAuth><EntrepriseProvider><RoutesPrivees /></EntrepriseProvider></RequireAuth>} />
      </Routes>
    </Suspense>
  );
}

function RoutesPrivees() {
  return (
    <Routes>
      <Route path="/bienvenue" element={<Onboarding />} />
      <Route path="/paie/:periodeId/bulletin/:bulletinId" element={<RequireEntreprise><Bulletin /></RequireEntreprise>} />
      <Route element={<RequireEntreprise><Layout /></RequireEntreprise>}>
        <Route index element={<TableauDeBord />} />
        <Route path="employes" element={<Employes />} />
        <Route path="employes/nouveau" element={<EmployeForm />} />
        <Route path="employes/:id" element={<EmployeForm />} />
        <Route path="paie" element={<Paie />} />
        <Route path="paie/:periodeId" element={<PeriodeDetail />} />
        <Route path="declarations" element={<Declarations />} />
        <Route path="brs" element={<Brs />} />
        <Route path="parametres" element={<Parametres />} />
        <Route path="baremes" element={<Baremes />} />
        <Route path="abonnement" element={<Abonnement />} />
        <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
