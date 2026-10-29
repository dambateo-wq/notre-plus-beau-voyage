# Modifier une réservation dans l'administration

Dans `/admin`, chaque réservation liée à une inscription ou indépendante propose **Modifier la réservation**. Le lien ouvre `/admin/reservations/[id]` et exige la session administrateur existante. Il ne contient aucun token d'invité et ne contourne pas l'authentification.

Les inscriptions sans réservation d'hébergement, y compris les réponses d'absence, proposent **Modifier l’inscription**. Le lien `/admin/inscriptions/[id]` réutilise le même questionnaire avec les valeurs enregistrées. Les réponses peuvent être corrigées sans réserver de nuitée. Si un hébergement est ajouté, sa création et les deux liens avec l'inscription sont atomiques, avec le tarif et la capacité de `create_lodging_reservation()`. Le nouvel hébergement est impayé avec 0 € encaissé. Si une réservation est déjà liée ou apparaît entre-temps, la page redirige vers l'éditeur existant ou refuse l'enregistrement périmé ; aucune réservation en double n'est créée.

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

Le correctif des inscriptions sans hébergement nécessite ensuite `20261029074310_admin_registration_edit.sql` : deux fonctions privées et un journal minimal sous RLS. Il ne modifie aucune réponse ni aucun paiement lors de son application. Le code de cette branche et cette nouvelle migration doivent être approuvés avant toute mise en production. Les fichiers de migrations historiques hors de `supabase/migrations/` ne doivent pas être rejoués.

```bash
node tests/admin-reservation-edit.mjs
node tests/weekly-digest.mjs
node tests/weekly-digest-sql.mjs
npm run build
node tests/weekly-digest-http.mjs
```

Les tests utilisent une base PostgreSQL isolée et un faux serveur Supabase. Ils couvrent aussi les inscriptions sans nuitée et les absences, leurs boutons dans la vraie page admin compilée, l'ajout atomique d'un hébergement, l'absence de doublon après une relance et le rollback si l'inscription échoue après la création de l'hébergement. Les réservations liées et indépendantes, la cohérence, les dates de création, les paiements partiels, les placements par nuit, les conflits, la capacité, l'annulation, l'authentification et la protection CSRF restent vérifiés. Aucun SMTP ni invité de production n'est utilisé pour les tests locaux.

Après déploiement, se connecter à `/admin`, ouvrir le bouton de modification d'une réservation et contrôler ses valeurs. N'enregistrer un changement réel que lorsqu'il est souhaité. La création du formulaire et le chargement de son aperçu ne modifient aucune donnée.
