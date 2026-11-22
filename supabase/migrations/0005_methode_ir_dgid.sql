-- =====================================================================
-- SenPaie — Méthode de calcul de l'IR alignée sur le barème mensuel DGID
-- Vérifiée sur les 4 951 lignes × 9 colonnes de parts du « Barème mensuel
-- des retenues à la source sur salaires » (0 écart) :
--   net mensuel = brut imposable − min(30 % ; 75 000), arrondi au millier inférieur
--   IR annuel   = barème art. 173 sur (net mensuel × 12) − réduction famille
--   IR mensuel  = IR annuel / 12, arrondi à l'unité
-- Les cotisations IPRES ne sont PAS déduites avant l'abattement.
-- =====================================================================
update public.parametres_legaux
   set valeur = valeur
     || jsonb_build_object('ir', (valeur->'ir') || '{"abattement_plafond_mensuel":75000,"arrondi_base":1000,"deduire_retraite":false}'::jsonb),
       source = coalesce(source,'') || ' ; méthode IR conforme au barème mensuel DGID'
 where cle = 'paie_senegal';

-- Pour le calcul des parts selon l'annexe 1 du Guide fiscal des PME
comment on column public.employes.conjoint_sans_revenu is 'Non utilisé pour les parts (règle DGID : marié = 1,5 part de base).';
