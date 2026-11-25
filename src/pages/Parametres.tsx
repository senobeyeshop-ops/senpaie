import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useEntreprise, type Entreprise } from '../context/EntrepriseProvider';
import { messageErreur } from '../lib/erreurs';
import { useRequete, verifier } from '../lib/useRequete';
import { Badge, Bouton, Carte, Case, Champ, Entete, Liste, Tableau } from '../components/ui';
import type { Rubrique } from '../paie/types';
import { listerConventions } from '../lib/conventions';
import { estHorsBrut } from '../paie/moteur';

export default function Parametres() {
  const { courante, recharger, peutEcrire } = useEntreprise();
  const [f, setF] = useState<Entreprise>(courante!);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => setF(courante!), [courante]);
  const convs = useRequete(listerConventions, []);

  async function enregistrer() {
    if (f.nom.trim().length < 2) { toast.error('Raison sociale obligatoire.'); return; }
    if (!/^[A-Z0-9-]{0,6}$/.test((f.prefixe_matricule ?? '').toUpperCase())) { toast.error('Préfixe des matricules : 6 caractères maximum (lettres, chiffres, tiret).'); return; }
    setEnvoi(true);
    const { error } = await supabase.from('entreprises').update({
      nom: f.nom.trim(), ninea: f.ninea, rccm: f.rccm, adresse: f.adresse, telephone: f.telephone, email: f.email,
      numero_ipres: f.numero_ipres, numero_css: f.numero_css, taux_at: Number(f.taux_at),
      taux_ipm_salarie: Number(f.taux_ipm_salarie), taux_ipm_employeur: Number(f.taux_ipm_employeur),
      plafond_ipm: f.plafond_ipm ? Number(f.plafond_ipm) : null, periodicite_sociale: f.periodicite_sociale,
      convention_id: f.convention_id || null,
      prefixe_matricule: (f.prefixe_matricule ?? 'MAT').toUpperCase(),
    }).eq('id', f.id);
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    toast.success('Paramètres enregistrés'); recharger();
  }
  const t = (k: keyof Entreprise) => ({ value: (f[k] ?? '') as string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value || null }) });
  const pctChamp = (k: 'taux_at' | 'taux_ipm_salarie' | 'taux_ipm_employeur') => ({
    type: 'number', step: '0.1', min: 0, max: 10, value: String(Math.round(Number(f[k]) * 1000) / 10),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) / 100 }),
  });

  return (
    <>
      <Entete titre="Paramètres" sousTitre="Informations légales, taux propres à l'entreprise, rubriques de paie et utilisateurs" />
      <fieldset disabled={!peutEcrire} className="space-y-6">
        <Carte titre="Entreprise">
          <div className="grid gap-4 md:grid-cols-3">
            <Champ label="Raison sociale" {...t('nom')} />
            <Champ label="NINEA" {...t('ninea')} />
            <Champ label="RCCM" {...t('rccm')} />
            <Champ label="Adresse" {...t('adresse')} />
            <Champ label="Téléphone" {...t('telephone')} />
            <Champ label="E-mail" {...t('email')} />
            <Champ label="N° employeur IPRES" {...t('numero_ipres')} />
            <Champ label="N° employeur CSS" {...t('numero_css')} />
          </div>
        </Carte>
        <Carte titre="Cotisations propres à l'entreprise">
          <div className="grid gap-4 md:grid-cols-3">
            <Champ label="Taux accident du travail CSS (%)" {...pctChamp('taux_at')} aide="Notifié par la CSS : 1 %, 3 % ou 5 % selon le risque" />
            <Champ label="IPM — part salariale (%)" {...pctChamp('taux_ipm_salarie')} aide="0 si pas d'IPM" />
            <Champ label="IPM — part patronale (%)" {...pctChamp('taux_ipm_employeur')} />
            <Champ label="Plafond IPM (FCFA)" type="number" value={String(f.plafond_ipm ?? '')} onChange={(e) => setF({ ...f, plafond_ipm: e.target.value ? Number(e.target.value) : null })} aide="Vide = sans plafond" />
            <Champ label="Préfixe des matricules" maxLength={6} value={f.prefixe_matricule ?? ''} onChange={(e) => setF({ ...f, prefixe_matricule: e.target.value.toUpperCase() })}
              aide={`Prochain matricule : ${(f.prefixe_matricule ?? '')}${String((courante!.compteur_matricule ?? 0) + 1).padStart(4, '0')}`} />
            <Liste label="Convention collective par défaut" value={f.convention_id ?? ''} onChange={(e) => setF({ ...f, convention_id: e.target.value || null })}>
              <option value="">— Aucune —</option>{(convs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </Liste>
            <Liste label="Périodicité IPRES / CSS" value={f.periodicite_sociale} onChange={(e) => setF({ ...f, periodicite_sociale: e.target.value as Entreprise['periodicite_sociale'] })}>
              <option value="mensuelle">Mensuelle</option><option value="trimestrielle">Trimestrielle</option>
            </Liste>
          </div>
        </Carte>
      </fieldset>
      {peutEcrire && <div className="mt-4 flex justify-end"><Bouton onClick={enregistrer} chargement={envoi}>Enregistrer</Bouton></div>}

      <Rubriques />
      {courante!.role === 'proprietaire' && <Membres />}
      <p className="mt-6 text-sm"><Link to="/bienvenue?nouvelle" className="text-marque-700 hover:underline">+ Gérer une autre entreprise (cabinet comptable)</Link></p>
    </>
  );
}

function Rubriques() {
  const { courante, peutEcrire } = useEntreprise();
  const { data, recharger } = useRequete(async () => verifier(await supabase.from('rubriques').select('*').eq('entreprise_id', courante!.id).order('type').order('libelle')) as Rubrique[], [courante!.id]);
  const [n, setN] = useState({ code: '', libelle: '', type: 'gain', soumis_cotisations: true, soumis_impot: true, plafond: '' });

  async function ajouter() {
    const code = n.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!code || n.libelle.trim().length < 2) { toast.error('Code et libellé obligatoires.'); return; }
    const { error } = await supabase.from('rubriques').insert({ entreprise_id: courante!.id, code, libelle: n.libelle.trim(), type: n.type, soumis_cotisations: n.soumis_cotisations, soumis_impot: n.soumis_impot, plafond_exoneration: n.plafond ? Number(n.plafond) : null });
    if (error) { toast.error(messageErreur(error)); return; }
    setN({ code: '', libelle: '', type: 'gain', soumis_cotisations: true, soumis_impot: true, plafond: '' }); recharger();
  }
  async function basculer(r: Rubrique) {
    const { error } = await supabase.from('rubriques').update({ actif: !r.actif }).eq('id', r.id);
    if (error) toast.error(messageErreur(error)); else recharger();
  }
  const libType = { gain: 'Gain', deduction_brut: 'Déduction du brut', retenue: 'Retenue sur net' };

  return (
    <Carte titre="Rubriques de paie" className="mt-8">
      <Tableau entetes={['Code', 'Libellé', 'Type', 'Cotisable', 'Imposable', 'Plafond exonération', '']}>
        {(data ?? []).map((r) => (
          <tr key={r.id} className={r.actif ? '' : 'opacity-50'}>
            <td className="px-4 py-2 font-mono text-xs">{r.code}</td><td className="px-4 py-2">{r.libelle}</td><td className="px-4 py-2">{estHorsBrut(r) ? <>Gain <Badge couleur="vert">hors brut</Badge></> : libType[r.type]}</td>
            <td className="px-4 py-2">{r.soumis_cotisations ? 'Oui' : <Badge couleur="bleu">Non</Badge>}</td><td className="px-4 py-2">{r.soumis_impot ? 'Oui' : <Badge couleur="bleu">Non</Badge>}</td>
            <td className="px-4 py-2">{r.plafond_exoneration ?? '—'}</td>
            <td className="px-4 py-2 text-right">{peutEcrire && <button className="text-marque-700 hover:underline" onClick={() => basculer(r)}>{r.actif ? 'Désactiver' : 'Activer'}</button>}</td>
          </tr>
        ))}
      </Tableau>
      {peutEcrire && (
        <div className="mt-4 grid gap-3 md:grid-cols-6 md:items-end">
          <Champ label="Code" value={n.code} onChange={(e) => setN({ ...n, code: e.target.value })} />
          <div className="md:col-span-2"><Champ label="Libellé" value={n.libelle} onChange={(e) => setN({ ...n, libelle: e.target.value })} /></div>
          <Liste label="Type" value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}><option value="gain">Gain</option><option value="deduction_brut">Déduction du brut</option><option value="retenue">Retenue sur net</option></Liste>
          <Champ label="Plafond exo." type="number" value={n.plafond} onChange={(e) => setN({ ...n, plafond: e.target.value })} />
          <Bouton variante="secondaire" onClick={ajouter}>Ajouter</Bouton>
          <div className="flex gap-4 md:col-span-6"><Case label="Soumis aux cotisations" checked={n.soumis_cotisations} onChange={(e) => setN({ ...n, soumis_cotisations: e.target.checked })} /><Case label="Soumis à l'impôt" checked={n.soumis_impot} onChange={(e) => setN({ ...n, soumis_impot: e.target.checked })} /></div>
        </div>
      )}
    </Carte>
  );
}

