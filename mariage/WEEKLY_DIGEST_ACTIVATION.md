# Mise en service du bilan hebdomadaire — 1er novembre 2026

## État actuel

L'envoi par le Gmail existant est opérationnel. Un bilan de test a été accepté par Gmail pour chacun des deux destinataires configurés. **La planification autonome n'est pas encore active : la connexion au compte Upstash n'a pas été validée.** Aucune planification QStash n'a été créée pendant cette intervention et aucun envoi hebdomadaire futur n'est encore confirmé.

La réception effective et le rendu dans les deux boîtes Gmail, notamment sur téléphone, restent à vérifier par les destinataires. Le statut `sent` signifie acceptation SMTP et journalisation, pas garantie d'arrivée en boîte principale.

## Audit et cause de l'absence d'envoi le 1er novembre

- Le bilan est déjà fusionné dans `main`. L'ancienne branche `feat/weekly-wedding-digest` n'a pas à être redéployée séparément.
- Le code de production contrôlé est `d0b7e4c06955f5b2ead208cd62587ffc3ad65134`, avec les corrections d'administration et de placement.
- La migration `weekly_wedding_digest` figure dans Supabase sous `20261029060448`. Les trois tables privées et les deux fonctions de snapshot/journal sont présentes. Aucun SQL n'a été rejoué.
- Avant activation, les six variables `WEEKLY_DIGEST_*` étaient absentes en production et le journal ne comportait aucune exécution. Les montants encaissés sont désormais renseignés dans les données existantes ; aucune nouvelle initialisation n'a été nécessaire.
- `mariage/vercel.json` ne contient que le maintien Supabase (`0 9 * * *`), conformément à l'architecture prévue. Ce cron n'a pas été modifié. L'absence de cron Vercel pour le bilan est volontaire : QStash doit assurer son déclenchement.
- Le projet utilise Vercel Hobby. Ses crons peuvent s'exécuter dans toute l'heure prévue et ne répondent pas au besoin d'un déclenchement à 18 h. La solution QStash déjà prévue reste adaptée avec un fuseau explicite.

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

Les secrets dédiés comportent chacun 64 caractères aléatoires. `SMTP_USER`, `SMTP_PASS`, les paramètres Supabase et `ADMIN_PASSWORD` ont été conservés. `lib/email.ts` et `sendWeddingEmail()` n'ont pas été modifiés ; aucun service d'envoi, SDK ou abonnement d'e-mail n'a été ajouté.

Le même commit existant a été redéployé pour charger ces variables :

- Déploiement Vercel : `dpl_2EkZFHzaBJVjMnVmtPBR4vFayRRv`, état `READY`.
- Site de production : https://les-dadjus-notre-plus-beau-voyage.vercel.app
- Administration : https://les-dadjus-notre-plus-beau-voyage.vercel.app/admin
- Aperçu et test privés : https://les-dadjus-notre-plus-beau-voyage.vercel.app/admin/bilan-hebdomadaire

Ce redéploiement n'a modifié aucun fichier applicatif ni aucune donnée d'invité. La branche `chore/activate-weekly-digest` contient uniquement cette documentation et la désactivation des déploiements automatiques de cette branche.

## Vérifications effectuées

1. L'API privée sans authentification répond `401` avec `Cache-Control: private, no-store`.
2. L'aperçu authentifié a été généré sur les données réelles, sans envoi, pour `[25/10/2026 18 h, 01/11/2026 18 h)` à Paris.
3. Les nombres de formulaires/personnes et le solde des réservations de cet aperçu concordent avec une requête Supabase indépendante. Aucun montant encaissé n'est inconnu et aucun avertissement n'a été relevé. Les données nominatives et chiffres privés ne sont pas publiés dans GitHub.
4. Les liens HTML du bouton pointent bien vers l'URL canonique `/admin`, sans secret ni contournement de l'authentification.
5. Test réel avec la référence stable `activation-20261101-gmail` et la période se terminant à `2026-11-01T17:00:00.000Z` : réponse `200`, statut `sent`, **2 envois**. Le journal contient une campagne et deux livraisons `sent`, avec une seule tentative SMTP par destinataire, sans erreur. Envois acceptés vers 19 h 21, heure de Paris.
6. Relance avec la même référence et la même période : réponse `200`, statut `sent`, **0 nouvel envoi**.
7. Les empreintes des lignes d'inscriptions, de réservations (paiements compris) et d'attributions sont identiques avant et après le test. Seules les tables de journalisation du bilan ont reçu l'exécution et ses résultats.
8. Les tests existants `tests/weekly-digest.mjs` et `tests/weekly-digest-sql.mjs` ont été exécutés avec succès pendant l'audit : semaines de changement d'heure de 167/169 h, calculs, erreurs Supabase, journal, verrouillage et doublons. Ils n'utilisent pas le SMTP de production. Le redéploiement Vercel a compilé le même code avec succès. Aucun code TypeScript/TSX n'a été modifié pendant cette activation.

