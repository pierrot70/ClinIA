# Rapports de validation SUPERADMIN

## Périmètre

Navigation SUPERADMIN : **Rapports de validation → Tests de concurrence → Prise de rendez-vous Walk-In**,
sur ordinateur et mobile, avec labels versionnés dans les neuf langues.
Depuis le commit `3171013`, ce menu est également visible en production distante
pour SUPERADMIN. La restriction de rôle sur les routes et l'API est conservée.
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

La validation complète se lance depuis la racine, avant commit/push :

```bash
bash scripts/ci-local.sh
```

Elle exécute les installations verrouillées, audits au seuil high/critical,
suites frontend/backend, régression auth, build frontend et intégration sur
MongoDB jetable. Elle exige Node 24, Docker local et l'accès aux registres.
Le rapport JSON porte uniquement sur les 21 scénarios d'intégration, même
lorsqu'il est produit par ce CI complet.

Le rebuild staging appelle ce même CI une seule fois, avant l'arrêt et la
reconstruction des conteneurs :

```bash
./rebuild-local.sh staging
```

Le rapport est écrit dans `./validation-artifacts`, monté en lecture seule dans
les backends staging. Dans le UI : SUPERADMIN → Rapports de validation → Actualiser.
Un échec de validation arrête le script avec un code non nul, sans annoncer
« Staging ready » ; le rapport d'échec reste consultable s'il a pu être écrit.
Si une étape précédente du rebuild échoue, cette génération n'est pas atteinte.
Les contrôles de disponibilité après redémarrage restent distincts du CI.
Les hooks Git ne lancent pas automatiquement la validation complète.

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

GitHub Actions est déclenché uniquement manuellement (`workflow_dispatch`) :
les push et pull requests ne lancent plus ce workflow. Lorsqu'il est lancé,
il appelle les mêmes étapes et archive le JSON disponible avec
`actions/upload-artifact`, y compris sur échec. Une exécution locale ne produit
pas d'artefact GitHub. Aucun de ces chemins ne publie automatiquement vers
Coolify ; cette automatisation est reportée par l'utilisateur.

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

Seule la durée des artefacts GitHub produits par le workflow manuel est
automatisée ici. L'archivage Coolify et la
purge des audits doivent être appliqués par l'exploitation avec une trace des
identifiants d'exécution et empreintes concernés. Ces durées sont des choix
d'exploitation, pas une affirmation de durée légale de conservation.

### Copie privée des preuves hors du poste

Le 20 septembre 2026, un ensemble de preuves du 19 septembre a été archivé
hors du dépôt, puis sauvegardé sous forme de tar.gz chiffré avec `age` dans
le préfixe S3 `technical-evidence/2026-09-19/`, distinct des sauvegardes MongoDB.
Il comprend six preuves (journal CI, résultat et script de restauration isolée,
deux rapports JSON et transcription utilisateur du basculement), un README,
un manifeste de provenance et un fichier d'empreintes. Les neuf fichiers ont
été comparés aux sources après déchiffrement local. L'utilisateur a confirmé
l'envoi avec ACL privée et le retéléchargement depuis S3 avec empreinte conforme.
Les identifiants de rapports et l'empreinte de l'archive sont consignés dans
[PROJECT_STATE.md](../PROJECT_STATE.md).

Cette archive privée contient des informations d'exploitation ; elle ne doit
pas être publiée dans GitHub ni placée dans le répertoire de rapports servi
par l'application. Aucun fichier de sauvegarde MongoDB, clé privée ou fichier
de configuration secrète n'y a été inclus. Les originaux ont été conservés.
Le journal de basculement est une transcription fournie par l'utilisateur,
pas une nouvelle récupération du journal original sur le Droplet.

La clé de déchiffrement est conservée séparément. Une copie USB de cette clé,
chiffrée par phrase secrète, a été déchiffrée et comparée à l'original avec
succès par l'utilisateur. La phrase doit rester récupérable sans le poste,
séparément du support. Aucune clé ni phrase secrète ne doit être consignée
dans la documentation, le dépôt ou les journaux.

La copie S3 vérifiée protège contre la perte du seul poste. Elle ne prouve
pas une protection contre la suppression ou la compromission du compte S3.
Aucune règle de conservation ni protection contre la suppression n'a été
configurée ou vérifiée lors de cet envoi. L'application de la politique
ci-dessus reste ouverte ; ne pas purger automatiquement sans tenir compte
des versions active/précédente et des gels d'incident.

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

Après un nouveau déploiement, un ancien rapport peut afficher « version déployée
non couverte ». C'est une différence de commit, pas un échec des tests : conserver
le rapport historique et produire/publier séparément une preuve propre du
nouveau commit. Ne pas modifier le SHA d'un ancien rapport pour le faire correspondre.

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
- La consultation et le menu ont été vérifiés dans Coolify le 19 septembre ;
  les téléchargements PDF/JSON et le contrôle d'accès avec d'autres rôles
  en production ne sont pas confirmés par ces observations.

## Observations opérationnelles des 19 et 20 septembre 2026

- Option de construction du SHA activée ; `beb527c` lu dans les deux images
  backend. Montage des rapports `RW=false`, processus sous UID/GID 10001.
- Rapport `55957d49-617f-4887-b68d-5b68509f9dde` publié après comparaison
  d'empreinte, consulté en SUPERADMIN avec correspondance à `beb527c` : 21/21,
  `dirty: false`, nettoyage confirmé.
- Après déploiement de `3171013`, menu visible et nouveau SHA affiché ; ancien
  rapport conservé avec avertissement de différence de version.
- Copie chiffrée des preuves retéléchargée depuis S3 et vérifiée le 20 septembre.
  Ces observations ne constituent pas un nouveau test de santé de la production.

## Vérifications historiques réalisées pendant le développement initial

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
