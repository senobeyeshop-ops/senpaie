import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

export function Bouton({ variante = 'primaire', chargement, children, className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primaire' | 'secondaire' | 'danger' | 'lien'; chargement?: boolean }) {
  const styles = {
    primaire: 'bg-marque-700 text-white hover:bg-marque-900',
    secondaire: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    lien: 'text-marque-700 hover:underline px-0',
  }[variante];
  return (
    <button {...props} disabled={props.disabled || chargement}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${styles} ${className}`}>
      {chargement && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Champ({ label, erreur, aide, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; erreur?: string; aide?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}{props.required && <span className="text-red-600"> *</span>}</span>
      <input {...props} className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-marque-600 ${erreur ? 'border-red-500' : 'border-slate-300'}`} />
      {aide && !erreur && <span className="mt-1 block text-xs text-slate-500">{aide}</span>}
      {erreur && <span className="mt-1 block text-xs text-red-600">{erreur}</span>}
    </label>
  );
}

export function Liste({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <select {...props} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-marque-600">{children}</select>
    </label>
  );
}

export function Case({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" {...props} className="h-4 w-4 rounded accent-marque-700" /> {label}
    </label>
  );
}

export function Carte({ titre, actions, children, className = '' }: { titre?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(titre || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titre && <h2 className="text-base font-semibold text-slate-900">{titre}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Chargement({ texte = 'Chargement…' }: { texte?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-marque-700 border-t-transparent" /> {texte}
    </div>
  );
}

export function EtatVide({ icone = '📄', titre, texte, action }: { icone?: string; titre: string; texte: string; action?: { libelle: string; vers?: string; onClick?: () => void } }) {
  return (
    <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="mb-3 text-4xl" aria-hidden>{icone}</div>
      <h3 className="text-base font-semibold text-slate-900">{titre}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{texte}</p>
      {action && (action.vers
        ? <Link to={action.vers} className="mt-5 rounded-lg bg-marque-700 px-4 py-2 text-sm font-medium text-white hover:bg-marque-900">{action.libelle}</Link>
        : <Bouton className="mt-5" onClick={action.onClick}>{action.libelle}</Bouton>)}
    </div>
  );
}

export function EtatErreur({ message, reessayer }: { message: string; reessayer?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-medium text-red-800">Oups, le chargement a échoué.</p>
      <p className="mt-1 text-sm text-red-700">{message}</p>
      {reessayer && <Bouton variante="secondaire" className="mt-4" onClick={reessayer}>Réessayer</Bouton>}
    </div>
  );
}

export function Badge({ couleur = 'gris', children }: { couleur?: 'vert' | 'orange' | 'rouge' | 'gris' | 'bleu'; children: ReactNode }) {
  const c = { vert: 'bg-green-100 text-green-800', orange: 'bg-amber-100 text-amber-800', rouge: 'bg-red-100 text-red-800', gris: 'bg-slate-100 text-slate-700', bleu: 'bg-blue-100 text-blue-800' }[couleur];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function Entete({ titre, sousTitre, actions }: { titre: string; sousTitre?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{titre}</h1>
        {sousTitre && <p className="mt-1 text-sm text-slate-500">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tableau({ entetes, children }: { entetes: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>{entetes.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-600">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
