import { Component, type ReactNode } from 'react';

// Empêche l'écran blanc : toute erreur de rendu affiche un écran de repli.
export class ErrorBoundary extends Component<{ children: ReactNode }, { erreur: Error | null }> {
  state = { erreur: null as Error | null };
  static getDerivedStateFromError(erreur: Error) { return { erreur }; }
  componentDidCatch(erreur: Error) { console.error('[SenPaie] Erreur d\'affichage :', erreur); }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-4xl">⚠️</div>
          <h1 className="mt-3 text-lg font-semibold">Un problème d'affichage est survenu</h1>
          <p className="mt-2 text-sm text-slate-600">Vos données sont en sécurité. Rechargez la page ; si le problème persiste, contactez le support.</p>
          <button onClick={() => window.location.assign('/')} className="mt-5 rounded-lg bg-marque-700 px-4 py-2 text-sm font-medium text-white">Recharger l'application</button>
        </div>
      </div>
    );
  }
}
