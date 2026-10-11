# Keep-alive Supabase : audit et vérification

Audit effectué le 11 octobre 2026. Base examinée : `origin/main` au commit
`7a6a7cc9239562742400e7f32a461b30f0fd3c50`.
Les corrections décrites ci-dessous sont locales tant qu'elles ne sont pas
validées, poussées et déployées. Aucun paramètre de production n'a été modifié.

## Ce qui est réellement en production avant correction

| Point contrôlé | Résultat |
| --- | --- |
| Implémentation sur main | Oui, introduite par `fed7cc9` le 10 septembre 2026 UTC |
| Route | `GET /api/cron/supabase-keepalive` |
| Client serveur | Réutilisation de `getSupabaseConfig()` dans `lib/supabase.ts`, également utilisé par la carte collective |
| Lecture | PostgREST `GET /rest/v1/guest_routes?select=id&limit=1` ; aucune écriture |
| Protection | `Authorization: Bearer <CRON_SECRET>` ; absent ou incorrect : 401 |
| Configuration | `mariage/vercel.json`, expression `0 9 */3 * *` |
| Fréquence réelle | À 09 h UTC les jours 1, 4, 7, …, 28, 31 ; intervalle maximal de trois jours, parfois plus court au changement de mois |
| GitHub Actions | Aucun workflow suivi dans `.github` sur main ; aucun second ordonnanceur dans le dépôt |
| Déploiement | Statuts Vercel réussis pour le commit d'introduction et pour main examiné |
| Offre Vercel | Hobby, constatée dans le tableau de bord |
| Cron actif | Activé ; le tableau de bord affiche bien la route et l'ancien calendrier |
| Variables de production | `CRON_SECRET`, `SUPABASE_URL` et `SUPABASE_ANON_KEY` présents ; les valeurs secrètes n'ont pas été affichées |
| Cache Next.js | Déjà évité : `force-dynamic` et `fetch(..., { cache: "no-store" })` |
| Gestion des erreurs | HTTP 500 et log serveur si la lecture échoue ; aucun délai explicite, aucune surveillance indépendante ni preuve journalisée des succès |

Deux sondes publiques d'audit, sans autorisation puis avec un faux secret, ont
renvoyé 401 le 11 octobre à 17:46:43 et 17:46:49 UTC. Elles apparaissent dans les
logs Vercel : **ce ne sont pas des échecs du cron automatique**.
Leurs réponses portaient respectivement les états de cache MISS et BYPASS.

Une seule exécution manuelle a ensuite été lancée avec le bouton **Run** du cron
Vercel. Le log affiche **GET 200**, le **11 octobre 2026 à 17:55:46.324 UTC**, sur
`les-dadjus-notre-plus-beau-voyage-awnho96nj.vercel.app`.
Le code de cette route n'émet 200 qu'après la réponse réussie et la lecture JSON
de Supabase. Cela confirme le fonctionnement actuel avec les variables du
déploiement. Cela ne démontre pas les exécutions automatiques antérieures.

## Pourquoi la suspension n'est pas expliquée par la seule présence du cron

L'absence d'implémentation, l'incompatibilité Hobby, l'absence actuelle de secret
et un cache Next.js ne sont **pas** des causes établies par cet audit.

La faiblesse prouvée est l'absence de surveillance des lectures effectives.
Vercel ne réessaie pas automatiquement une exécution échouée et sa livraison
cron est assurée au mieux, sans garantie d'exécution. Avec l'ancien calendrier,
deux rendez-vous manqués ou échoués peuvent espacer les lectures réussies de
neuf jours. C'est un scénario possible, **pas un événement historique confirmé**.
Une variable correcte aujourd'hui ne prouve pas non plus sa valeur au moment de
la suspension.

Supabase Free peut mettre en pause un projet dont l'activité est faible sur une
période de sept jours. Sa documentation ne promet pas qu'un unique SELECT
périodique suffise à exclure toute mise en pause. Un keep-alive réduit le risque
et fournit une activité réelle ; il ne constitue pas une garantie contractuelle.
L'offre Pro exclut la pause pour inactivité, mais cette correction reste gratuite.

**La cause exacte et la date de la suspension ne sont pas prouvées.** La connexion
au tableau de bord Supabase n'a pas abouti pendant cet audit. Ni son historique
de pause, ni les logs API de la période concernée, ni la correspondance du nom
« Mariage Julie et Damien » avec le projet référencé par `SUPABASE_URL` n'ont donc
pu être contrôlés. La réponse 200 actuelle concerne bien le projet configuré sur
Vercel ; elle ne l'identifie pas par son nom dans Supabase.

