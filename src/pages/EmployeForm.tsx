import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { useEntreprise } from '../context/EntrepriseProvider';
import { messageErreur } from '../lib/erreurs';
import { useRequete, verifier } from '../lib/useRequete';
import { erreursChamps } from '../auth/validation';
import { calculerParts } from '../paie/moteur';
import { fcfa } from '../lib/format';
import { Bouton, Carte, Case, Champ, Chargement, Entete, EtatErreur, Liste } from '../components/ui';
import type { Rubrique } from '../paie/types';
import { categoriesDe, listerConventions, parCollege, type CategorieConv } from '../lib/conventions';

const montant = z.coerce.number().int('Montant entier en FCFA').min(0, 'Montant positif');
const schema = z.object({
  matricule: z.string().trim().toUpperCase().max(20).regex(/^[A-Z0-9\-_/]*$/, 'Lettres, chiffres, - _ / uniquement'),
  prenom: z.string().trim().min(1, 'Obligatoire').max(80),
  nom: z.string().trim().min(1, 'Obligatoire').max(80),
  sexe: z.enum(['M', 'F']).nullable(),
  date_naissance: z.string().nullable(),
  telephone: z.string().trim().max(20).nullable(),
  poste: z.string().trim().max(100).nullable(),
  categorie: z.string().trim().max(50).nullable(),
  est_cadre: z.boolean(),
  type_contrat: z.enum(['CDI', 'CDD', 'Stage', 'Journalier', 'Autre']),
  date_embauche: z.string().min(10, 'Date obligatoire'),
  date_sortie: z.string().nullable(),
  situation_familiale: z.enum(['celibataire', 'marie', 'divorce', 'veuf']),
  conjoint_sans_revenu: z.boolean(),
  nombre_enfants: z.coerce.number().int().min(0).max(30),
  nb_parts_override: z.coerce.number().min(1).max(5).nullable(),
  parts_trimf: z.coerce.number().int().min(1).max(10),
  numero_ipres: z.string().trim().max(30).nullable(),
  numero_css: z.string().trim().max(30).nullable(),
  mode_paiement: z.enum(['virement', 'wave', 'orange_money', 'especes', 'cheque']),
  coordonnees_paiement: z.string().trim().max(60).nullable(),
  salaire_base: montant.refine((v) => v > 0, 'Le salaire de base doit être supérieur à 0'),
  sursalaire: montant,
  actif: z.boolean(),
  convention_id: z.string().uuid().nullable(),
  categorie_conv_id: z.string().uuid().nullable(),
});
type Form = z.input<typeof schema>;

const vide: Form = {
  matricule: '', prenom: '', nom: '', sexe: null, date_naissance: null, telephone: null, poste: null, categorie: null,
  est_cadre: false, type_contrat: 'CDI', date_embauche: new Date().toISOString().slice(0, 10), date_sortie: null,
  situation_familiale: 'celibataire', conjoint_sans_revenu: false, nombre_enfants: 0, nb_parts_override: null, parts_trimf: 1,
  numero_ipres: null, numero_css: null, mode_paiement: 'virement', coordonnees_paiement: null, salaire_base: 0, sursalaire: 0, actif: true,
  convention_id: null, categorie_conv_id: null,
};

