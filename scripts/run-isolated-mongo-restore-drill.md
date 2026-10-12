# Restauration MongoDB sur WSL avec Docker isolé

Agent-Contribution: backend | restauration chiffrée sur un MongoDB jetable et audit des index avant démarrage de l’application

Ce script constitue la première étape du test de reconstruction. Il restaure
une sauvegarde réelle sur la machine WSL, distincte du droplet production.
Il ne reconstruit ni ne démarre encore le backend ou le frontend.

```bash
cd /home/plasante/DockerVS/ClinIA
bash scripts/run-isolated-mongo-restore-drill.sh \
  /home/plasante/clinia-restore-drill/20261012/clinia-prod-20261012-051502.archive.gz.age \
  /home/plasante/.config/clinia-backup-age/clinia-backup.key
```

Le script refuse les endpoints Docker TCP/SSH et ne charge aucun `.env`.
Il crée un conteneur neuf `clinia-restore-UUID` avec `--network none`, sans port
publié. MongoDB utilise des tmpfs et un replica set d’un membre pour permettre
ultérieurement les transactions du backend. Ce n’est pas un test HA MongoDB.
Le conteneur sans réseau n’exige pas de compte production. Le nom de la base
cible est fixé à `clinia_restore_test`; seuls les namespaces `clinia.*` de
l’archive sont sélectionnés. Il n’y a pas de `--drop` sur une base existante.

Le checksum est vérifié sans dépendre du chemin original contenu dans le
fichier `.sha256`. La clé age reste sur WSL, avec permissions `600`; elle
n’est ni copiée dans le conteneur ni transmise à un service externe.
Le flux déchiffré passe directement sur stdin de `mongorestore --archive
--gzip`, sans archive déchiffrée sur disque. `--stopOnError` interrompt la
restauration lorsqu’une erreur est rencontrée. Les index sont restaurés depuis
les métadonnées de l’archive, sans `--noIndexRestore`. Voir la
[documentation officielle mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/).

Le moniteur TTL est désactivé uniquement dans ce conteneur de test pour
préserver les documents expirés durant l’audit; les définitions TTL sont
conservées. Il ne s’agit pas d’une configuration à appliquer à la production.
Voir les [paramètres MongoDB](https://www.mongodb.com/docs/manual/reference/parameters/#mongodb-parameter-param.ttlMonitorEnabled).

Avant toute connexion applicative, le helper exécute `validate({full:true})`
sur chaque collection et vérifie les noms, l’ordre des clés, l’unicité et les
filtres partiels des trois index critiques :

- RAMQ : `owner_health_insurance_number_unique_idx` sur patients;
- rendez-vous : `patient_date_time_scheduled_unique`;
- garde de réservation : `patient_specialist_day_unique`.

Il refuse un index critique absent, incorrect, sparse ou hidden. Le dossier
`restore-evidence.XXXXXXXX`, créé à côté de l’archive avec permissions `700`,
contient les logs privés, le nombre de documents par collection, les index et
l’identifiant de l’image MongoDB réellement utilisée. Ne pas envoyer les logs
bruts dans le chat : une erreur d’outil peut inclure des valeurs de documents.
La sortie terminal est limitée aux étapes et résultats techniques.

Le résultat attendu est `ISOLATED_RESTORE_PASSED` avec trois index critiques
conformes. Le conteneur est conservé pour la reconstruction du backend. Les
tmpfs sont volatils : ne pas arrêter ce conteneur avant cette étape.
En cas d’échec ou d’interruption, le script tente de retirer uniquement son
conteneur, après vérification du label de propriété. Les logs privés restent
disponibles dans le dossier de preuves. Une coupure brutale de la session ou du
daemon peut nécessiter un nettoyage manuel du conteneur nommé dans Docker.

La validation complète par rapport aux schémas de l’application, le SHA et
les dépendances du backend reconstruit, la compilation frontend et les contrôles
HTTP restent des étapes suivantes. Une restauration réussie ne garantit pas
que les comptes, MFA ou données chiffrées sont utilisables sans les clés
applicatives de récupération. Aucun secret production n’est nécessaire pour
le contrôle initial des index.

Le script ne compare pas les comptes restaurés à la base production actuelle :
elle peut avoir changé depuis la sauvegarde. La validité des collections et
les trois contraintes critiques sont contrôlées; l’identité exacte de toutes
les définitions d’index avec une photographie source nécessite des métadonnées
source correspondantes. MongoDB 7 est reconstruit depuis `mongo:7`; l’image
locale réelle est consignée, sans affirmation de digest identique à production.

## Résultat vérifié le 12 octobre 2026

Restauration réelle sur WSL : 31 collections valides, trois index critiques
conformes et MongoDB 7.0.43. Reconstruction sans cache depuis une extraction
Git propre de `d19ee7cc75e35c83b8ee24b049c78e18a33950d3`. Audit dans l’image
backend avant démarrage : 23 collections conformes, aucune erreur ou extra,
métadonnées et comptes inchangés pendant l’audit. Backend et frontend démarrés
sans port/egress, frontend et readiness backend/proxy HTTP 200, deux assets
chargés. Conteneurs et secrets temporaires retirés à la fin. Voir
[le compte rendu](../docs/production-validation-20261012.md).

`audit-isolated-rebuilt-backend.mjs` s’exécute en mode `node --input-type=module
--eval CODE SHA` dans l’image backend, avec namespace réseau du MongoDB isolé.
Il emploie exclusivement l’URI localhost fixe de `clinia_restore_test`, impose
le SHA et les versions, désactive toute création d’index/collection puis importe
l’audit des modèles du code reconstruit.

`check-isolated-rebuild-http.mjs` contrôle uniquement readiness et les assets
publics locaux; aucun dossier patient n’est récupéré. Son rapport est écrit
dans `/tmp/clinia-rebuild-http.json`. Prévoir un tmpfs `/tmp` avec mode `1777`
pour l’utilisateur non privilégié du conteneur. La fin du conteneur de contrôle
et son code de sortie doivent être vérifiés avant de récupérer le rapport.

Ce résultat ne couvre ni la restauration des clés MFA production ni la
reconstruction complète de la topologie HA; il valide le démarrage applicatif
sur les données restaurées et les contraintes d’index. Les clés originales
restent sur le poste de récupération, hors Docker et du dépôt.
