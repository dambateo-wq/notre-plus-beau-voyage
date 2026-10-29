# Bilan hebdomadaire autonome — proposition à valider

Branche : `feat/weekly-wedding-digest`. Aucun déploiement, envoi réel, planification distante ou migration de production n'a été effectué.

`vercel.json` désactive les déploiements automatiques pour cette branche seulement. Le maintien Supabase et le comportement de `main` ne changent pas. Pour une Preview, obtenir l'accord avant de retirer cette protection sur la branche.

## Audit du 28 octobre 2026

- Source de départ : `24df0fc0bfa071f3ad54ea93ab3d6805cc77f1a3`.
- Vercel : équipe Hobby, cron existant de maintien Supabase à `0 9 * * *`. Hobby peut déclencher dans toute l'heure prévue ; il ne répond pas au besoin de 18 h. Ce cron existant reste inchangé.
- `lib/email.ts` contient déjà `sendWeddingEmail()`, `emailFrame()`, `escapeHtml()`, Nodemailer et le transport Gmail via `SMTP_USER`/`SMTP_PASS`. Ce fichier et les e-mails de confirmation restent inchangés. Aucun autre expéditeur/service d'e-mail ni SDK d'envoi n'est ajouté.
- Administration : `https://les-dadjus-notre-plus-beau-voyage.vercel.app/admin`, protégée par `wedding_admin_session` et `ADMIN_PASSWORD`. Le bouton du bilan contient uniquement cette URL, aucun token ou secret.
- Schéma réel contrôlé en lecture seule : `wedding_responses`, `lodging_reservations`, `lodging_guest_assignments`, `lodging_assignments`, `lodging_change_requests`, `wedding_email_history`.
- Référence réelle, sans noms ni coordonnées : 6 formulaires / 14 personnes présentes, 5 réservations actives, 5 statuts `unpaid`, aucun placement individuel ou historique. Ces statuts ne prouvent pas à eux seuls le montant effectivement encaissé.

### Informations manquantes et évolution proposée

Les réservations n'avaient aucun champ de montant encaissé ; les affectations individuelles ne comportaient pas de nuit. Les états `unpaid`, `declared` et `confirmed` ne permettent pas de reconstruire des paiements partiels ni un historique financier après modification. L'ancien historique d'e-mails ne fournit pas de verrou ni d'état SMTP incertain.

La migration **proposée, non appliquée** ajoute :

