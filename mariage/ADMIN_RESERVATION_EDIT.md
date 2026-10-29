# Modifier une réservation dans l'administration

Dans `/admin`, chaque réservation liée à une inscription ou indépendante propose **Modifier la réservation**. Le lien ouvre `/admin/reservations/[id]` et exige la session administrateur existante. Il ne contient aucun token d'invité et ne contourne pas l'authentification.

Pour une inscription liée, le formulaire existant est réutilisé : répondant, accompagnants, présences, coordonnées, voyageurs hébergés, nuits, souhaits de colocation et autres réponses. L'inscription et l'hébergement sont enregistrés dans une seule transaction. Les dates de création restent inchangées : la modification ne devient pas une nouvelle inscription dans le bilan. Les informations alimentaires inconnues restent inconnues tant que ces champs ne sont pas modifiés.

Pour les anciennes réservations indépendantes, un formulaire permet de changer le responsable, les coordonnées, les voyageurs hébergés, les nuits, la colocation, le moyen de paiement et le statut actif/annulé.

- Le prix est recalculé au tarif existant de 35 € par personne et par nuit. La capacité réutilise les 106 couchages actuellement configurés dans le code et la fonction Supabase existante.
- Le montant réellement encaissé est toujours conservé. Le statut de paiement est recalculé à partir de ce montant, jamais à partir du moyen choisi. Pour corriger un encaissement, utiliser le lien vers la page privée du bilan. Un trop-perçu éventuel reste enregistré ; aucun remboursement automatique n'est déclenché.
- Les placements des noms inchangés sont rapprochés par les fonctions existantes, homonymes compris. Seules les nuits déjà couvertes sont conservées. Un nouveau nom ou une nuit ajoutée nécessite une vérification du placement. Une réactivation ne rétablit pas automatiquement les anciens lits.
- Les contrôles des chambres restent conservateurs, comme le plan existant. Un manque de place bloque la modification. Un placement historique non nominatif doit être repris avant de changer le groupe ou les nuits.
- Une demande de modification financière en attente doit d'abord être approuvée ou refusée dans l'administration.
- Les versions de la réservation, de l'inscription et des placements sont vérifiées. Un formulaire ancien reçoit un conflit ; il ne remplace pas les modifications faites entre-temps.
- Une erreur annule ensemble les écritures sur l'inscription, la réservation, les placements et l'historique. L'historique privé ne contient ni coordonnées, ni secrets, ni informations alimentaires.
- Enregistrer depuis cette page n'envoie aucun e-mail aux invités. Les parcours d'inscription et de confirmation existants gardent leur fonctionnement.

## Installation et vérification

Ordre des migrations : `20261028215411_weekly_wedding_digest.sql`, puis `20261029055043_admin_reservation_edit.sql`. La seconde ajoute un snapshot privé, une fonction d'enregistrement transactionnel et l'historique privé. Fonctions `SECURITY INVOKER`, exécution réservée à `service_role`, RLS sur l'historique. Aucune nouvelle clé, dépendance ou variable d'environnement n'est nécessaire pour l'édition.

```bash
node tests/admin-reservation-edit.mjs
node tests/weekly-digest.mjs
node tests/weekly-digest-sql.mjs
npm run build
node tests/weekly-digest-http.mjs
```

Les tests utilisent une base PostgreSQL isolée et un faux serveur Supabase. Ils couvrent l'enregistrement lié et indépendant, la cohérence, les dates de création, les paiements partiels, les placements par nuit, les conflits, la capacité, l'annulation, le rollback, l'authentification et la protection CSRF. Aucun SMTP ni invité de production n'est utilisé pour les tests locaux.

Après déploiement, se connecter à `/admin`, ouvrir le bouton de modification d'une réservation et contrôler ses valeurs. N'enregistrer un changement réel que lorsqu'il est souhaité. La création du formulaire et le chargement de son aperçu ne modifient aucune donnée.
