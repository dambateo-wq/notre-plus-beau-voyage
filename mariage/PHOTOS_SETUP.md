# Espace Photos — configuration

Les vrais albums restent dans Google Photos. Le site ne les lit pas et ne reçoit aucun fichier envoyé par les invités. Aucune migration Supabase. Aucun changement de l’administration.

## Variables Vercel

Dans le projet existant, Settings → Environment Variables :

| Variable | Valeur |
| --- | --- |
| WEDDING_PHOTOS_PASSWORD | Mot de passe partagé long, unique (au moins 20 caractères recommandés), sans guillemets. Ne pas utiliser le mot de passe du compte Google. |
| WEDDING_OFFICIAL_GOOGLE_PHOTOS_URL | Lien HTTPS de partage de l’album officiel, facultatif avant le mariage. |
| WEDDING_OFFICIAL_GOOGLE_PHOTOS_PUBLISHED | Laisser absent ou `false` tant que l’album du photographe n’est pas prêt. Mettre exactement `true` pour afficher « Découvrir l’album » avec son URL existante. |
| WEDDING_GUEST_GOOGLE_PHOTOS_URL | Lien HTTPS de partage de l’album collaboratif des invités, facultatif. |

Ne pas ajouter de préfixe NEXT_PUBLIC_. Choisir Production et éventuellement Preview si un test de prévisualisation est souhaité. Une nouvelle livraison/redeployment est nécessaire après un changement de variables Vercel ; ajouter une variable ne modifie pas un déploiement existant.

Liens acceptés : `https://photos.app.goo.gl/...` ou `https://photos.google.com/share/...`. Copier le lien de partage de l’album, pas l’adresse privée de la bibliothèque, ni celle d’une seule photo. Un lien absent ou invalide affiche un état d’attente et aucun bouton cassé.

## Création manuelle des albums

1. Ouvrir https://photos.google.com et vérifier que le compte sélectionné est celui prévu pour gérer les albums et l’abonnement Google.
2. Créer un album nommé « Damien & Julie — Les photos des mariés ». Sur ordinateur, Google documente le parcours : sélectionner une photo dans Photos → Ajouter à un album ou créer un album → Album partagé → Nouvel album partagé → saisir le titre. Une image de présentation peut permettre de préparer l’album ; ne publier son lien sur le site que lorsque son contenu est prêt.
3. Dans cet album, ouvrir Partager → Créer un lien / Copier le lien. Vérifier dans ⋮ → Options les réglages de partage. Activer le partage par lien et désactiver Collaborer si les invités doivent uniquement consulter la sélection. Google indique que Collaborer concerne tous les contributeurs : il ne permet pas une permission d’ajout différente pour chaque invité. Si vous souhaitez tous deux alimenter cet album tout en bloquant les ajouts des invités, utiliser le compte propriétaire pour l’alimenter.
4. Créer séparément « Damien & Julie — Vos photos du week-end » par le même parcours. Dans ⋮ → Options, vérifier que le partage par lien ET Collaborer sont activés. Sur l’application mobile, les réglages de partage sont accessibles via ⋮ → Partage. Les libellés peuvent différer selon la plateforme.
5. Choisir volontairement les réglages Commentaires et J’aime ; ils sont indépendants du QR du site. Récupérer le lien de partage de cet album complet.
6. Ouvrir chaque lien dans une fenêtre privée, sans le compte propriétaire : vérifier le titre, le bon album et la consultation. Pour l’album invités, tester également avec un autre compte Google et une photo de test : rejoindre l’album, ajouter la photo, vérifier qu’elle apparaît chez le propriétaire. Google peut demander une connexion Google pour contribuer : l’absence de mot de passe du site ne signifie pas une contribution anonyme. Pour l’album officiel, vérifier que l’ajout est effectivement désactivé.
7. Ajouter les liens aux variables Vercel correspondantes. L’URL officielle peut déjà être configurée : tant que `WEDDING_OFFICIAL_GOOGLE_PHOTOS_PUBLISHED` n’est pas `true`, le site affiche « Album à venir » sans lien vers cet album. Lorsque ses photos sont prêtes, mettre cette variable à `true` en Production et redéployer. Aucun changement de code ni d’URL n’est nécessaire. Une URL absente ou invalide conserve l’état d’attente, même si la publication est activée.
8. Depuis la carte invités, télécharger le QR PNG. Il fait 1600 × 1600 pixels, noir sur blanc, avec une marge blanche de quatre modules et sans logo. Imprimer sans rogner la bordure, sans déformation ; privilégier au moins 4 cm de côté.
9. Scanner le PNG puis une impression réelle avec deux téléphones : le QR doit ouvrir directement le bon album Google Photos, sans /photos ni mot de passe du site. Vérifier l’ajout avec un compte invité avant le mariage. Refaire ce test à l’approche du jour J.
10. Si le lien de partage change ou est réinitialisé, modifier WEDDING_GUEST_GOOGLE_PHOTOS_URL, redéployer puis télécharger et réimprimer le nouveau QR. Un QR déjà imprimé contient l’ancien lien et ne peut pas être mis à jour à distance.

