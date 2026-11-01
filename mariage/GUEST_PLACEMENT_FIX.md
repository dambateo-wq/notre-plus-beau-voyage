# Correction du placement des invités

Correction préparée le 1er novembre 2026 sur `fix/placement-invites`. Aucune migration, écriture de données, fusion dans `main` ou mise en production n'a été effectuée pour ce correctif. Les vérifications sur le projet Supabase `ihlhksysyqgbiehwpvac` sont en lecture seule.

## Diagnostic confirmé

La définition de production de `place_lodging_guest(uuid,smallint,text)` contient encore `reservation.payment_status <> 'confirmed'`. Elle correspond exactement au corps de la migration initiale `supabase/lodging_guest_assignments_migration.sql` (empreinte MD5 `96552da551f3a6083384a993c8bef978`). Les journaux PostgreSQL confirment `RESERVATION_NOT_PLACEABLE` le 1er novembre à 18:05:57, 18:06:07 et 18:06:23, Europe/Paris. Les cinq réservations sont actives et impayées, sans revue financière en attente ; aucune attribution nominative ou historique n'est présente au moment de l'audit.

L'interface autorise les réservations actives indépendamment du paiement. Ses Server Actions levaient cependant des exceptions sur les refus de la base : Next.js masque leurs messages en production. L'action écrivait aussi `placement_status = 'in_progress'` avant l'appel SQL susceptible d'échouer. Retirer et finaliser reposaient sur plusieurs lectures/écritures séparées.

## Pourquoi une nouvelle migration

La migration historique `supabase/placement_independent_from_payment_migration.sql` retire bien le blocage du paiement. Elle ne tient toutefois pas compte de `assigned_nights`, ajouté depuis, et ne rend pas atomiques les opérations admin. Elle n'est pas rejouée ni modifiée.

La seule migration à appliquer, après accord, est :

`supabase/migrations/20261101172011_guest_placement_without_payment.sql`

Elle :

- Conserve la signature de `place_lodging_guest`, supprime la condition de paiement et conserve réservation active, index du voyageur, chambre et capacité. Les occupants sont comptés nuit par nuit à partir de `assigned_nights`, ou des nuits réservées lorsque cette colonne est NULL. Une attribution effectuée depuis le plan couvre toutes les nuits de la réservation ; la migration ne réécrit aucune attribution existante.
- Conserve le verrou de chambre et le verrou de ligne de réservation. Ajoute le verrou de capacité `20270529`, déjà utilisé par la création et l'édition admin, dans le même ordre de verrouillage.
- Ajoute la fonction privée `admin_lodging_placement(text,uuid,smallint,text)` pour placer, retirer, finaliser et rouvrir. Elle contrôle en base la réservation active, l'absence de validation financière en attente (champ et demande réelle), l'appartenance du voyageur, les nuits et la chambre. Attribution/retrait et statut sont écrits dans une même transaction. Un refus annule toute cette opération.
- Vérifie lors de la finalisation chaque index, chaque nom, chaque chambre, chaque nuit et les capacités réelles sous verrou. Un compteur seul ne suffit plus.
- Utilise `SECURITY INVOKER`, avec exécution réservée à `service_role`. Les droits existants de ce rôle ont été vérifiés. Aucun accès anonyme ou authentifié ordinaire n'est ajouté.
- Refuse de remplacer la fonction si son corps a changé depuis l'audit (`PLACEMENT_SCHEMA_CHANGED_REVIEW_REQUIRED`). Dans ce cas, refaire la comparaison avant de proposer un autre SQL ; ne pas retirer ce contrôle pour forcer l'installation.

La fonction historique `place_lodging_guest` sert aussi au rapprochement interne des noms lors de l'approbation d'une modification financière, avant que la procédure existante ne lève son indicateur d'attente. Sa signature et cet usage sont conservés. Les contrôles financiers de l'administration sont donc regroupés dans la nouvelle RPC transactionnelle, utilisée par les quatre Server Actions. La fonction privée historique de retrait et le processus d'approbation financière restent inchangés. Aucune de ces fonctions n'est appelable par les invités via l'API publique.

## Interface et erreurs

Les Server Actions renvoient un résultat sérialisable `{ ok, ... }`. Chambre pleine, réservation annulée, revue financière, voyageur invalide et placement incomplet ont chacun un message français. Les erreurs SQL brutes et les détails privés ne sont pas transmis.

L'interface conserve ses attributions affichées jusqu'à confirmation du serveur et bloque les doubles manipulations pendant une opération. Un refus ne déclenche ni revalidation serveur de toute la page, ni rafraîchissement automatique. Un succès rafraîchit les données une seule fois côté client. Une erreur réseau dont le résultat est incertain propose explicitement « Actualiser le plan » avant de réessayer. Les nouvelles données du serveur réinitialisent correctement l'état local du composant, sans réinitialiser la base.

Les nuits partielles ne sont plus comptées comme un placement complet. Le bouton « Compléter les nuits » vérifie la capacité avant d'étendre l'attribution. Les lits d'une réservation active en revue financière restent inclus dans l'occupation affichée, même si cette réservation ne peut pas être modifiée.

