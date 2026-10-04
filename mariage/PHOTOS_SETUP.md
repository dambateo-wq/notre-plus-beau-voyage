# Espace Photos — configuration

Les vrais albums restent dans Google Photos. Le site ne les lit pas et ne reçoit aucun fichier envoyé par les invités. Aucune migration Supabase. Aucun changement de l’administration.

## Variables Vercel

Dans le projet existant, Settings → Environment Variables :

| Variable | Valeur |
| --- | --- |
| WEDDING_PHOTOS_PASSWORD | Mot de passe partagé long, unique (au moins 20 caractères recommandés), sans guillemets. Ne pas utiliser le mot de passe du compte Google. |
| WEDDING_OFFICIAL_GOOGLE_PHOTOS_URL | Lien HTTPS de partage de l’album officiel, facultatif avant le mariage. |
| WEDDING_GUEST_GOOGLE_PHOTOS_URL | Lien HTTPS de partage de l’album collaboratif des invités, facultatif. |

Ne pas ajouter de préfixe NEXT_PUBLIC_. Choisir Production et éventuellement Preview si un test de prévisualisation est souhaité. Une nouvelle livraison/redeployment est nécessaire après un changement de variables Vercel ; ajouter une variable ne modifie pas un déploiement existant. Ne publier cette branche qu’après validation.

Liens acceptés : `https://photos.app.goo.gl/...` ou `https://photos.google.com/share/...`. Copier le lien de partage de l’album, pas l’adresse privée de la bibliothèque, ni celle d’une seule photo. Un lien absent ou invalide affiche un état d’attente et aucun bouton cassé.

## Création manuelle des albums

1. Ouvrir https://photos.google.com et vérifier que le compte sélectionné est celui prévu pour gérer les albums et l’abonnement Google.
2. Créer un album nommé « Damien & Julie — Les photos des mariés ». Sur ordinateur, Google documente le parcours : sélectionner une photo dans Photos → Ajouter à un album ou créer un album → Album partagé → Nouvel album partagé → saisir le titre. Une image de présentation peut permettre de préparer l’album ; ne publier son lien sur le site que lorsque son contenu est prêt.
3. Dans cet album, ouvrir Partager → Créer un lien / Copier le lien. Vérifier dans ⋮ → Options les réglages de partage. Activer le partage par lien et désactiver Collaborer si les invités doivent uniquement consulter la sélection. Google indique que Collaborer concerne tous les contributeurs : il ne permet pas une permission d’ajout différente pour chaque invité. Si vous souhaitez tous deux alimenter cet album tout en bloquant les ajouts des invités, utiliser le compte propriétaire pour l’alimenter.
4. Créer séparément « Damien & Julie — Vos photos du week-end » par le même parcours. Dans ⋮ → Options, vérifier que le partage par lien ET Collaborer sont activés. Sur l’application mobile, les réglages de partage sont accessibles via ⋮ → Partage. Les libellés peuvent différer selon la plateforme.
5. Choisir volontairement les réglages Commentaires et J’aime ; ils sont indépendants du QR du site. Récupérer le lien de partage de cet album complet.
6. Ouvrir chaque lien dans une fenêtre privée, sans le compte propriétaire : vérifier le titre, le bon album et la consultation. Pour l’album invités, tester également avec un autre compte Google et une photo de test : rejoindre l’album, ajouter la photo, vérifier qu’elle apparaît chez le propriétaire. Google peut demander une connexion Google pour contribuer : l’absence de mot de passe du site ne signifie pas une contribution anonyme. Pour l’album officiel, vérifier que l’ajout est effectivement désactivé.
7. Ajouter les liens aux variables Vercel correspondantes. Garder l’URL officielle vide tant que l’album ne doit pas être disponible. Après validation du code et nouveau déploiement, entrer le mot de passe dans /photos et vérifier les deux cartes.
8. Depuis la carte invités, télécharger le QR PNG. Il fait 1600 × 1600 pixels, noir sur blanc, avec une marge blanche de quatre modules et sans logo. Imprimer sans rogner la bordure, sans déformation ; privilégier au moins 4 cm de côté.
9. Scanner le PNG puis une impression réelle avec deux téléphones : le QR doit ouvrir directement le bon album Google Photos, sans /photos ni mot de passe du site. Vérifier l’ajout avec un compte invité avant le mariage. Refaire ce test à l’approche du jour J.
10. Si le lien de partage change ou est réinitialisé, modifier WEDDING_GUEST_GOOGLE_PHOTOS_URL, redéployer puis télécharger et réimprimer le nouveau QR. Un QR déjà imprimé contient l’ancien lien et ne peut pas être mis à jour à distance.

