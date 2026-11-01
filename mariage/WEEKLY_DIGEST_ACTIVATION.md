# Mise en service du bilan hebdomadaire — 1er novembre 2026

## État actuel

**La planification Supabase Cron est active dans le projet mariage existant `ihlhksysyqgbiehwpvac`. Premier envoi programmé : dimanche 8 novembre 2026 à 18 h, heure de Paris (`17:00 UTC`).** Le Gmail, le modèle du bilan et ses deux destinataires sont conservés. Aucun compte Upstash, nouvelle base, nouveau service d'envoi ou abonnement payant n'a été créé.

La réception et la présentation du test ont été validées par l'organisateur. Le statut serveur `sent` signifie acceptation SMTP et journalisation ; aucune inspection indépendante des deux boîtes Gmail ou de leur affichage sur téléphone n'est revendiquée.

## Audit et cause de l'absence d'envoi le 1er novembre

- Le bilan est déjà fusionné dans `main`. L'ancienne branche `feat/weekly-wedding-digest` n'a pas à être redéployée séparément.
- Le code de production contrôlé est `d0b7e4c06955f5b2ead208cd62587ffc3ad65134`, avec les corrections d'administration et de placement.
- La migration `weekly_wedding_digest` figure dans Supabase sous `20261029060448`. Les trois tables privées et les deux fonctions de snapshot/journal sont présentes. Aucun SQL n'a été rejoué.
- Avant activation, les six variables `WEEKLY_DIGEST_*` étaient absentes en production et le journal ne comportait aucune exécution. Les montants encaissés sont désormais renseignés dans les données existantes ; aucune nouvelle initialisation n'a été nécessaire.
- `mariage/vercel.json` ne contient que le maintien Supabase (`0 9 * * *`). Ce cron n'a pas été modifié. Le déclenchement du bilan est confié à Supabase Cron.
- Le projet utilise Vercel Hobby. Ses crons peuvent s'exécuter dans toute l'heure prévue et ne répondent pas au besoin d'un déclenchement à 18 h. Supabase Cron réutilise le compte et le projet actuels ; l'option QStash initialement prévue a été abandonnée avant création d'une planification.

## Configuration effectuée

Les variables ci-dessous sont maintenant présentes uniquement dans l'environnement **Production**, de type sensible. Aucune valeur secrète ni adresse de destinataire n'est publiée dans ce document.

| Variable | État / rôle |
| --- | --- |
| `WEEKLY_DIGEST_ENABLED` | `true` ; autorise la route serveur de production |
| `WEEKLY_DIGEST_CRON_SECRET` | Nouveau secret aléatoire dédié ; distinct du `CRON_SECRET` du maintien |
| `WEEKLY_DIGEST_TEST_ENABLED` | `true` ; permet le test manuel authentifié aux deux destinataires fixes |
| `WEEKLY_DIGEST_TEST_SECRET` | Nouveau secret aléatoire distinct pour l'aperçu/test par CLI |
| `WEEKLY_DIGEST_DAMIEN_EMAIL` | Adresse de Damien fournie dans la mission |
| `WEEKLY_DIGEST_JULIE_EMAIL` | Adresse de Julie fournie dans la mission |

Les deux secrets dédiés ont été générés côté base, stockés chiffrés dans Supabase Vault et synchronisés avec Vercel, sans valeur littérale dans une migration ni affichage dans les logs. Ils comportent chacun 64 caractères. Noms Vault : `wedding_weekly_digest_cron_secret` et `wedding_weekly_digest_test_secret`. Le premier sert au déclenchement ; le second a permis le contrôle de bout en bout sans renvoi du mail déjà reçu. `SMTP_USER`, `SMTP_PASS`, les clés/adresse Supabase et `ADMIN_PASSWORD` ont été conservés. `lib/email.ts` et `sendWeddingEmail()` n'ont pas été modifiés.

Le même commit existant a été redéployé pour charger ces variables :

- Déploiement Vercel final : `dpl_5NAA3CN6yR8GMSnSf2LxT7ejoxtN`, état `READY`, même commit applicatif `d0b7e4c06955f5b2ead208cd62587ffc3ad65134`.
- Site de production : https://les-dadjus-notre-plus-beau-voyage.vercel.app
- Administration : https://les-dadjus-notre-plus-beau-voyage.vercel.app/admin
- Aperçu et test privés : https://les-dadjus-notre-plus-beau-voyage.vercel.app/admin/bilan-hebdomadaire

Le redéploiement charge les secrets dédiés sans changer le code applicatif déjà en production. La branche `chore/activate-weekly-digest` ajoute la migration du planificateur, son test isolé et la mise à jour du script/documentation. Ses déploiements automatiques sont désactivés ; le lien GitHub/Vercel reste en place. Aucune fusion de cette branche n'est nécessaire au déclenchement déjà actif en base.

## Vérifications effectuées