## Fichiers

- `app/admin/LodgingGuestPlanner.tsx` : messages, conservation de l'affichage, protection des requêtes simultanées, calcul par nuit.
- `app/admin/LodgingPlacementAction.tsx` : réouverture et erreurs structurées.
- `app/admin/actions.ts` : quatre actions de placement vers la transaction privée, sans écriture préalable ni exception métier propagée.
- `app/admin/page.tsx` : synchronisation du plan après actualisation.
- `lib/admin-lodging-placement.ts` : requête privée, validation et résultats sérialisables.
- `lib/lodging-placement.ts` : calcul de couverture de toutes les nuits, utilisable par le client.
- `supabase/migrations/20261101172011_guest_placement_without_payment.sql` : migration ci-dessus.
- `tests/guest-placement.mjs` et `tests/guest-placement-http.mjs` : tests isolés.
- `tests/weekly-digest-http.mjs` : période d'aperçu explicitement calée sur sa fixture d'octobre pour que le test reste valable en novembre ; aucun code du bilan n'est modifié.
- `vercel.json` : déploiement automatique désactivé pour cette branche.
- `GUEST_PLACEMENT_FIX.md` : diagnostic, installation et validation.

`lib/lodging.ts`, les migrations historiques, les inscriptions, paiements et e-mails existants ne sont pas modifiés.

## Tests effectués

```bash
node tests/guest-placement.mjs
node tests/admin-reservation-edit.mjs
node tests/weekly-digest.mjs
npx eslint lib/admin-lodging-placement.ts lib/lodging-placement.ts app/admin/LodgingGuestPlanner.tsx app/admin/LodgingPlacementAction.tsx app/admin/actions.ts app/admin/page.tsx tests/guest-placement.mjs tests/guest-placement-http.mjs
npx tsc --noEmit
npm run build
node tests/guest-placement-http.mjs
node tests/weekly-digest-http.mjs
```

Les tests PostgreSQL isolés reproduisent d'abord le refus d'une réservation impayée avec l'ancienne fonction. Ils vérifient ensuite les neuf scénarios demandés, dont les groupes répartis, le déplacement et retrait, les nuits partielles, les capacités, la finalisation, les réservations annulées/en revue et les paiements inchangés. Ils vérifient aussi les droits privés, la conservation d'un lit préexistant à l'installation, le refus d'écraser une fonction plus récente et le rollback d'une attribution si l'écriture suivante du statut échoue.

Deux demandes parallèles de la dernière place sont lancées et une seule réussit. PGlite les sérialise sur sa connexion unique : cela vérifie le résultat fonctionnel, pas une charge réelle avec plusieurs connexions PostgreSQL. Les verrous et leur ordre ont été vérifiés dans le SQL.

Le test HTTP utilise le véritable build Next.js, le manifeste réel des Server Actions et le protocole React, avec un faux serveur Supabase local. Il confirme que les erreurs attendues reviennent en français dans une réponse normale, sans erreur RSC, détails privés ou rendu complet automatique de `/admin`. Il couvre les quatre opérations et une session expirée. Les régressions de l'édition de réservations et du bilan sont également vérifiées. Aucun SMTP, invité réel ou test d'écriture en production n'est utilisé.

## Mise en production après accord uniquement

1. Vérifier que la PR examinée n'a pas changé, puis refaire les lectures de définition et des compteurs de production si nécessaire.
2. Appliquer uniquement la nouvelle migration avec `apply_migration` Supabase ou son SQL exact dans l'éditeur SQL. Ne pas rejouer l'ensemble des fichiers historiques et ne pas utiliser un `db push` aveugle : l'historique initial du projet est incomplet.
3. Vérifier en lecture seule les définitions, les droits `EXECUTE`, les compteurs et l'absence de modification des données. L'installation ne contient aucune écriture de réservation, réponse ou paiement hors des corps de fonctions.
4. Fusionner la PR et vérifier le déploiement Vercel correspondant au commit approuvé.
5. Contrôler visuellement `/admin#guest-planner-title`. Pour un test d'écriture réel, obtenir une autorisation distincte et précise ; à défaut, utiliser une préproduction avec des réservations fictives.

Aucune variable d'environnement, clé, dépendance ou service payant supplémentaire n'est nécessaire. L'authentification admin et la configuration Supabase serveur restent celles du site existant.

## Limites avant validation finale

Le rendu et les interactions réelles sur téléphone n'ont pas été inspectés visuellement ; les réponses des Server Actions compilées sont testées par HTTP. Une charge avec plusieurs connexions PostgreSQL réelles n'a pas été exécutée. Aucun résultat de test n'affirme une validation d'écriture sur la production. Le service de placement doit recevoir la migration avant le nouveau code ; une panne réseau après une écriture peut laisser son accusé de réception incertain, d'où la vérification manuelle proposée dans l'interface et l'absence de relance automatique.
