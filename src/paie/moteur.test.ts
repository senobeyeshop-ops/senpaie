import { describe, expect, it } from 'vitest';
import { calculerBulletin, calculerParts, irBaremeAnnuel, reductionFamille, retenuesFiscales, trimfAnnuelle } from './moteur';
import bareme from './__fixtures__/bareme_dgid_mensuel.json';
import { PARAMETRES_DEFAUT } from './parametres';
import { dateLimite, preparerBRS, versCSV } from '../declarations/calculs';
import type { Employe, Rubrique } from './types';

const p = PARAMETRES_DEFAUT;
const ent = { taux_at: 0.01, taux_ipm_salarie: 0, taux_ipm_employeur: 0, plafond_ipm: null };

const employe = (x: Partial<Employe> = {}): Employe => ({
  id: 'e1', matricule: 'M001', prenom: 'Awa', nom: 'Diop', poste: 'Comptable', categorie: null,
  est_cadre: false, date_embauche: '2024-01-01', situation_familiale: 'celibataire',
  conjoint_sans_revenu: false, nombre_enfants: 0, nb_parts_override: null, parts_trimf: 1,
  numero_ipres: null, numero_css: null, salaire_base: 300000, sursalaire: 0,
  mode_paiement: 'virement', actif: true, ...x,
});

const transport: Rubrique = { id: 'r1', code: 'IND_TRANSP', libelle: 'Indemnité de transport', type: 'gain', soumis_cotisations: false, soumis_impot: false, plafond_exoneration: 26000 };
const avance: Rubrique = { id: 'r2', code: 'AVANCE', libelle: 'Avance', type: 'retenue', soumis_cotisations: false, soumis_impot: false, plafond_exoneration: null };

describe('barème IR', () => {
  it('0 sous 630 000', () => expect(irBaremeAnnuel(600000, p)).toBe(0));
  it('tranche 20 %', () => expect(irBaremeAnnuel(1500000, p)).toBe(174000));
  it('cumul des tranches', () => expect(irBaremeAnnuel(4000000, p)).toBe(174000 + 750000));
});

describe('parts et réduction famille', () => {
  it('célibataire = 1 part', () => expect(calculerParts(employe())).toBe(1));
  it('annexe 1 du Guide fiscal des PME', () => {
    const cas: [Employe['situation_familiale'], number, number][] = [
      ['celibataire', 0, 1], ['divorce', 0, 1], ['veuf', 0, 1], ['marie', 0, 1.5],
      ['celibataire', 1, 1.5], ['divorce', 1, 1.5], ['marie', 1, 2], ['veuf', 1, 2],
      ['celibataire', 2, 2], ['marie', 2, 2.5], ['veuf', 2, 2.5], ['celibataire', 3, 2.5],
      ['marie', 3, 3], ['celibataire', 4, 3], ['marie', 7, 5], ['celibataire', 12, 5],
    ];
    for (const [situation_familiale, nombre_enfants, attendu] of cas) {
      expect(calculerParts(employe({ situation_familiale, nombre_enfants }))).toBe(attendu);
    }
  });
  it('forçage manuel', () => expect(calculerParts(employe({ nb_parts_override: 2.5 }))).toBe(2.5));
  it('réduction encadrée par min et max et ≤ IR', () => {
    expect(reductionFamille(500000, 2, p)).toBe(200000);   // 15 % = 75 000 → min 200 000
    expect(reductionFamille(100000, 2, p)).toBe(100000);   // ne dépasse pas l'IR
    expect(reductionFamille(10000000, 2, p)).toBe(650000); // max
  });
});

describe('TRIMF', () => {
  it('par tranche de revenu annuel', () => {
    expect(trimfAnnuelle(500000, p)).toBe(900);
    expect(trimfAnnuelle(3600000, p)).toBe(6000);
    expect(trimfAnnuelle(20000000, p)).toBe(18000);
  });
  it('seuils du barème mensuel DGID (le seuil ouvre la tranche suivante)', () => {
    const seuils: [number, number][] = [[599999, 900], [600000, 3600], [999999, 3600], [1000000, 4800], [2000000, 6000], [7000000, 6000], [11999999, 6000], [12000000, 18000]];
    for (const [rev, attendu] of seuils) expect(trimfAnnuelle(rev, p)).toBe(attendu);
  });
  it('TRIMF mensuelle identique au barème mensuel DGID sur toutes les lignes', () => {
    const ecarts = (bareme.lignes as number[][]).filter(([brut, trimf]) => retenuesFiscales(brut, 1, 1, p).trimf !== trimf);
    expect(ecarts).toEqual([]);
  });
});