1. `lodging_reservations.received_amount_cents` : `NULL` pour les réservations historiques (inconnu, jamais déduit d'un moyen de paiement), défaut 0 seulement pour les nouvelles réservations. L'initialisation des réservations historiques reste une opération distincte, après accord de mise en service ; une absence d'encaissement confirmée par l'organisateur permet de saisir 0, sans le déduire des statuts.
2. `lodging_guest_assignments.assigned_nights` : `NULL` conserve l'affectation historique pour toutes les nuits de la réservation ; un tableau explicite permet une affectation limitée au vendredi ou au samedi.
3. Un journal privé des campagnes, des deux destinataires et des événements. RLS activée, aucun accès `anon` ou `authenticated`, fonctions `SECURITY INVOKER` et droits explicites `service_role`.

Une page privée `/admin/bilan-hebdomadaire` permet la vérification des encaissements et des nuits couvertes. Ces formulaires modifient les données **uniquement sur action explicite d'un administrateur**, après déploiement approuvé. Le bilan lui-même ne modifie aucune inscription, affectation ou réservation. Le bouton de confirmation complète d'un paiement enregistre désormais le montant confirmé ; les montants encaissés sont conservés lors des modifications de réservation. La réconciliation des voyageurs conserve les nuits explicites.

Les contrôles du plan de chambres existant continuent à réserver une chambre de façon conservatrice sur toutes les nuits demandées. La page du bilan permet de préciser la couverture réelle pour le bilan ; elle ne remplace pas un futur plan de chambres permettant des changements de chambre nuit par nuit.

## Architecture proposée

QStash déclenche la route Vercel `POST /api/cron/weekly-digest` avec `CRON_TZ=Europe/Paris 0 18 * * 0`. Il ne transporte aucune donnée d'invité : seulement `{}` et un secret d'exécution. Supabase fournit un snapshot cohérent côté serveur ; l'application calcule et met en forme le bilan ; le Gmail existant envoie séparément le même contenu aux deux adresses fixes.

- QStash Free : 1 000 messages par jour et 10 planifications au moment de l'audit, largement au-dessus de cet usage. Les reprises comptent comme livraisons. Pas de nouvel abonnement d'e-mail, pas d'IA. Un compte QStash reste à créer/configurer avec accord de l'utilisateur.
- Le déclenchement est réglé à 18 h locale avec gestion été/hiver, pas à une heure UTC fixe. Aucun hébergeur gratuit ni SMTP/Gmail ne garantit une arrivée en boîte à la seconde exacte. Une panne peut retarder ou empêcher l'envoi ; cette limite ne doit pas être présentée comme une garantie de temps réel.
- Trois reprises QStash espacées d'une minute. En cas d'échec persistant, consulter sa DLQ (rétention gratuite limitée) et le journal Supabase. Le cron de maintien existant empêche normalement la pause pour inactivité ; contrôler ce maintien et les quotas avant activation.

Références :

- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://upstash.com/docs/qstash/features/schedules
- https://upstash.com/docs/qstash/features/retry
- https://upstash.com/pricing/qstash

## Calculs et sécurité

- Période : `[dimanche précédent 18 h Paris, dimanche courant 18 h Paris)`, sur `created_at` uniquement. Une modification n'est pas un nouveau formulaire. Une réponse d'absence est listée mais ne crée aucune personne présente.
- Les accompagnants et homonymes comptent comme personnes distinctes. Les totaux personnes/formulaires sont séparés.
- Chaque personne est contrôlée pour chaque nuit réservée. Les anciens placements de groupe partiels non nominatifs bloquent le bilan au lieu d'inventer une liste de noms.
- Tarif de référence réutilisé : `LODGING_PRICE_CENTS = 3500`. Les montants enregistrés restent prioritaires ; une anomalie de tarif apparaît en avertissement. Un changement financier en attente est distingué du montant actuellement validé.
- Solde : `max(0, amount_cents - received_amount_cents)`. Un encaissé inconnu rend le total inconnu et bloque tout envoi, y compris le test. Choisir Wero/virement ne rend jamais une réservation payée.
- Le snapshot omet les coordonnées, les tokens, la géolocalisation et les informations alimentaires. Les noms restent uniquement dans Supabase et les e-mails adressés à Damien et Julie, pas dans les logs de serveur ou chez le planificateur.
- En cas d'erreur Supabase, aucun e-mail ni zéro de substitution. Les contenus sont échappés dans le HTML. Les réponses privées sont `no-store`.
- Aperçu protégé par la session admin ou un secret de test ; pas de clé dans l'URL. Les tests ne peuvent pas choisir d'autres destinataires. Protection d'origine sur le POST à session admin.

## Doublons et limite fondamentale de Gmail SMTP

Une clé unique par dimanche, un verrou transactionnel et des états par destinataire empêchent les déclenchements concurrents de renvoyer la campagne. Le HTML/texte est figé avant le premier envoi : une reprise n'envoie pas un autre bilan au deuxième destinataire. Une adresse déjà marquée envoyée est ignorée.

Il n'existe pas de transaction atomique entre SMTP Gmail et Postgres. Après une coupure ambiguë (envoi accepté mais accusé perdu, arrêt de Vercel avant journalisation), l'état devient `uncertain` et les reprises automatiques s'arrêtent. Cela privilégie l'absence de doublon, avec une intervention exceptionnelle nécessaire pour vérifier les messages envoyés dans Gmail. Ne jamais promettre « exactement une fois » ou une autonomie absolue face à cette panne.

Les rejets certains avant livraison (`EAUTH`, `EENVELOPE`) et les erreurs avant SMTP peuvent reprendre. Un SMTP trop long ou une panne de journalisation après envoi reste incertain. Ne pas remettre un destinataire incertain en attente sans contrôle manuel dans Gmail et accord explicite.

## Variables serveur

Existantes, à conserver : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_PASSWORD`. Aucun secret `NEXT_PUBLIC_`.

Nouvelles :

| Variable | Usage |
| --- | --- |
| `WEEKLY_DIGEST_ENABLED` | `false` par défaut ; `true` uniquement en production après validation |
| `WEEKLY_DIGEST_CRON_SECRET` | secret aléatoire d'au moins 32 caractères, distinct du maintien Supabase |
| `WEEKLY_DIGEST_TEST_ENABLED` | `false` par défaut ; autorise les tests aux deux adresses fixes |
| `WEEKLY_DIGEST_TEST_SECRET` | secret distinct d'au moins 32 caractères pour le CLI manuel |
| `WEEKLY_DIGEST_DAMIEN_EMAIL` | l'adresse Gmail de Damien donnée dans la demande, exclusivement côté serveur |
| `WEEKLY_DIGEST_JULIE_EMAIL` | l'adresse Gmail de Julie donnée dans la demande, exclusivement côté serveur |
| `QSTASH_TOKEN` | uniquement dans l'environnement exécutant le script de configuration ; inutile dans Vercel à l'exécution |
| `WEDDING_SITE_URL` | CLI : origine officielle ci-dessus ; adresse locale autorisée hors production |
| `WEEKLY_DIGEST_PERIOD_END` | CLI facultatif : dimanche 18 h Paris au format ISO pour un aperçu/test ciblé |

Ne pas placer les secrets dans les arguments de commandes ou les fichiers suivis. Ne pas les imprimer. `VERCEL_ENV=preview` bloque toujours l'envoi planifié, même si des variables ont été héritées.

Les deux adresses privées ne sont pas publiées en clair dans le dépôt GitHub public. Seul le serveur les lit depuis les variables ci-dessus ; le journal utilise les identifiants fixes `damien` et `julie`. Ni le corps du test ni l'appel planifié ne peuvent fournir d'autres destinataires.

## Validation avant mise en service (accord requis)

1. Relire la branche, la migration et les formulaires ajoutés ; obtenir l'accord avant migration, fusion et production.
2. Appliquer **seulement** la nouvelle migration sur la base existante après sauvegarde approuvée. Ne pas lancer tout le dossier historique : il ne contient pas un historique CLI complet.
3. Déployer les fichiers de la même branche avec les deux flags d'envoi à `false`. L'action de confirmation de paiement utilise le nouveau champ : migration et code doivent être activés dans cet ordre.
4. Initialiser les encaissements historiques à partir des informations confirmées par l'organisateur. Une confirmation explicite d'absence de paiement autorise une valeur de 0 pour les réservations concernées, une fois les modifications de production approuvées. Vérifier qu'aucun paiement n'est intervenu entre cette confirmation et l'initialisation ; ne jamais déduire 0 du statut ou du moyen de paiement, ni écraser un montant déjà renseigné. Pour les autres réservations, vérifier le montant réellement reçu.
5. Ouvrir `/admin/bilan-hebdomadaire`, contrôler l'aperçu et les listes nominatives avec les données réelles. Valider sur ordinateur et téléphone. Aucun envoi pendant cet aperçu.
6. Autoriser temporairement `WEEKLY_DIGEST_TEST_ENABLED=true`, envoyer un test aux deux adresses et vérifier personnellement le rendu dans Gmail. Rejouer **la même référence de test** : aucun deuxième envoi. Modifier la référence seulement pour un nouveau test volontaire.
7. Consulter le journal pour les deux statuts `sent`. Désactiver les tests si désiré, activer le flag de production, puis créer la planification avec accord.

Commandes (depuis `mariage/`, secrets déjà présents dans l'environnement) :

```bash
node tests/weekly-digest.mjs
node tests/weekly-digest-sql.mjs
npm run build
node tests/weekly-digest-http.mjs
node scripts/weekly-digest.mjs schedule-plan
node scripts/weekly-digest.mjs preview /tmp/bilan-prive.html
node scripts/weekly-digest.mjs test controle-gmail-2026-11-01
# À exécuter uniquement après accord et configuration des variables :
node scripts/weekly-digest.mjs schedule-apply --approved
```

L'aperçu local peut contenir des noms : garder ce fichier privé, ne pas le committer ni le publier. Le script ne lit pas les clés SMTP ou Supabase.

## Tests automatisés et vérifications

Calculs des personnes/formulaires, bornes de création, absences, homonymes, nuits partielles, encaissements partiels/inconnus, modifications financières, erreurs de lecture, échappement HTML, liens d'administration, refus des appels non autorisés, flags de sécurité, semaines été/hiver de 167/169 h, journal et reprise par destinataire. PostgreSQL local isolé pour la migration et les droits ; aucune donnée de production n'est créée ou modifiée par ces tests.

Validés localement le 28 octobre 2026 : tests unitaires, migration/journal dans PostgreSQL isolé, compilation Next.js de production, contrôle TypeScript, lint des nouveaux modules et tests HTTP des routes compilées. Aucune connexion SMTP réelle n'est utilisée par ces tests. Les confirmations existantes dans `lib/email.ts` sont contrôlées comme inchangées.

Les tests de réception/rendu dans les deux boîtes Gmail, l'aperçu nominatif en production et l'activation du dimanche restent à effectuer après accord. La présentation HTML utilise le cadre existant, des styles en ligne et un bouton d'administration placé dès le résumé et en fin de message. Le navigateur de travail n'a pas autorisé l'ouverture du fichier HTML local ; aucune validation visuelle Gmail ou téléphone n'est donc revendiquée.

## Consulter les résultats et reprendre après une panne

Requêtes **en lecture seule** dans l'éditeur SQL privé Supabase :

```sql
select key, period_start, period_end, mode, status, attempts, error_code, updated_at
from public.wedding_digest_runs order by created_at desc limit 20;

select run_key, recipient, status, attempts, started_at, completed_at, error_code
from public.wedding_digest_deliveries order by started_at desc nulls last limit 40;

select run_key, event, created_at
from public.wedding_digest_events order by created_at desc limit 100;
```

Une campagne `sent` et ses deux destinataires `sent` confirment l'acceptation SMTP et l'enregistrement du résultat, pas la lecture ni l'absence de filtrage dans Gmail. Un échec certain avant envoi peut être repris avec la même référence de test ou par QStash pendant la fenêtre autorisée ; le contenu et les destinataires déjà envoyés sont conservés. Après expiration des reprises, examiner la DLQ et le code d'erreur avant une reprise volontaire. Le déclenchement planifié refuse un bilan de plus de 24 h ; utiliser le test privé avec une période explicite pour un rattrapage décidé manuellement.

Pour un statut `uncertain`, vérifier d'abord les messages envoyés dans Gmail. Ne pas effacer les marqueurs ni changer de référence afin de forcer une reprise. Une remise en état ou un envoi de rattrapage nécessite une décision explicite sur les destinataires encore à contacter. Le programme ne masque pas cette ambiguïté par un double envoi.

## Fichiers de la proposition

Chemins ci-dessous relatifs à `mariage/`.

| Fichiers créés | Rôle |
| --- | --- |
| `lib/weekly-digest/time.ts`, `model.ts`, `render.ts`, `server.ts` | Périodes Paris, calculs, modèle Gmail et exécution sécurisée |
| `app/api/cron/weekly-digest/route.ts` | Déclenchement autonome authentifié |
| `app/api/admin/weekly-digest/route.ts` | Aperçu privé et test manuel |
| `app/admin/bilan-hebdomadaire/page.tsx`, `actions.ts` | Aperçu, test et vérification explicite des informations manquantes |
| `supabase/migrations/20261028215411_weekly_wedding_digest.sql` | Proposition de champs et journal privé ; non appliquée |
| `scripts/weekly-digest.mjs` | Plan de configuration, aperçu et test depuis le terminal |
| `tests/weekly-digest-loader.mjs`, `weekly-digest.mjs`, `weekly-digest-sql.mjs`, `weekly-digest-http.mjs` | Vérifications isolées et routes compilées |
| `WEEKLY_DIGEST.md` | Audit, variables, limites et procédure de mise en service |

| Fichiers modifiés | Rôle |
| --- | --- |
| `app/admin/page.tsx` | Lien privé vers le bilan |
| `app/admin/actions.ts` | Enregistrement de l'encaissement lors d'une confirmation complète, sans réduire un trop-perçu déjà enregistré |
| `lib/lodging.ts`, `lib/lodging-placement.ts`, `lib/registration.ts` | Nouveaux champs typés et conservation des nuits lors d'un changement de voyageurs |
| `package.json`, `package-lock.json` | PostgreSQL local de test uniquement (`@electric-sql/pglite`, dépendance de développement) |
| `vercel.json` | Aucun déploiement automatique sur cette branche ; maintien existant conservé |
| `.gitignore` | Cache CLI Supabase ignoré |

Après validation des données, déploiement approuvé, configuration des secrets et activation de la planification, l'exécution normale dépend uniquement de QStash, Vercel, Supabase et du Gmail déjà configuré. Aucune session utilisateur, visite du site, IA ou ouverture de ChatGPT n'est nécessaire. Les comptes, quotas et secrets doivent rester valides ; les pannes SMTP ambiguës conservent la limite décrite ci-dessus.