Les 100 Go ne constituent pas une garantie de capacité mutualisée pour les comptes invités : vérifier aussi le stockage disponible du compte utilisé et le comportement réel d’un ajout par un invité. Aucun quota d’envoi n’est ajouté par le site.

## Mot de passe et session

Vérification côté serveur, sans mot de passe dans le HTML, les bundles ou l’URL. Session signée avec expiration vérifiée côté serveur (30 jours), cookie HttpOnly, Secure en production, SameSite Strict, limité à /photos. Changer le mot de passe invalide les sessions existantes. Le QR PNG est également protégé avant téléchargement. « Fermer ma session Photos » efface le cookie.

Le mot de passe ne protège pas les liens Google Photos après leur partage : toute personne disposant d’un lien reste soumise aux réglages de l’album Google. Les images décoratives statiques restent publiques comme les autres images du site.

## Illustrations des carnets

- `public/images/photos/official-journal.webp` : pin parasol et Méditerranée au coucher du soleil.
- `public/images/photos/guest-journal.webp` : baie méditerranéenne, olivier et appareil photo instantané.
- Illustrations décoratives créées avec l’outil imagegen intégré, puis optimisées en WebP, largeur 1120 pixels. Next/Image fournit les variantes adaptées aux écrans. Elles ne représentent pas de vraies photos du mariage et ne sont pas synchronisées avec Google Photos.
- Consignes de création : paysage méditerranéen peint, naturel et lumineux ; pin parasol, mer, îles et coucher de soleil pour le premier ; olivier, muret, appareil instantané et tirages pour le second ; palette olive, pierre dorée et crème ; ciel dégagé ; aucun texte, bouton ou QR intégré au bitmap.
- Ajustement de l’illustration invités avec le même outil : remonter le muret, l’appareil et les tirages pour les garder visibles au-dessus des Polaroids HTML, en conservant le paysage et le style.
- Les six Polaroids et leurs dessins sont des éléments HTML/SVG dans `app/photos/album-artwork.tsx`. Les pastilles et inscriptions sont de vrais textes HTML. Les polices Caveat (manuscrite) et Cormorant Garamond (la serif existante du site) sont servies localement pour cette page depuis `public/fonts/`, avec leurs licences OFL. Aucune typographie des autres pages n'est modifiée.
- Les cartes sont horizontales sur ordinateur, empilées sur mobile ; leurs styles sont limités à `app/photos/photos.module.css`.

Le fichier `app/photos/qr/route.ts`, l’URL invités, la génération et les paramètres PNG n’ont pas été modifiés par la refonte. Le test compare le SHA-256 du téléchargement à celui relevé avant la refonte, avec une URL de test fixe : le PNG doit rester strictement identique octet par octet.

## Vérifications locales reproductibles

`npm run lint`, `npx tsc --noEmit` et `npm run build`.

`node tests/photos-http.mjs` démarre automatiquement quatre serveurs locaux et vérifie l’authentification réelle via les Server Actions, la session, les cookies, les sessions falsifiées, les albums configurés/publiés, l’album officiel encore non publié, les états absents/non configurés, ainsi que le téléchargement et le décodage du PNG. Il contrôle aussi l’identité binaire du QR avant/après. Il ne nécessite pas de navigateur.

Installer le navigateur de test avec `npx playwright install chromium`, puis exécuter `node tests/photos-smoke.mjs` après le build. Le script démarre et arrête ses propres serveurs. Il contrôle les largeurs 360, 390, 430, 768, 1024 et 1440 pixels, les dimensions identiques des illustrations, les Polaroids non coupés, les cibles tactiles, l’authentification et l’ouverture des liens dans de nouveaux onglets. Les ouvertures Google sont interceptées par le test : aucun vrai album n’est consulté ou modifié. Les captures de contrôle sont écrites dans `PHOTOS_TEST_OUTPUT_DIR` (par défaut `/tmp/photos-redesign`). `PHOTOS_TEST_CHROMIUM` et `PHOTOS_TEST_CHROMIUM_ARGS` permettent d’utiliser un navigateur de test déjà disponible sans ajouter de dépendance au site. La consultation et l’ajout dans de vrais albums nécessitent le test manuel décrit plus haut.

## Références Google

- https://support.google.com/photos/answer/6131416?hl=fr&co=GENIE.Platform%3DDesktop
- https://support.google.com/photos/answer/6280921?hl=fr&co=GENIE.Platform%3DDesktop