export default function EmployeForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { courante, peutEcrire } = useEntreprise();
  const [f, setF] = useState<Form>(vide);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);

  const { data, chargement, erreur, recharger } = useRequete(async () => {
    const rub = verifier(await supabase.from('rubriques').select('*').eq('entreprise_id', courante!.id).eq('actif', true).in('type', ['gain', 'retenue']).order('libelle')) as Rubrique[];
    if (!id) return { emp: null, rub, fixes: [] as { id: string; rubrique_id: string; montant: number }[] };
    const emp = verifier(await supabase.from('employes').select('*').eq('id', id).single());
    const fixes = verifier(await supabase.from('elements_fixes').select('*').eq('employe_id', id)) as { id: string; rubrique_id: string; montant: number }[];
    return { emp, rub, fixes };
  }, [id, courante!.id]);

  useEffect(() => { if (data?.emp) setF({ ...vide, ...(data.emp as Form) }); }, [data?.emp]);
  useEffect(() => { if (!id && courante?.convention_id) setF((x) => ({ ...x, convention_id: x.convention_id ?? courante.convention_id })); }, [id, courante?.convention_id]);
  const convs = useRequete(listerConventions, []);
  const cats = useRequete(async () => (f.convention_id ? categoriesDe(f.convention_id) : [] as CategorieConv[]), [f.convention_id]);
  const catChoisie = (cats.data ?? []).find((c) => c.id === f.categorie_conv_id) ?? null;
  const sousMinimum = !!catChoisie && Number(f.salaire_base) > 0 && Number(f.salaire_base) < catChoisie.salaire_mensuel;
  function choisirCategorie(cid: string) {
    const c = (cats.data ?? []).find((x) => x.id === cid) ?? null;
    setF((x) => ({
      ...x, categorie_conv_id: c?.id ?? null,
      categorie: c ? `${c.college} — ${c.categorie}` : x.categorie,
      // Pré-remplit le salaire de base avec le minimum catégoriel s'il est vide ou inférieur
      salaire_base: c && (!Number(x.salaire_base) || Number(x.salaire_base) < c.salaire_mensuel) ? c.salaire_mensuel : x.salaire_base,
    }));
  }

  const maj = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof Form) => ({ value: (f[k] ?? '') as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => maj(k, (e.target.value === '' ? null : e.target.value) as never), erreur: erreurs[k] });

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const r = schema.safeParse({ ...f, nb_parts_override: f.nb_parts_override === null || f.nb_parts_override === '' ? null : f.nb_parts_override });
    if (!r.success) { setErreurs(erreursChamps(r.error)); toast.error('Corrigez les champs signalés en rouge.'); return; }
    if (r.data.date_sortie && r.data.date_sortie < r.data.date_embauche) { setErreurs({ date_sortie: 'Doit être après la date d\'embauche' }); return; }
    if (sousMinimum && !confirm(`Le salaire de base est inférieur au minimum de la catégorie (${fcfa(catChoisie!.salaire_mensuel)}). Enregistrer quand même ?`)) return;
    setErreurs({}); setEnvoi(true);
    if (id && !r.data.matricule) { setErreurs({ matricule: 'Le matricule ne peut pas être vide' }); return; }
    // Matricule vide à la création → attribué automatiquement par la base (préfixe + compteur)
    const ligne = { ...r.data, matricule: r.data.matricule || null, entreprise_id: courante!.id };
    const res = id
      ? await supabase.from('employes').update(ligne).eq('id', id).select('id, matricule').single()
      : await supabase.from('employes').insert(ligne).select('id, matricule').single();
    setEnvoi(false);
    if (res.error) { toast.error(messageErreur(res.error)); return; }
    toast.success(id ? 'Employé mis à jour' : `Employé ajouté — matricule ${res.data.matricule}`);
    if (!id) nav(`/employes/${res.data.id}`, { replace: true }); else recharger();
  }

  if (chargement) return <Chargement />;
  if (erreur) return <EtatErreur message={erreur} reessayer={recharger} />;

  const parts = calculerParts({ situation_familiale: f.situation_familiale, nombre_enfants: Number(f.nombre_enfants) || 0, nb_parts_override: f.nb_parts_override ? Number(f.nb_parts_override) : null });

  return (
    <>
      <Entete titre={id ? `${f.prenom} ${f.nom}` : 'Nouvel employé'} sousTitre={id ? `Matricule ${f.matricule}` : 'Renseignez les informations de paie'}
        actions={<Bouton variante="secondaire" onClick={() => nav('/employes')}>← Retour</Bouton>} />
      <form onSubmit={soumettre} className="space-y-6" noValidate>
        <fieldset disabled={!peutEcrire} className="space-y-6">
          <Carte titre="Identité">
            <div className="grid gap-4 md:grid-cols-3">
              <Champ label="Matricule" required={!!id} {...txt('matricule')}
                placeholder={id ? '' : `Automatique (${courante?.prefixe_matricule ?? 'MAT'}0001…)`}
                aide={id ? undefined : 'Laissez vide : SenPaie attribue le prochain numéro'} />
              <Champ label="Prénom" required {...txt('prenom')} />
              <Champ label="Nom" required {...txt('nom')} />
              <Liste label="Sexe" value={f.sexe ?? ''} onChange={(e) => maj('sexe', (e.target.value || null) as Form['sexe'])}>
                <option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option>
              </Liste>
              <Champ label="Date de naissance" type="date" {...txt('date_naissance')} />
              <Champ label="Téléphone" {...txt('telephone')} />
            </div>
          </Carte>

          <Carte titre="Contrat">
            <div className="grid gap-4 md:grid-cols-3">
              <Champ label="Poste" {...txt('poste')} />
              <Champ label="Catégorie (libellé sur le bulletin)" {...txt('categorie')} />
              <Liste label="Type de contrat" value={f.type_contrat} onChange={(e) => maj('type_contrat', e.target.value as Form['type_contrat'])}>
                {['CDI', 'CDD', 'Stage', 'Journalier', 'Autre'].map((t) => <option key={t}>{t}</option>)}
              </Liste>
              <Champ label="Date d'embauche" type="date" required {...txt('date_embauche')} />
              <Champ label="Date de sortie" type="date" {...txt('date_sortie')} aide="Laisser vide si toujours en poste" />
              <div className="flex flex-col justify-end gap-2 pb-2">
                <Case label="Cadre (régime complémentaire IPRES)" checked={f.est_cadre} onChange={(e) => maj('est_cadre', e.target.checked)} />
                <Case label="Employé actif" checked={f.actif} onChange={(e) => maj('actif', e.target.checked)} />
              </div>
            </div>
          </Carte>

          <Carte titre="Convention collective et classification">
            <div className="grid gap-4 md:grid-cols-2">
              <Liste label="Convention collective" value={f.convention_id ?? ''} onChange={(e) => setF((x) => ({ ...x, convention_id: e.target.value || null, categorie_conv_id: null }))}>
                <option value="">— Aucune / hors convention —</option>
                {(convs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </Liste>
              <Liste label="Catégorie professionnelle" value={f.categorie_conv_id ?? ''} onChange={(e) => choisirCategorie(e.target.value)} disabled={!f.convention_id || cats.chargement}>
                <option value="">{f.convention_id ? 'Choisir la catégorie…' : 'Choisissez d\'abord la convention'}</option>
                {parCollege(cats.data ?? []).map(([college, liste]) => (
                  <optgroup key={college} label={college}>
                    {liste.map((c) => <option key={c.id} value={c.id}>{c.categorie} — {fcfa(c.salaire_mensuel)}</option>)}
                  </optgroup>
                ))}
              </Liste>
            </div>
            {catChoisie && (
              <p className={`mt-3 rounded-lg p-3 text-sm ${sousMinimum ? 'bg-red-50 text-red-800' : 'bg-marque-50 text-marque-900'}`}>
                Salaire catégoriel minimum : <b>{fcfa(catChoisie.salaire_mensuel)}</b> / mois (173,33 h)
                {catChoisie.unite === 'horaire' && <> — soit {Number(catChoisie.taux_horaire).toLocaleString('fr-FR')} F/heure</>}
                {catChoisie.unite === 'journalier' && <> — taux journalier {Number(catChoisie.taux_journalier).toLocaleString('fr-FR')} F × 26 jours</>}
                {sousMinimum && <> · ⚠️ le salaire de base saisi est inférieur à ce minimum.</>}
              </p>
            )}
          </Carte>

          <Carte titre="Rémunération">
            <div className="grid gap-4 md:grid-cols-3">
              <Champ label="Salaire de base mensuel (FCFA)" type="number" min={0} required value={String(f.salaire_base ?? '')} onChange={(e) => maj('salaire_base', e.target.value)} erreur={erreurs.salaire_base} />
              <Champ label="Sursalaire (FCFA)" type="number" min={0} value={String(f.sursalaire ?? '')} onChange={(e) => maj('sursalaire', e.target.value)} erreur={erreurs.sursalaire} />
              <Liste label="Mode de paiement" value={f.mode_paiement} onChange={(e) => maj('mode_paiement', e.target.value as Form['mode_paiement'])}>
                <option value="virement">Virement</option><option value="wave">Wave</option><option value="orange_money">Orange Money</option><option value="especes">Espèces</option><option value="cheque">Chèque</option>
              </Liste>
              <Champ label="RIB / n° mobile money" {...txt('coordonnees_paiement')} />
              <Champ label="N° IPRES" {...txt('numero_ipres')} />
              <Champ label="N° CSS" {...txt('numero_css')} />
            </div>
          </Carte>

          <Carte titre="Situation familiale (calcul de l'IR)">
            <div className="grid gap-4 md:grid-cols-3">
              <Liste label="Situation" value={f.situation_familiale} onChange={(e) => maj('situation_familiale', e.target.value as Form['situation_familiale'])}>
                <option value="celibataire">Célibataire</option><option value="marie">Marié(e)</option><option value="divorce">Divorcé(e)</option><option value="veuf">Veuf / veuve</option>
              </Liste>
              <Champ label="Enfants à charge" type="number" min={0} value={String(f.nombre_enfants ?? 0)} onChange={(e) => maj('nombre_enfants', e.target.value)} />
              <Champ label="Forcer le nombre de parts" type="number" step="0.5" min={1} max={5} value={String(f.nb_parts_override ?? '')} onChange={(e) => maj('nb_parts_override', e.target.value === '' ? null : e.target.value)} aide={`Calcul automatique (règle DGID) : ${String(parts).replace('.', ',')} part(s)`} />
              <Champ label="Parts TRIMF" type="number" min={1} max={10} value={String(f.parts_trimf ?? 1)} onChange={(e) => maj('parts_trimf', e.target.value)} aide="1 par défaut" />
            </div>
          </Carte>
        </fieldset>

        {peutEcrire && <div className="flex justify-end"><Bouton type="submit" chargement={envoi}>{id ? 'Enregistrer les modifications' : 'Ajouter l\'employé'}</Bouton></div>}
      </form>

      {id && data && <ElementsFixes employeId={id} rubriques={data.rub} fixes={data.fixes} onChange={recharger} peutEcrire={peutEcrire} />}
    </>
  );
}

function ElementsFixes({ employeId, rubriques, fixes, onChange, peutEcrire }: { employeId: string; rubriques: Rubrique[]; fixes: { id: string; rubrique_id: string; montant: number }[]; onChange: () => void; peutEcrire: boolean }) {
  const { courante } = useEntreprise();
  const [rub, setRub] = useState('');
  const [mt, setMt] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const nomRub = (rid: string) => rubriques.find((r) => r.id === rid)?.libelle ?? 'Rubrique';

  async function ajouter() {
    const m = Number(mt);
    if (!rub || !Number.isInteger(m) || m <= 0) { toast.error('Choisissez une rubrique et un montant entier positif.'); return; }
    setEnvoi(true);
    const { error } = await supabase.from('elements_fixes').upsert({ entreprise_id: courante!.id, employe_id: employeId, rubrique_id: rub, montant: m }, { onConflict: 'employe_id,rubrique_id' });
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    setRub(''); setMt(''); onChange();
  }
  async function supprimer(fid: string) {
    const { error } = await supabase.from('elements_fixes').delete().eq('id', fid);
    if (error) toast.error(messageErreur(error)); else onChange();
  }

  return (
    <Carte titre="Primes et indemnités fixes (chaque mois)" className="mt-6">
      {fixes.length === 0 ? <p className="text-sm text-slate-500">Aucun élément fixe. Ex. : indemnité de transport, prime d'ancienneté, indemnité de logement.</p> : (
        <ul className="divide-y divide-slate-100">
          {fixes.map((x) => (
            <li key={x.id} className="flex items-center justify-between py-2 text-sm">
              <span>{nomRub(x.rubrique_id)}</span>
              <span className="flex items-center gap-4"><b>{fcfa(x.montant)}</b>{peutEcrire && <button className="text-red-600 hover:underline" onClick={() => supprimer(x.id)}>Retirer</button>}</span>
            </li>
          ))}
        </ul>
      )}
      {peutEcrire && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1"><Liste label="Rubrique" value={rub} onChange={(e) => setRub(e.target.value)}><option value="">Choisir…</option>{rubriques.map((r) => <option key={r.id} value={r.id}>{r.libelle}</option>)}</Liste></div>
          <div className="w-40"><Champ label="Montant (FCFA)" type="number" min={0} value={mt} onChange={(e) => setMt(e.target.value)} /></div>
          <Bouton variante="secondaire" onClick={ajouter} chargement={envoi}>Ajouter</Bouton>
        </div>
      )}
    </Carte>
  );
}