describe('bulletin complet', () => {
  it('non-cadre 300 000 + transport 26 000 exonéré', () => {
    const r = calculerBulletin(employe(), [{ rubrique: transport, montant: 26000 }], ent, p);
    expect(r.brut).toBe(326000);
    expect(r.brut_cotisable).toBe(300000);
    expect(r.ipres_rg_sal).toBe(16800);
    expect(r.ipres_rg_pat).toBe(25200);
    expect(r.css_pf).toBe(4410);   // 63 000 × 7 %
    expect(r.css_at).toBe(630);    // 63 000 × 1 %
    expect(r.cfce).toBe(9000);
    expect(r.trimf).toBe(500);     // 6 000 / 12 (barème mensuel DGID)
    // IR (méthode DGID) : 300 000 − min(30 % ; 75 000) = 225 000 → × 12 = 2 700 000
    // barème : 174 000 + (2 700 000 − 1 500 000) × 30 % = 534 000 → / 12 = 44 500
    expect(r.ir).toBe(44500);
    expect(r.net_a_payer).toBe(326000 - 16800 - 44500 - 500);
    expect(r.cout_employeur).toBe(326000 + 25200 + 4410 + 630 + 9000);
  });

  it('transport au-delà du plafond : surplus réintégré', () => {
    const r = calculerBulletin(employe(), [{ rubrique: transport, montant: 30000 }], ent, p);
    expect(r.brut_cotisable).toBe(304000);
    expect(r.brut_imposable).toBe(304000);
    expect(r.detail.alertes.length).toBe(1);
  });

  it('cadre : RCC plafonné à 1 296 000 et RG à 432 000', () => {
    const r = calculerBulletin(employe({ est_cadre: true, salaire_base: 2000000 }), [], ent, p);
    expect(r.ipres_rg_sal).toBe(Math.round(432000 * 0.056));
    expect(r.ipres_rcc_sal).toBe(Math.round(1296000 * 0.024));
    expect(r.ipres_rcc_pat).toBe(Math.round(1296000 * 0.036));
  });

  it('avance déduite du net', () => {
    const sans = calculerBulletin(employe(), [], ent, p);
    const avec = calculerBulletin(employe(), [{ rubrique: avance, montant: 50000 }], ent, p);
    expect(sans.net_a_payer - avec.net_a_payer).toBe(50000);
    expect(avec.ir).toBe(sans.ir);
  });

  it('refuse un montant négatif', () => {
    expect(() => calculerBulletin(employe(), [{ rubrique: avance, montant: -1 }], ent, p)).toThrow();
  });
});

describe('conformité au barème mensuel DGID', () => {
  const colonnes = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  it(`IR identique au barème officiel sur ${bareme.lignes.length} lignes × 9 parts`, () => {
    const ecarts: string[] = [];
    for (const [brut, , ...irs] of bareme.lignes as number[][]) {
      colonnes.forEach((parts, i) => {
        const { ir } = retenuesFiscales(brut, parts, 1, p);
        if (ir !== irs[i]) ecarts.push(`${brut} / ${parts} parts : ${ir} ≠ ${irs[i]}`);
      });
    }
    expect(ecarts).toEqual([]);
  });
});

describe('déclarations', () => {
  it('BRS somme les retenues', () => {
    const d = preparerBRS([
      { prestataire: 'A', ninea: null, date_paiement: '2026-11-02', nature: 'prestation', reference: null, montant_brut: 100000, taux_retenue: 0.05, montant_retenue: 5000 },
      { prestataire: 'B', ninea: null, date_paiement: '2026-11-03', nature: 'loyer', reference: null, montant_brut: 200000, taux_retenue: 0.05, montant_retenue: 10000 },
    ]);
    expect(d.montant_total).toBe(15000);
  });
  it('date limite au 15 du mois suivant, y compris décembre', () => {
    expect(dateLimite(2026, 11)).toBe('2026-12-15');
    expect(dateLimite(2026, 12)).toBe('2027-01-15');
  });
  it('CSV avec séparateur ; et échappement', () => {
    const csv = versCSV([{ a: 'x;y', b: 2 }]);
    expect(csv).toContain('a;b');
    expect(csv).toContain('"x;y";2');
  });
});