Pour trancher un incident ancien, il faut rapprocher la date de l'e-mail de pause,
le project ref Supabase, les déploiements et variables en vigueur à cette date,
et les dernières lectures API réussies. Les logs runtime Vercel Hobby ne sont
conservés qu'une heure : leur absence aujourd'hui n'est pas la preuve qu'aucune
exécution ancienne n'a eu lieu. Les journaux Supabase dépendent également de la
rétention disponible ; si les preuves ont expiré, la cause restera indéterminée.

## Correction préparée

- Même route, même client, même table : une seule lecture `select=id&limit=1`
  par appel autorisé, y compris si la table est vide. Aucun nouveau client,
  aucune clé service-role, migration, inscription, notification du mariage ou
  modification de données.
- Calendrier `0 9 * * *` : une fois par jour. Sur Hobby, l'appel peut arriver
  entre 09:00 et 09:59 UTC. Aucune fréquence horaire ni second cron.
- Requête Supabase sans cache, sans suivi de redirection et limitée à huit
  secondes ; exécution Node limitée à quinze secondes.
- Réponses explicitement `no-store` pour le navigateur et les CDN ; identifiant
  unique `X-Keepalive-Run-Id` à chaque invocation.
- Journaux JSON : début, succès ou échec, phase, raison, statut amont, durée,
  identifiant d'exécution et identifiant de requête Supabase si fourni.
  Aucun enregistrement, clé, secret, contenu d'erreur amont ou URL de surveillance.
- Surveillance indépendante Healthchecks.io : signal de succès **uniquement
  après** la lecture Supabase ; `/fail` en cas d'échec autorisé. Un appel sans
  autorisation ne peut pas déclencher une alerte arbitraire.
- Si le cron n'arrive jamais, retourne 401, est bloqué avant la route ou si le
  moniteur est inaccessible, le signal attendu manque et Healthchecks alerte
  après sa période de grâce, une fois le contrôle initialisé.
- L'envoi au moniteur est limité à trois secondes. Son indisponibilité est
  journalisée et ne transforme pas une lecture réussie en échec Supabase.

Ce dispositif surveille aussi les absences d'exécution, ce qu'un simple log
d'erreur dans la fonction ne peut pas faire. Il permet une intervention avant
plusieurs jours de silence. Il ne réactive pas automatiquement un projet déjà
mis en pause et ne peut garantir la disponibilité des offres gratuites.

## Configuration après validation et déploiement

1. Créer sur Healthchecks.io un contrôle gratuit nommé « Supabase mariage ».
   Le forfait Hobbyist gratuit suffit à ce contrôle unique.
2. Choisir le type **Cron**, l'expression **`0 9 * * *`**, le fuseau **UTC** et
   une grâce de **2 heures**. Un signal manquant provoque alors une alerte à
   partir de 11 h UTC. Conserver l'autorisation des requêtes GET et ne pas activer
   de filtre exigeant un contenu de requête.
3. Configurer la destination de notification souhaitée, la vérifier et utiliser
   le test de notification de Healthchecks. Ne pas utiliser les e-mails du site
   de mariage pour ces alertes.
4. Copier l'URL de ping standard du contrôle, au format
   `https://hc-ping.com/<UUID>`, sans `/start`, `/fail`, paramètres ou fragment.
   Cette URL est un secret : ne pas la mettre dans le dépôt ou un lien public.
5. Dans Vercel → projet → Settings → Environment Variables, ajouter
   **`KEEPALIVE_HEALTHCHECK_URL`** en **Production** avec cette URL.
   Aucune variable `NEXT_PUBLIC_*` n'est utilisée.
6. Conserver `CRON_SECRET` déjà présent : c'est sa valeur brute, sans le préfixe
   `Bearer`. Vercel ajoute automatiquement ce préfixe à l'en-tête du cron.
   Pour une nouvelle configuration, choisir un secret aléatoire d'au moins
   32 caractères. Conserver `SUPABASE_URL` et `SUPABASE_ANON_KEY` existants.
7. Après validation, publier le commit et laisser Vercel effectuer un nouveau
   déploiement de production, afin d'appliquer le calendrier et la variable.
   Modifier une variable seule n'actualise pas un déploiement existant.
8. Vérifier dans Settings → Cron Jobs que le cron est activé et affiche
   `/api/cron/supabase-keepalive` avec **`0 9 * * *`**.
9. S'il est effectivement en pause, restaurer le bon projet depuis Supabase
   Dashboard avant de tester. Aucun SELECT ne peut le restaurer à lui seul.
10. Effectuer la vérification initiale ci-dessous : le contrôle Healthchecks
    doit passer à **Up**. Un contrôle encore **New** n'est pas une surveillance
    validée. Aucun contrôle externe ni variable de production n'a été créé
    pendant cette intervention ; cette activation reste à effectuer.

## Vérifier une véritable exécution

### Vercel

