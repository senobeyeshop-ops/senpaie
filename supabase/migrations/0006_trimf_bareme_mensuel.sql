-- =====================================================================
-- SenPaie — TRIMF alignée sur le « Barème mensuel des retenues à la source
-- sur salaires » (DGID), colonne « TRIMF / Pers » :
--   brut annuel < 600 000 .............. 900 F/an   (75 F/mois)
--   600 000 – 999 999 .................. 3 600 F/an (300 F/mois)
--   1 000 000 – 1 999 999 .............. 4 800 F/an (400 F/mois)
--   2 000 000 – 11 999 999 ............. 6 000 F/an (500 F/mois)
--   12 000 000 et plus ................. 18 000 F/an (1 500 F/mois)
-- Vérifié sur les 4 951 lignes du barème mensuel (0 écart).
-- =====================================================================
update public.parametres_legaux
   set valeur = jsonb_set(valeur, '{trimf}', '[
     {"jusqua":600000,"montant_annuel":900},
     {"jusqua":1000000,"montant_annuel":3600},
     {"jusqua":2000000,"montant_annuel":4800},
     {"jusqua":12000000,"montant_annuel":6000},
     {"jusqua":null,"montant_annuel":18000}]'::jsonb),
       source = coalesce(source,'') || ' ; TRIMF selon barème mensuel DGID'
 where cle = 'paie_senegal';

select valeur->'trimf' as trimf from public.parametres_legaux where cle = 'paie_senegal';