1. L'API privée sans authentification répond `401` avec `Cache-Control: private, no-store`.
2. L'aperçu authentifié a été généré sur les données réelles, sans envoi, pour `[25/10/2026 18 h, 01/11/2026 18 h)` à Paris.
3. Les nombres de formulaires/personnes et le solde des réservations de cet aperçu concordent avec une requête Supabase indépendante. Aucun montant encaissé n'est inconnu et aucun avertissement n'a été relevé. Les données nominatives et chiffres privés ne sont pas publiés dans GitHub.
4. Les liens HTML du bouton pointent bien vers l'URL canonique `/admin`, sans secret ni contournement de l'authentification.
5. Test réel avec la référence stable `activation-20261101-gmail` et la période se terminant à `2026-11-01T17:00:00.000Z` : réponse `200`, statut `sent`, **2 envois**. Le journal contient une campagne et deux livraisons `sent`, avec une seule tentative SMTP par destinataire, sans erreur. Envois acceptés vers 19 h 21, heure de Paris.
6. Relance avec la même référence et la même période : réponse `200`, statut `sent`, **0 nouvel envoi**.
7. Les empreintes des lignes d'inscriptions, de réservations (paiements compris) et d'attributions sont identiques avant et après le test. Seules les tables de journalisation du bilan ont reçu l'exécution et ses résultats.
8. Les tests existants `tests/weekly-digest.mjs` et `tests/weekly-digest-sql.mjs` ont été exécutés avec succès pendant l'audit : semaines de changement d'heure de 167/169 h, calculs, erreurs Supabase, journal, verrouillage et doublons. Ils n'utilisent pas le SMTP de production. Le redéploiement Vercel a compilé le même code avec succès. Aucun code TypeScript/TSX n'a été modifié pendant cette activation.
9. Le nouveau test `tests/weekly-digest-supabase-cron.mjs` passe : logique SQL réelle dans PostgreSQL isolé, calendrier Paris (y compris les 28 mars et 31 octobre 2027), bornes horaires, dérive d'horloge, reprises limitées, expiration du verrou, résultats réseau invalides, `sent`/`uncertain`/`disabled`, permissions et conservation des données. Les interfaces des extensions et l'horloge sont simulées uniquement dans ce test.
10. Vérification des vraies extensions en production : `pg_cron 1.6.4`, `pg_net 0.20.4`, Vault existant `0.3.1`. Les schémas `wedding_digest_scheduler`, `net` et `vault` sont refusés par l'API publique (`406/PGRST106`). Les rôles `anon`, `authenticated` et `service_role` n'ont ni accès au schéma du planificateur ni droit d'exécuter sa fonction.
11. Une tâche de contrôle ponctuelle a été exécutée par le vrai worker Cron le 1er novembre à `19:00 UTC`. Elle a appelé l'API privée de test via `pg_net` et le secret Vault : HTTP `200`, statut `sent`, **0 nouvel envoi**. Les deux livraisons initiales restent à une seule tentative SMTP chacune. La tâche de contrôle s'est retirée automatiquement ; seule la tâche hebdomadaire reste enregistrée.
12. Après activation : tâche hebdomadaire `active=true`, contrôle hors créneau `not_due`, prochaine échéance Paris calculée en SQL au 8 novembre 18 h. Les empreintes des inscriptions, réservations/paiements, attributions individuelles et anciennes attributions de groupe sont conservées ; les définitions des fonctions de snapshot et du journal applicatif sont inchangées.
13. Contrôles réussis : TypeScript (`tsc --noEmit`), ESLint des fichiers JS modifiés, compilation locale Next.js de production et compilation du redéploiement Vercel. Le maintien Supabase reste `0 9 * * *`.

## Planification Supabase Cron active

La migration `supabase/migrations/20261101184623_weekly_digest_supabase_cron.sql` a été appliquée une seule fois ; version réelle dans l'historique Supabase : `20261101185056`, nom `weekly_digest_supabase_cron`. Les migrations historiques et les données d'invités n'ont pas été rejouées. La tâche a été créée inactive, puis activée après vérification du transport, du déploiement et des secrets.

| Paramètre | Valeur |
| --- | --- |
| Identifiant stable | `notre-plus-beau-voyage-weekly-digest` |
| Expression Cron | `0-12 16-17 * * 0`, fuseau du moteur GMT inchangé |
| Calendrier | `due_period()` convertit chaque instant en `Europe/Paris` ; seul dimanche 18 h autorise un appel |
| Destination | `https://les-dadjus-notre-plus-beau-voyage.vercel.app/api/cron/weekly-digest` |
| Méthode / corps | `POST` / `{}` |
| Authentification transmise | En-tête `Authorization: Bearer …` utilisant le secret dédié, jamais une URL |
| Reprises | Au maximum 4 appels HTTP (premier + 3 reprises), espacés d'au moins 60 secondes, entre 18 h et 18 h 10 |
| Délai HTTP | 55 secondes |
| État | Actif ; aucun compte de planification externe |