## Étape restante : QStash

Terminer la connexion au compte Upstash choisi par l'organisateur, puis vérifier les planifications existantes avant toute création. Réutiliser la planification de même identifiant si elle existe, pour éviter un second déclencheur.

| Paramètre | Valeur |
| --- | --- |
| Identifiant stable | `notre-plus-beau-voyage-weekly-digest` |
| Expression | `CRON_TZ=Europe/Paris 0 18 * * 0` |
| Destination | `https://les-dadjus-notre-plus-beau-voyage.vercel.app/api/cron/weekly-digest` |
| Méthode / corps | `POST` / `{}` |
| Authentification transmise | En-tête `Authorization: Bearer …` utilisant le secret dédié, jamais une URL |
| Reprises | 3 reprises, espacées de 60 secondes |
| Délai HTTP | 55 secondes |

Le script existant peut appliquer cette configuration, dans un environnement de confiance où `QSTASH_TOKEN` et `WEEKLY_DIGEST_CRON_SECRET` sont chargés sans affichage :

```sh
node scripts/weekly-digest.mjs schedule-plan
node scripts/weekly-digest.mjs schedule-apply --approved
```

`WEEKLY_DIGEST_ENABLED=true` doit aussi être présent dans l'environnement du script. `QSTASH_TOKEN` sert à la configuration distante ; il n'est pas nécessaire au fonctionnement du serveur Vercel. Ne jamais le saisir dans le chat, le dépôt ou les logs. Vérifier ensuite que la planification est active et annonce bien dimanche 18 h à Paris, puis consulter les résultats de livraison QStash et le journal Supabase après son premier déclenchement.

QStash est uniquement le planificateur : aucune donnée d'invité ne lui est envoyée. Le niveau gratuit documenté couvre 1 000 messages/jour et 10 planifications ; cet usage hebdomadaire est très inférieur à ces limites. Aucun abonnement payant n'a été souscrit. Les conditions/quota du compte doivent être vérifiés à la connexion. Le niveau gratuit n'apporte pas de garantie d'absence de panne ni d'arrivée du mail à la seconde exacte.

## Test manuel et exploitation

L'administrateur peut ouvrir la page privée du bilan pour voir l'aperçu, puis déclencher volontairement un test. Ne pas utiliser les formulaires d'encaissement ou d'attribution pour tester l'envoi : ils modifient les données métier.

Pour reproduire le contrôle d'absence de doublon déjà effectué, charger le secret de test dans un environnement privé et reprendre **la même période et la même référence** :

```sh
WEEKLY_DIGEST_PERIOD_END=2026-11-01T17:00:00.000Z node scripts/weekly-digest.mjs test activation-20261101-gmail
```

Ce contrôle doit renvoyer `sent: 0`. Une autre référence constitue un nouveau test volontaire et peut envoyer deux nouveaux messages. Les tests peuvent être désactivés après validation en passant `WEEKLY_DIGEST_TEST_ENABLED=false` dans Vercel puis en redéployant ; l'aperçu privé et l'envoi planifié restent disponibles.

Les erreurs de lecture ou montants encaissés inconnus bloquent l'envoi plutôt que de produire des zéros trompeurs. En cas d'échec, examiner les codes du journal et la DLQ QStash. Un résultat SMTP ambigu devient `uncertain` et bloque les renvois automatiques ; contrôler les messages envoyés dans Gmail avant toute reprise manuelle. Ne pas remettre une livraison incertaine en attente sans vérification et accord explicite.

Après activation et vérification de QStash, les envois ordinaires dépendront seulement de QStash, Vercel, Supabase et du Gmail existant. Aucune visite du site, session utilisateur, IA ou ouverture de ChatGPT ne sera nécessaire. Les comptes, quotas et secrets doivent rester valides ; une panne ambiguë peut nécessiter une intervention exceptionnelle.

## Références officielles

- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://upstash.com/docs/qstash/features/schedules
- https://upstash.com/docs/qstash/api-reference/schedules/create-a-schedule
- https://upstash.com/docs/qstash/features/retry
- https://upstash.com/pricing/qstash