Les 100 Go ne constituent pas une garantie de capacité mutualisée pour les comptes invités : vérifier aussi le stockage disponible du compte utilisé et le comportement réel d’un ajout par un invité. Aucun quota d’envoi n’est ajouté par le site.

## Mot de passe et session

Vérification côté serveur, sans mot de passe dans le HTML, les bundles ou l’URL. Session signée avec expiration vérifiée côté serveur (30 jours), cookie HttpOnly, Secure en production, SameSite Strict, limité à /photos. Changer le mot de passe invalide les sessions existantes. Le QR PNG est également protégé avant téléchargement. « Fermer ma session Photos » efface le cookie.

Le mot de passe ne protège pas les liens Google Photos après leur partage : toute personne disposant d’un lien reste soumise aux réglages de l’album Google. Les images décoratives statiques restent publiques comme les autres images du site.

## Images décoratives

- `public/images/photos/official-cover.jpg` : reprise de la photo du paysage de Massacan.
- `public/images/photos/guest-cover.jpg` : reprise du selfie de voyage existant.
- Les trois miniatures réutilisent `/voyage.jpg`, `/domaine.jpg`, `/velo-route.jpg`.

Pour changer les couvertures, remplacer les deux fichiers en conservant leur nom. Pour les miniatures, modifier les trois chemins dans AlbumImages, dans `app/photos/page.tsx`. Préférer des images légères (environ 1200 pixels de large pour les couvertures) : Next/Image génère les variantes optimisées. Ces fichiers servent à présenter les albums ; ils ne sont pas synchronisés avec Google Photos.

## Vérifications locales reproductibles

`npm run lint` et `npm run build`.

`node tests/photos-http.mjs` démarre automatiquement trois serveurs locaux et vérifie l’authentification réelle via les Server Actions, la session, les cookies, les sessions falsifiées, les liens et les états absents/non configurés, ainsi que le téléchargement et le décodage du PNG. Il ne nécessite pas de navigateur.

Installer le navigateur de test avec `npx playwright install chromium`. Démarrer deux serveurs de production locaux dans deux terminaux après le build :

```sh
WEDDING_PHOTOS_PASSWORD=local-photos-test WEDDING_OFFICIAL_GOOGLE_PHOTOS_URL=https://photos.app.goo.gl/officialTest WEDDING_GUEST_GOOGLE_PHOTOS_URL=https://photos.app.goo.gl/guestTest npm run start -- --hostname 127.0.0.1 --port 3101
```

```sh
WEDDING_PHOTOS_PASSWORD=local-photos-test npm run start -- --hostname 127.0.0.1 --port 3102
```

Puis `node tests/photos-smoke.mjs`. Les liens sont des valeurs de test : ce test n’ouvre aucun album Google et n’ajoute aucune photo. Il vérifie les liens rendus, l’authentification, les cookies, les états configurés/absents, la navigation, les débordements et les images sur plusieurs largeurs, puis décode le QR téléchargé. La consultation et l’ajout dans de vrais albums nécessitent le test manuel décrit plus haut.

## Références Google

- https://support.google.com/photos/answer/6131416?hl=fr&co=GENIE.Platform%3DDesktop
- https://support.google.com/photos/answer/6280921?hl=fr&co=GENIE.Platform%3DDesktop