Le moteur vérifie les deux heures UTC possibles ; une seule correspond à 18 h Paris. Les minutes 11/12 enregistrent les derniers résultats HTTP sans déclencher d'envoi. Cela représente 26 courts contrôles SQL par semaine et, en fonctionnement normal, un seul POST. Un arrêt de la base ou une panne de transport peut retarder/empêcher l'envoi ; aucune garantie d'arrivée dans Gmail à la seconde exacte n'est annoncée.

La table privée `wedding_digest_scheduler.dispatches` conserve seulement les identifiants de requête, heures, statuts HTTP/API et codes d'erreur génériques. Elle ne conserve ni corps d'e-mail, noms, en-têtes ou secrets. Les résultats HTTP éphémères de `pg_net` sont réconciliés dans ce journal ; le journal existant du bilan reste la référence pour les deux envois SMTP. Aucun paiement, placement ou inscription n'est écrit par le planificateur.

Le script local affiche désormais ce plan sans modification distante :

```sh
node scripts/weekly-digest.mjs schedule-plan
```

L'ancienne commande `schedule-apply` refuse toute opération distante : il n'existe plus de chemin qui crée accidentellement un second planificateur QStash. Aucun `QSTASH_TOKEN` n'est requis.

Pour suspendre ou réactiver la tâche sans supprimer les données, utiliser l'interface Supabase Cron ou la commande privée suivante (`false` pour suspendre, `true` pour réactiver) :

```sql
select cron.alter_job(
  (select jobid from cron.job where jobname='notre-plus-beau-voyage-weekly-digest'),
  active := false
);
```

Ne pas désactiver/désinstaller les extensions pour suspendre la tâche. Conserver les schémas internes `net`, `vault` et `wedding_digest_scheduler` hors des schémas exposés à la Data API. Les réponses réseau ne contiennent que les résultats du déclencheur ; aucune réponse d'aperçu nominatif n'est appelée par le cron hebdomadaire.

## Test manuel et exploitation

L'administrateur peut ouvrir la page privée du bilan pour voir l'aperçu, puis déclencher volontairement un test. Ne pas utiliser les formulaires d'encaissement ou d'attribution pour tester l'envoi : ils modifient les données métier.

Pour reproduire le contrôle d'absence de doublon déjà effectué, charger le secret de test dans un environnement privé et reprendre **la même période et la même référence** :

```sh
WEEKLY_DIGEST_PERIOD_END=2026-11-01T17:00:00.000Z node scripts/weekly-digest.mjs test activation-20261101-gmail
```

Ce contrôle doit renvoyer `sent: 0`. Une autre référence constitue un nouveau test volontaire et peut envoyer deux nouveaux messages. Les tests peuvent être désactivés après validation en passant `WEEKLY_DIGEST_TEST_ENABLED=false` dans Vercel puis en redéployant ; l'aperçu privé et l'envoi planifié restent disponibles.

Les erreurs de lecture ou montants encaissés inconnus bloquent l'envoi plutôt que de produire des zéros trompeurs. En cas d'échec, consulter les journaux de campagne, de transport et de Cron décrits dans `WEEKLY_DIGEST.md`. Après quatre appels ou la fenêtre de dix minutes, une panne persistante nécessite une reprise décidée manuellement. Un résultat SMTP ambigu devient `uncertain` et bloque les renvois automatiques ; contrôler les messages envoyés dans Gmail avant toute reprise manuelle. Ne pas remettre une livraison incertaine en attente sans vérification et accord explicite.

Les envois ordinaires dépendent désormais seulement de Supabase, Vercel et du Gmail existant. Aucune visite du site, session utilisateur, IA ou ouverture de ChatGPT n'est nécessaire. Aucun abonnement payant n'a été souscrit. Les comptes, quotas et secrets doivent rester valides ; une panne ambiguë peut nécessiter une intervention exceptionnelle. Le cron quotidien de maintien Supabase reste présent.

## Contrôle des avertissements Supabase

Les deux avertissements antérieurs sur [la vue `guest_routes`](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) et [le `search_path` de `lodging_room_capacity`](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) restent hors du périmètre de cette activation ; ces objets n'ont pas été modifiés.

Le module `pg_net` installé selon la procédure officielle enregistre son extension dans `public`, ce qui produit un [avertissement d'emplacement d'extension](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public). Cette extension n'est pas relocalisable ; elle n'ajoute aucune fonction dans `public`, ses objets d'exécution se trouvent dans `net`, dont l'accès via la Data API a été refusé pendant le contrôle. Aucune réinstallation ni suppression d'extension n'a été effectuée. L'information RLS sans politique sur le journal privé est intentionnelle : aucun accès des rôles API n'est accordé, seul l'administrateur du planificateur l'utilise.

## Références officielles

- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/cron/quickstart
- https://supabase.com/docs/guides/database/extensions/pg_net
- https://supabase.com/docs/guides/database/vault
