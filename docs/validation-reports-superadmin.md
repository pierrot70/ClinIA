# Rapports de validation SUPERADMIN

## Périmètre

Navigation SUPERADMIN : **Rapports de validation → Tests de concurrence → Prise de rendez-vous Walk-In**,
sur ordinateur et mobile, avec labels versionnés dans les neuf langues.
La catégorie actuelle utilise `/admin/validation-reports/concurrency/walk-in` ; les anciens
chemins `/admin/validation-reports` et `/admin/validation-reports/concurrency` y redirigent. Toutes ces routes restent protégées
SUPERADMIN. Cette catégorie conserve tous les rapports walk-in existants ; aucun
fichier archivé n'est modifié. Les futures familles de validation devront avoir
leur propre catégorie et un format identifié, sans être mélangées à celle-ci.

La liste affiche une ligne repliable par hash complet, fermée par défaut, avec
le nombre d'exécutions et d'échecs éventuels.
La ligne affiche aussi la date et l'heure de fin de la dernière exécution,
dans le fuseau America/Toronto (heure d'été/hiver), selon la langue sélectionnée.
Déplier un commit conserve toutes ses exécutions, de la plus récente à la plus ancienne, avec leurs avertissements
et téléchargements individuels. Aucun rapport n'est supprimé par ce regroupement.

API en lecture seule :

- `GET /api/validation-reports` : version de l'image et liste des exécutions ;
- `GET /api/validation-reports/:uuid/pdf` : rapport PDF ;
- `GET /api/validation-reports/:uuid/bundle` : dossier de preuves JSON.

Chaque consultation/export doit écrire un `ValidationReportAudit` (utilisateur,
action, timestamp, IP, identifiant d'exécution et format). Une panne d'audit
bloque l'export. Aucun accès aux collections patients, aucune création de test
depuis la page, aucun téléversement HTTP, aucune transmission automatique.

Le PDF est en anglais afin de garder une présentation d'audit stable. La page
est traduite dans les neuf langues. Le dossier JSON contient, en base64, le PDF,
le rapport JSON, les résultats JUnit XML et les événements JSONL minimisés, avec
une empreinte SHA-256 pour chaque fichier. Il ne contient pas les erreurs brutes,
les noms de tests libres, les chemins locaux, les requêtes ou les jetons.

## Génération locale ou CI

Le rebuild staging lance automatiquement la génération après les tests unitaires :

```bash
./rebuild-local.sh staging
```

Le rapport est écrit dans `./validation-artifacts`, monté en lecture seule dans
les backends staging. Dans le UI : SUPERADMIN → Rapports de validation → Actualiser.
Un échec de validation arrête le script avec un code non nul, sans annoncer
« Staging ready » ; le rapport d'échec reste consultable s'il a pu être écrit.
Si une étape précédente du rebuild échoue, cette génération n'est pas atteinte.

Pour générer uniquement un rapport, sans reconstruire staging :

```bash
npm --prefix backend run test:validation-report
```

Prérequis identiques au test walk-in : Docker local, image `mongo:7` déjà
disponible et dépendances backend installées avec `npm ci`. Cette commande
ne lit pas le `.env` et ne se connecte jamais à MongoDB applicatif.

Les rapports sont écrits avec un UUID et sans écrasement dans
`validation-artifacts/` (ignoré par Git), ou `CLINIA_VALIDATION_REPORT_DIR`.
Les échecs de tests/préparation produisent aussi un rapport incomplet ; un
processus tué brutalement ou un disque plein peut empêcher sa génération.
La confirmation de nettoyage vient du lanceur après retrait du conteneur.

Le commit est lu avant l'exécution. Des changements locaux avant/après les tests
ou un changement de HEAD marquent le rapport `dirty`. Un rapport dirty ne peut
pas prétendre correspondre au seul commit, même si tous les tests passent.
Après un commit propre, relancer pour obtenir la preuve rattachée à ce commit.

En Docker local, les fichiers sont montés depuis `./validation-artifacts` en
lecture seule. Les images de développement n'embarquent pas de commit de
production : une version inconnue y est normale. Ne pas fabriquer un hash
d'image pour faire disparaître cet avertissement.

CI archive automatiquement le JSON avec `actions/upload-artifact`, y compris
sur échec. Elle ne publie pas automatiquement de fichiers vers la production.

## Conservation et accès

Politique opérationnelle des preuves techniques (aucune donnée clinique) :

- Artefacts GitHub Actions : 30 jours, configurés dans `ci.yml`. Le dépôt étant
  public, considérer ces preuves techniques comme publiques : uniquement les
  résultats minimisés des scénarios synthétiques, jamais de données de STAGING,
  de production, de comptes réels ou de journaux bruts. Les archives privées et
  audits d'exploitation ne doivent pas être joints aux artefacts de ce dépôt.
- Rapports servis par Coolify : 90 jours en ligne, avec un plafond de 900 fichiers
  pour garder une marge sous la limite technique de 1000. À chaque publication,
  l'administrateur archive les plus anciens hors du répertoire servi si nécessaire.
- Archives techniques : 365 jours après la fin du test, avec empreintes et
  provenance CI conservées. Conserver les preuves du déploiement actif et du
  précédent déploiement, ainsi que toute preuve sous gel d'incident, même si
  cette durée est dépassée. Purger seulement après vérification de ces exceptions.
- Audits de consultation/export : 365 jours, accessibles aux seuls responsables
  sécurité autorisés. Les gels d'incident suspendent également leur purge.
- Le volume applicatif reste en lecture seule pour UID/GID 10001 ; seul
  l'administrateur de déploiement publie ou archive. SUPERADMIN lit/exporte via
  les routes auditées, sans accès aux dossiers patients.

Seule la durée des artefacts CI est automatisée ici. L'archivage Coolify et la
purge des audits doivent être appliqués par l'exploitation avec une trace des
identifiants d'exécution et empreintes concernés. Ces durées sont des choix
d'exploitation, pas une affirmation de durée légale de conservation.

## Publication dans Coolify (administrateur de déploiement)

1. Dans Advanced, activer **Include Source Commit in Build**. Le Compose transmet
   `SOURCE_COMMIT` au Dockerfile backend ; celui-ci écrit `build-revision.json`
   dans l'image. Il faut le hash complet du checkout choisi par Coolify, jamais
   une valeur manuelle figée sur un ancien commit.
2. Le runtime lit exclusivement ce fichier dans l'image. Un `SOURCE_COMMIT`
   modifié dans les variables d'exécution ne change pas la version déclarée.
   Si la valeur manque, l'UI affiche une version inconnue, sans correspondance.
3. Sur l'hôte Coolify, préparer `/var/lib/clinia/validation-reports` lisible et
   traversable par UID/GID `10001`. Le Compose monte ce répertoire **en lecture
   seule** dans les deux backends. Seul l'administrateur de déploiement doit
   pouvoir y écrire. Ne pas y mettre d'autres documents.
4. Récupérer l'artefact CI du commit concerné (ou une exécution locale propre),
   vérifier sa provenance, puis publier le fichier `<runId>.json` sous ce nom.
   Copier d'abord sous un nom temporaire puis renommer atomiquement, sans
   écraser une exécution déjà archivée. Ne pas publier le bundle comme rapport :
   la source attendue est le JSON produit par la commande de validation.
5. Se connecter comme SUPERADMIN et actualiser. Comparer le hash complet affiché
   avec celui du déploiement Coolify. La correspondance de code et le succès des
   tests sont affichés séparément : un rapport en échec peut concerner le même
   commit. Le frontend ne fournit pas le hash au backend.

Documentation Coolify :
https://coolify.io/docs/applications/build-packs/docker-compose
(SOURCE_COMMIT exclu des builds par défaut ; activation requise).

## Transmission au vérificateur

Télécharger le PDF et le dossier de preuves depuis la page, puis les transmettre
par le canal choisi par l'organisation. Lecture du PDF sans outils techniques.
Vérification des empreintes, sans Docker ni base de données :

```bash
node scripts/verify-validation-bundle.mjs /chemin/clinia-validation-UUID.json
```

## Limites

- Le rapport porte actuellement sur les **21 tests d'intégration walk-in**,
  dont les 18 scénarios multi-RECEPTION des six points. Ce n'est pas le résultat
  global de toutes les suites frontend/backend, ni une certification Loi 25/PIPEDA.
- Les traces minimisées attestent le résultat des assertions et les durées ;
  elles ne contiennent pas les échanges HTTP bruts ni le contenu des documents.
- Les résultats viennent d'un serveur de test isolé et d'un replica set mono-nœud,
  pas du déploiement Coolify, d'une charge prolongée ou d'une bascule multi-instance.
- Les audits métier peuvent conserver des IDs internes pseudonymisés ; aucun
  de ces IDs n'est exporté dans ce rapport.
- Les empreintes détectent les altérations par rapport au manifeste fourni ;
  elles ne constituent pas une signature. La chaîne de confiance repose sur
  l'artefact CI/la provenance de l'exécution et le contrôle du répertoire publié.
- Archives limitées à 1000 rapports par répertoire ; au-delà, API indisponible
  explicitement, sans sélection silencieuse. Appliquer la politique ci-dessus
  avant d'atteindre ce plafond.
- Rien n'a encore été configuré ni déployé sur Coolify par cette implémentation.

## Vérifications réalisées pendant le développement

- Exécution isolée réelle : 21/21 tests, nettoyage confirmé, rapport marqué dirty.
- Échec de préparation simulé : rapport incomplet conservé, sortie non nulle.
- PDF analysé avec `pdfinfo` et `pdftotext`, empreintes du bundle vérifiées.
- Tests API : autres rôles refusés, audit obligatoire pour lire/télécharger.
- Suite backend complète : 579/579 tests réussis.
- Tests de format : révision d'image, conflits de version, dirty, archives
  invalides/liens symboliques, données libres refusées, preuves incomplètes.
- Frontend : 1136 tests réussis ; build Vite réussi. Le contrôle `tsc --noEmit`
  global échoue dans d'autres modules ; ne pas confondre le build Vite avec
  un contrôle TypeScript global réussi.
