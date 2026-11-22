# SenPaie — Paie & déclarations pour les PME sénégalaises

**SenPaie** édite les bulletins de paie et prépare les déclarations **VRS** et **BRS** (DGID / eTax), **IPRES** et **CSS**.
Stack : **React + Vite + TypeScript + Tailwind** (Netlify) · **Supabase** (Postgres, Auth, RLS).

> Pourquoi « SenPaie » : nom clair (« Sénégal + paie »), cohérent avec ta gamme (Sen-Impôt, SenEcole, SenMarchés), facile à retenir et à dire au téléphone.
> Domaines à vérifier : `senpaie.com`, `senpaie.sn`. Sous-domaine Netlify : `senpaie.netlify.app`.

---

## Prompt 1 — Architecture

### Plan d'architecture
```
Navigateur (SPA React)  ──HTTPS──>  Supabase
 ├─ Auth (inscription, connexion,       ├─ Auth : e-mail + mot de passe, JWT, limitation des tentatives
 │  mot de passe oublié)                ├─ Postgres : tables métier + RLS (isolation par entreprise)
 ├─ Moteur de paie (TS pur, testé)      ├─ Fonctions RPC (SECURITY DEFINER) : créer entreprise,
 ├─ Préparation VRS/BRS/IPRES/CSS       │  activer licence, générer licences, admin
 └─ Bulletin imprimable A4 (PDF)        └─ Paramètres légaux versionnés (taux, plafonds, barèmes)
Netlify : hébergement statique + redirections SPA + en-têtes de sécurité
```
- **Multi-entreprise** : un compte peut gérer plusieurs entreprises (utile pour un cabinet comptable). Rôles : propriétaire, gestionnaire, lecteur.
- **Moteur de paie côté client, pur et testé** (`src/paie/moteur.ts`) : aucune donnée inventée, tous les taux viennent de la table `parametres_legaux` (version applicable au mois traité). Les bulletins sont **figés** en base (montants + détail JSON) : un changement de taux ne modifie jamais un bulletin passé.
- **Sécurité dans la base** : toutes les règles (qui voit quoi, abonnement actif, limite d'employés, période clôturée) sont appliquées par Postgres (RLS + triggers), pas seulement par l'interface.

### Structure des dossiers
```
senpaie/
├─ netlify.toml                  # build, redirections SPA, en-têtes de sécurité
├─ .env.example                  # variables à renseigner
├─ supabase/
│  ├─ migrations/
│  │  ├─ 0001_schema.sql         # tables, contraintes, index
│  │  ├─ 0002_fonctions_rls.sql  # helpers sécurité, triggers, RPC, politiques RLS
│  │  └─ 0003_parametres_2026.sql# taux et barèmes Sénégal 2026
│  └─ creer_admin.sql            # te donne le rôle administrateur
└─ src/
   ├─ paie/          moteur.ts (calcul), types.ts, parametres.ts, moteur.test.ts (16 tests)
   ├─ declarations/  calculs.ts (VRS, BRS, IPRES, CSS, échéances, export CSV)
   ├─ auth/          AuthProvider.tsx, validation.ts (zod, anti-force brute)
   ├─ context/       EntrepriseProvider.tsx (entreprise courante, droits, abonnement)
   ├─ lib/           supabase.ts, donnees.ts, erreurs.ts, useRequete.ts, format.ts
   ├─ components/    ui.tsx (états vides, erreurs, chargement), Layout.tsx, ErrorBoundary.tsx
   └─ pages/         Connexion, Inscription, MotDePasseOublie, NouveauMotDePasse, Onboarding,
                     TableauDeBord, Employes, EmployeForm, Paie, PeriodeDetail, Bulletin,
                     Declarations, Brs, Parametres, Abonnement, Admin, NotFound
```

### Dépendances (versions actuelles, aucune obsolète)
| Paquet | Rôle |
|---|---|
| react, react-dom, react-router-dom | interface et routage |
| @supabase/supabase-js | auth + base de données |
| zod | validation des formulaires |
| sonner | notifications (toasts) |
| vite, @vitejs/plugin-react, typescript | build |
| tailwindcss, @tailwindcss/vite | styles |
| vitest | tests du moteur de paie |

### Routage et authentification
- Publiques : `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`.
- Privées (garde `RequireAuth`) : `/bienvenue` (création de l'entreprise), puis tout le reste sous garde `RequireEntreprise`.
- `/admin` : garde `RequireAdmin` **et** contrôle côté base (`is_platform_admin()`).
- Les pages lourdes sont chargées à la demande (code-splitting).

### Performance et montée en charge
Index sur toutes les clés de recherche (entreprise, période, date). Calcul d'une paie = 5 requêtes groupées + 1 `upsert` en lot, quel que soit le nombre d'employés. Fonctions RLS en `STABLE` pour être mises en cache par Postgres. Limite : jusqu'à ~300 employés par entreprise côté navigateur sans souci ; au-delà, déplacer le calcul dans une Edge Function (même moteur TS).

---

## Prompt 2 — Base de données
| Table | Contenu | Relations |
|---|---|---|
| `profils` | nom, téléphone | 1-1 `auth.users` |
| `entreprises` | identité légale, taux AT, IPM, périodicité, **plan / essai / fin d'abonnement** | |
| `membres` | rôle d'un utilisateur dans une entreprise | N-N users ↔ entreprises |
| `employes` | contrat, salaire, situation familiale, cadre, n° IPRES/CSS | N-1 entreprise |
| `rubriques` | primes, indemnités, retenues (cotisable ? imposable ? plafond d'exonération) | N-1 entreprise |
| `elements_fixes` | primes récurrentes par employé | employé × rubrique |
| `periodes_paie` | mois de paie (brouillon → validée → clôturée) | N-1 entreprise |
| `elements_variables` | heures sup, absences, avances du mois | période × employé × rubrique |
| `bulletins` | montants figés + détail JSON | unique (période, employé) |
| `prestataires`, `paiements_tiers` | base du BRS (retenue calculée par la base) | |
| `declarations` | VRS / BRS / IPRES / CSS, statut, échéance, référence de paiement | unique par période |
| `parametres_legaux` | taux, plafonds, barèmes, versionnés par `date_effet` | |
| `licences` | clés SENP-XXXX-XXXX-XXXX | |
| `journal_audit` | traçabilité (création, activation…) | |

Sécurité testée sur un vrai Postgres : un utilisateur ne voit jamais les données d'une autre entreprise ; impossible de modifier soi-même sa date d'abonnement ; limite d'employés appliquée ; clé de licence utilisable une seule fois (message neutre, pas d'énumération) ; bulletins d'une période clôturée non modifiables ; écriture bloquée (lecture conservée) quand l'abonnement est expiré.

## Prompt 3 — Authentification
Supabase Auth (choix retenu) : mots de passe hachés (bcrypt) par Supabase, jamais stockés en clair ; jetons JWT rafraîchis automatiquement ; confirmation d'e-mail ; réinitialisation par lien. Côté app : mot de passe 8+ caractères avec lettres et chiffres, verrouillage progressif après 5 échecs, messages sans jargon, pas de révélation de l'existence d'un compte sur « mot de passe oublié ».

## Prompt 4 — Fonctionnalité principale : la paie
Calcul pour chaque employé (`src/paie/moteur.ts`) :
1. **Brut** = salaire de base + sursalaire + primes − absences. Les indemnités exonérées (ex. transport) sont exclues des bases jusqu'à leur plafond ; le surplus est réintégré automatiquement avec une alerte.
2. **IPRES** régime général 5,6 % / 8,4 % plafonné à 432 000 ; **cadres** 2,4 % / 3,6 % plafonné à 1 296 000.
3. **CSS** prestations familiales 7 % et accident du travail (taux de l'entreprise) sur 63 000 max. **IPM** optionnelle.
4. **IR** : (brut imposable − retraite salariale) × 12, abattement 30 % plafonné à 900 000/an, barème art. 173, **réduction pour charges de famille** selon le nombre de parts (encadrée par minimum et maximum), puis ÷ 12.
5. **TRIMF** selon la tranche de revenu annuel × parts TRIMF. **CFCE** 3 % à la charge de l'employeur.
6. Avances et prêts retenus sur le net.

Déclarations : VRS (IR + TRIMF + CFCE), BRS (retenues sur prestataires, 5 % par défaut, modifiable), IPRES (RG + RCC), CSS (PF + AT) en mensuel ou trimestriel, avec échéance au 15 du mois suivant, export Excel (CSV `;`), impression et suivi « déposée / payée ».

## Prompt 5 — Paiement
Même modèle que SenEcole / DiagFin : **clés de licence vendues sur ta boutique Chariow** (Wave / Orange Money), activées par le client dans la page **Abonnement**. Pas de données bancaires chez toi. La durée s'ajoute à la date de fin en cours. Essai gratuit 30 jours (5 employés).

| Formule | Employés | Prix indicatif |
|---|---|---|
| Starter | 10 | 9 900 FCFA/mois · 99 000/an |
| Pro | 50 | 24 900 FCFA/mois · 249 000/an |
| Entreprise / Cabinet | 300 | 49 900 FCFA/mois · 499 000/an |

Prix modifiables dans `src/pages/Abonnement.tsx`. Côté admin : **Administration → Générer un lot de clés** télécharge un fichier `.txt` à importer dans le stock Chariow.

## Prompt 6 — Erreurs et états vides
- `ErrorBoundary` global : jamais d'écran blanc.
- Bandeau rouge en cas de perte de connexion ; bandeaux d'expiration d'essai/abonnement.
- `messageErreur()` traduit toutes les erreurs (réseau, doublon, droits, session expirée…) en français simple.
- États vides avec bouton d'action sur chaque liste (employés, paie, déclarations, prestataires, historique).
- Notifications avec **sonner** (déjà intégré).

## Prompt 7 — Déploiement (gratuit pour démarrer)
1. **Supabase** → New project « senpaie » (région la plus proche : Europe West). Si tu es à la limite de projets gratuits, mets en pause un projet inutilisé.
2. **SQL Editor** → exécute dans l'ordre `0001_schema.sql`, `0002_fonctions_rls.sql`, `0003_parametres_2026.sql`.
3. **Authentication → URL Configuration** : Site URL = `https://senpaie.netlify.app` ; Redirect URLs = `https://senpaie.netlify.app/**` et `http://localhost:5173/**`.
4. **Authentication → Providers → Email** : laisse « Confirm email » activé. (Optionnel : activer le CAPTCHA hCaptcha dans Auth → Attack Protection.)
5. **Settings → API** : copie `Project URL` et la clé `anon public` (jamais la `service_role`).
6. **Netlify** → Add new site → Import (GitHub) ou glisser-déposer le dossier après `npm run build`. Variables d'environnement :
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LIEN_ACHAT_LICENCE` (lien Chariow), `VITE_WHATSAPP_SUPPORT` (ex. `221779062790`). Build : `npm run build`, dossier `dist` (déjà dans `netlify.toml`).
7. Inscris-toi sur l'app, puis exécute `supabase/creer_admin.sql` avec ton e-mail → le menu **Administration** apparaît.
8. Test réel : créer une entreprise, 2 employés (un cadre), ouvrir le mois, calculer, imprimer un bulletin, préparer VRS/IPRES/CSS, saisir un paiement prestataire et préparer le BRS.

En local : `npm install`, copier `.env.example` en `.env.local`, `npm run dev`. Tests : `npm test`.

---

## ⚠️ Paramètres à faire valider avant la commercialisation
Les taux sont stockés dans `parametres_legaux` et modifiables sans toucher au code (nouvelle ligne avec nouvelle `date_effet`). Points à confirmer avec le CGI en vigueur / la DGID / l'IPRES / la CSS :
- règle de calcul du **nombre de parts** (modifiable aussi par employé via « Forcer le nombre de parts ») ;
- **taux de la tranche supérieure de l'IR** (40 % dans le barème intégré ; certaines sources mentionnent 43 %) ;
- **plafond CSS accidents du travail** (63 000 retenu) et effets éventuels du nouveau **Code de la sécurité sociale 2026** ;
- plafond d'exonération de l'**indemnité de transport** (26 000 par défaut, modifiable dans les rubriques) ;
- taux **BRS** selon la nature du paiement (5 % par défaut).

SenPaie prépare les déclarations ; le dépôt et le paiement se font sur eTax et sur les portails IPRES / CSS.

---

## Mise à jour — Conventions collectives et barème DGID

- **Conventions collectives** (`0004_conventions_collectives.sql`) : 23 conventions et 667 catégories, avec leur salaire catégoriel minimum (base 173,33 h), issues des « Nouveaux barèmes des salaires catégoriels dans le secteur privé à partir du 1er janvier 2020 ». Contrôle : salaire 2009 × (1 + taux) = salaire 2020 pour toutes les lignes, sauf les 36 marquées « corrigé » par la commission (repérées dans l'app). Taux horaires × 173,33 ; boulangerie non industrielle : taux journalier × 26.
- **Méthode IR DGID** (`0005_methode_ir_dgid.sql`) : net mensuel = brut imposable − min(30 % ; 75 000), arrondi au millier inférieur, × 12 → barème art. 173 → réduction pour charges de famille → ÷ 12. Reproduit exactement le barème mensuel DGID (testé sur 713 lignes × 9 parts, 0 écart). Les cotisations IPRES ne sont pas déduites.
- **Parts** : annexe 1 du Guide fiscal des PME (célibataire/divorcé 1 ; marié 1,5 ; veuf avec enfant 1,5 ; + 0,5 par enfant ; 5 maximum).
- **TRIMF** : tranches du Guide fiscal des PME et du barème annuel DGID (le seuil ouvre la tranche suivante). Attention : le barème *mensuel* DGID fourni affiche 500 F/mois au-delà de 2 000 000 F/an et 1 500 F au-delà de 12 000 000 F, alors que le guide et le barème annuel donnent 12 000 F/an (1 000 F/mois) puis 18 000 et 36 000 F/an. SenPaie applique le guide (tarif modifiable dans `parametres_legaux`).
- **Nouvelle page « Barèmes & simulateur »** : simulateur brut → parts, IR, TRIMF ; barème mensuel exportable ; consultation des conventions. Fiche employé : choix convention → catégorie, pré-remplissage du salaire et alerte sous le minimum.
