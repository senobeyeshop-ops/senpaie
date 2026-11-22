export const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const fcfa = (n: number | null | undefined) => `${nf.format(Math.round(Number(n) || 0))} FCFA`;
export const nombre = (n: number | null | undefined) => nf.format(Math.round(Number(n) || 0));
export const pct = (t: number | null | undefined) => `${(Number(t || 0) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
export const periodeLibelle = (annee: number, mois: number) => `${MOIS[mois - 1]} ${annee}`;
export const dateFr = (d: string | null | undefined) =>
  d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-FR') : '—';
export const joursRestants = (d: string) =>
  Math.ceil((new Date(d + 'T23:59:59').getTime() - Date.now()) / 86_400_000);