1. Ouvrir le projet → Settings → Cron Jobs. Cliquer une fois sur **Run**.
2. Cliquer **View Logs**, vérifier le filtre
   `requestPath:/api/cron/supabase-keepalive` et l'environnement Production.
3. Dans l'heure qui suit, ouvrir la requête : attendre HTTP 200 et les événements
   `supabase.keepalive.started`, `supabase.keepalive.succeeded`, puis
   `supabase.keepalive.monitor` avec **`status: "sent"`**.
4. Noter l'heure UTC, le `runId`, le `host` de début et, si présent,
   `upstreamRequestId`. Le statut HTTP seul ne prouve pas l'envoi au moniteur.
   `disabled` signifie variable absente ; `failed` indique la raison du problème.
5. Les jours suivants, vérifier une **exécution automatique** entre 09 h et
   10 h UTC. Un test manuel prouve la route, pas le déclenchement planifié.
   Les logs Vercel sont courts sur Hobby : consulter Healthchecks pour l'historique.

### Supabase

1. Ouvrir « Mariage Julie et Damien » et vérifier son project ref : il doit
   correspondre au sous-domaine du `host` journalisé par Vercel.
2. Ouvrir **Logs**, sélectionner la fenêtre UTC de l'exécution et le type
   **API Gateway** (ou PostgREST pour les événements du service). Filtrer par
   méthode **GET**, chemin (**Pathname**)
   **`/rest/v1/guest_routes`**, paramètres **`select=id&limit=1`**, statut réussi.
   Si l'interface ne présente pas les paramètres, vérifier le chemin, l'heure et
   l'identifiant de requête lorsqu'il est disponible.
3. Rapprocher les identifiants et horaires des deux services. Un changement du
   `runId` seul prouve une invocation ; le log API Supabase prouve son arrivée.
4. Une table vide peut renvoyer `[]` : cela reste une vraie lecture. Il n'est
   jamais nécessaire de créer une ligne de ping ou une réponse d'invité.

### Surveillance et réaction

1. Vérifier un événement de succès dans Healthchecks à la même heure. Le lien de
   ping ne reçoit ni clés Supabase, ni secret du cron, ni données d'invités.
2. Tester la destination de notification avec le bouton de test de Healthchecks.
   Pour vérifier une absence de signal sans interrompre la production, créer un
   contrôle de test séparé avec une courte période/grâce, envoyer son premier
   signal puis attendre son échéance. Ne pas changer le cron du mariage.
3. En cas d'alerte, consulter Vercel rapidement : 401 = secret/autorisation ;
   `configuration_error` = configuration serveur ; `upstream_http_error` =
   statut Supabase en échec ; `upstream_timeout` = réponse trop lente ;
   `invalid_upstream_response` = réponse inattendue ; absence de logs = chercher
   cron désactivé, ordonnanceur, protection ou indisponibilité Vercel.
4. Si le projet est en pause, le restaurer manuellement puis relancer **Run**.
   Ne pas se contenter de relancer un GET en boucle.

## Validation locale reproductible

Depuis `mariage/` :

```sh
npm run lint
npm run build
node tests/keepalive-monitor.mjs
node tests/keepalive-http.mjs
```

Le test HTTP démarre Next.js en mode production avec une fausse API PostgREST
locale. Il contrôle les 401, les configurations absentes, l'unique GET avec
LIMIT 1 à chaque appel, les réponses vides, les statuts 401/403/503 amont, les
réponses invalides, le délai maximal, l'absence de cache, de fuite et d'écriture.
Le test du moniteur vérifie le signal après SELECT, `/fail`, la destination
autorisée et les pannes de surveillance. Aucun test n'utilise les données ou
secrets de production ; aucun ping réel n'est envoyé à Healthchecks.

Résultats le 11 octobre 2026 : **lint réussi**, **build réussi**, **test HTTP
réussi**, **test de surveillance réussi**. La route reste dynamique dans le
build Next.js. Les six fichiers de ce changement concernent exclusivement le
keep-alive, sa configuration, son audit et ses tests ; les fonctionnalités du
mariage et l'administration sont inchangées.

## Sources officielles vérifiées le 11 octobre 2026

- [Supabase : mise en production et pause Free](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase : consulter et filtrer les logs](https://supabase.com/docs/guides/observability/logs)
- [Vercel Cron : restrictions Hobby](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel Cron : secret, erreurs, livraison et vérification](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel : rétention des logs runtime](https://vercel.com/docs/logs/runtime)
- [Healthchecks : forfait gratuit](https://healthchecks.io/pricing/)
- [Healthchecks : fonctionnement et initialisation](https://healthchecks.io/docs/)
- [Healthchecks : calendrier, fuseau et grâce](https://healthchecks.io/docs/configuring_checks/)