function Membres() {
  const { courante } = useEntreprise();
  const { data, recharger } = useRequete(async () => verifier(await supabase.from('membres').select('user_id, role, profils(nom_complet)').eq('entreprise_id', courante!.id)) as unknown as { user_id: string; role: string; profils: { nom_complet: string | null } | null }[], [courante!.id]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('gestionnaire');

  async function ajouter() {
    const { error } = await supabase.rpc('ajouter_membre', { p_entreprise: courante!.id, p_email: email, p_role: role });
    if (error) { toast.error(messageErreur(error)); return; }
    setEmail(''); toast.success('Membre ajouté'); recharger();
  }
  async function retirer(uid: string) {
    const { error } = await supabase.from('membres').delete().eq('entreprise_id', courante!.id).eq('user_id', uid);
    if (error) toast.error(messageErreur(error)); else recharger();
  }

  return (
    <Carte titre="Utilisateurs" className="mt-8">
      <ul className="mb-4 divide-y divide-slate-100 text-sm">
        {(data ?? []).map((m) => (
          <li key={m.user_id} className="flex justify-between py-2"><span>{m.profils?.nom_complet ?? 'Utilisateur'} — <Badge>{m.role}</Badge></span>
            {m.role !== 'proprietaire' && <button className="text-red-600 hover:underline" onClick={() => retirer(m.user_id)}>Retirer</button>}</li>
        ))}
      </ul>
      <div className="grid gap-3 md:grid-cols-4 md:items-end">
        <div className="md:col-span-2"><Champ label="E-mail (compte SenPaie existant)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <Liste label="Rôle" value={role} onChange={(e) => setRole(e.target.value)}><option value="gestionnaire">Gestionnaire (saisie)</option><option value="lecteur">Lecteur (consultation)</option></Liste>
        <Bouton variante="secondaire" onClick={ajouter}>Ajouter</Bouton>
      </div>
    </Carte>
  );
}
