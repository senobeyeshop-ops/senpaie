-- =====================================================================
-- SenPaie — Paramètres légaux Sénégal (en vigueur au 1er janvier 2026)
-- À VÉRIFIER chaque année (Loi de finances, IPRES, CSS) et à mettre à
-- jour en insérant une nouvelle ligne avec une nouvelle date_effet.
-- Le moteur prend la ligne la plus récente dont date_effet <= période.
-- =====================================================================
insert into public.parametres_legaux (cle, date_effet, source, valeur) values
('paie_senegal', '2026-01-01',
 'CGI art. 173-174 (IR), TRIMF, CFCE 3 %, IPRES (plafonds depuis 06/2022), CSS (CLEISS 01/01/2026)',
 '{
   "ipres_rg":  { "taux_sal": 0.056, "taux_pat": 0.084, "plafond": 432000 },
   "ipres_rcc": { "taux_sal": 0.024, "taux_pat": 0.036, "plafond": 1296000 },
   "css_pf":    { "taux_pat": 0.07,  "plafond": 63000 },
   "css_at":    { "plafond": 63000 },
   "cfce":      { "taux": 0.03 },
   "ir": {
     "abattement_taux": 0.30,
     "abattement_plafond_annuel": 900000,
     "bareme": [
       { "jusqua": 630000,   "taux": 0 },
       { "jusqua": 1500000,  "taux": 0.20 },
       { "jusqua": 4000000,  "taux": 0.30 },
       { "jusqua": 8000000,  "taux": 0.35 },
       { "jusqua": 13500000, "taux": 0.37 },
       { "jusqua": null,     "taux": 0.40 }
     ],
     "reductions": [
       { "parts": 1,   "taux": 0,    "min": 0,      "max": 0 },
       { "parts": 1.5, "taux": 0.10, "min": 100000, "max": 300000 },
       { "parts": 2,   "taux": 0.15, "min": 200000, "max": 650000 },
       { "parts": 2.5, "taux": 0.20, "min": 300000, "max": 1100000 },
       { "parts": 3,   "taux": 0.25, "min": 400000, "max": 1650000 },
       { "parts": 3.5, "taux": 0.30, "min": 500000, "max": 2030000 },
       { "parts": 4,   "taux": 0.35, "min": 600000, "max": 2490000 },
       { "parts": 4.5, "taux": 0.40, "min": 700000, "max": 2755000 },
       { "parts": 5,   "taux": 0.45, "min": 800000, "max": 3180000 }
     ],
     "parts_max": 5
   },
   "trimf": [
     { "jusqua": 600000,   "montant_annuel": 900 },
     { "jusqua": 1000000,  "montant_annuel": 3600 },
     { "jusqua": 2000000,  "montant_annuel": 4800 },
     { "jusqua": 12000000, "montant_annuel": 6000 },
     { "jusqua": null,     "montant_annuel": 18000 }
   ],
   "brs": { "taux_defaut": 0.05 },
   "echeances": { "jour_limite_vrs": 15, "jour_limite_brs": 15, "jour_limite_social": 15 }
 }'::jsonb)
on conflict (cle, date_effet) do update set valeur = excluded.valeur, source = excluded.source;
