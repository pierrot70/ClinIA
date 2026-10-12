# Vérification production — 12 octobre 2026

Preuves : sorties du droplet `clinia-coolify` fournies par l'utilisateur.
Version des deux backends : `0efdeb21957ef749368ebee57e144aab4e7e02d9`.

Les vérifications en lecture seule depuis le backend principal et la réplique
confirment les clés, l'unicité et les filtres partiels attendus :

- `patients.owner_health_insurance_number_unique_idx` : propriétaire, pays,
  juridiction et numéro normalisé ; filtre sur les numéros de type chaîne.
- `appointments.patient_date_time_scheduled_unique` : patient, date et heure ;
  filtre sur le statut `scheduled`.
- `appointmentbookingguards.patient_specialist_day_unique` : patient,
  spécialiste et date ; index unique sans filtre partiel.

Une archive chiffrée est présente à
`/var/backups/clinia/mongo/clinia-prod-20261012-051502.archive.gz.age`.
La sortie fournie par l'utilisateur confirme une taille de 390142 octets,
des permissions 640, `sha256=ok`, `encryption=age`, `age_header=ok` et
`backup_verification=ok`. Aucun déchiffrement ou essai de restauration n'est
attesté par cette sortie.
Le test concurrent a réussi via `https://clinique-ai.ca` sur la version
réellement déployée. L'utilisateur a fourni la sortie du run
`4a8b475a-9162-4b20-b770-a3e3fe7fb0b2` :

```text
LOGIN_OK
LOOKUP_OK exact synthetic patient
LOOKUP_PROOFS_OK distinct=2
CONCURRENT_RESPONSES A=409 B=201
CONCURRENT_REFUSAL HTTP=409 RECEPTION_REPLAN_REQUIRED
BOOKING_DB_OK count=1
LOGOUT_OK
CLEANUP_OK operational_fixtures=0 audits=retained
RECEPTION_BOOKING_CONCURRENCY_PASSED
```

Le point P1 « vérifier les index RAMQ et rejouer une réservation concurrente
dans la version réellement déployée » est validé par ces résultats.

## Préparation du test concurrent

Le script historique `run-production-appointment-race-drill.sh` fabrique un
JWT avec `sid: null`, incompatible avec les sessions actuelles. Le mode
`--concurrent` ajouté au parcours `run-reception-booking-smoke.sh` utilise
une vraie connexion RECEPTION, deux recherches RAMQ avec preuves distinctes,
puis deux demandes de réservation lancées en parallèle via l'URL publique.
Le patient et le créneau appartiennent aux seules fixtures synthétiques du
test. Le script attend les deux réponses avant de vérifier et nettoyer.

Attendus : statuts 201 et 409, refus `RECEPTION_REPLAN_REQUIRED`,
`BOOKING_DB_OK count=1`, `CLEANUP_OK operational_fixtures=0 audits=retained`
puis `RECEPTION_BOOKING_CONCURRENCY_PASSED`. Le refus est celui du parcours
réception actuel, qui recontrôle les rendez-vous après sérialisation sur le
patient. Les définitions d'index ont été contrôlées séparément. Le test
ne prouve pas un basculement ni la répartition des requêtes entre les backends.

Validation locale : huit tests d'intégration réussis sur MongoDB jetable,
avec une barrière imposant le chevauchement des deux requêtes, des preuves
distinctes et une simulation d'erreur amont 504 ; nettoyage confirmé. Cette
validation locale complète le résultat production consigné ci-dessus.

## Inventaire S3 et rétention restant à appliquer

Sorties du droplet fournies par l'utilisateur : fournisseur DigitalOcean
Spaces, endpoint `https://nyc3.digitaloceanspaces.com`, bucket
`clinia-backups`, sauvegardes MongoDB sous `mongo/prod/`. Cette configuration
est indépendante de la liste des stockages dans Coolify.

La clé habituelle reçoit `AccessDenied` pour la lecture Lifecycle. Une clé
administrative temporaire correctement saisie reçoit HTTP 404 avec
`NoSuchLifecycleConfiguration` : aucune configuration Lifecycle n'est attestée
comme existante. AWS CLI 2.35.11 masque cette réponse par une erreur `NoneType` ;
le code S3 a été extrait d'un diagnostic privé supprimé après lecture.

L'inventaire du préfixe `technical-evidence/` contient seulement le dossier
`2026-09-19/` et deux objets :

- `clinia-evidence-20260919-review-20260920T125023Z.tar.gz.age` : 6964 octets,
  envoyé le 20 septembre 2026 à 13:08:16.893 UTC.
- Son fichier `.sha256` : 126 octets, envoyé à 13:08:18.947 UTC.

La provenance documentée décrit neuf fichiers dans l'archive, et non neuf
objets S3. Elle comprend des essais de restauration et de basculement ainsi
que des rapports d'intégration ; leurs limites figurent dans PROJECT_STATE.md.
Six mois calendaires après le 19 septembre donnent le 19 mars 2027. Cette
échéance reste indicative tant que les exceptions de conservation ne sont
pas tranchées : l'utilisateur ne sait pas encore si l'archive doit être
préservée pour un incident ou le déploiement actif/précédent. Aucun changement
Lifecycle ni suppression n'a été effectué. Le point P2 reste ouvert.

### Reprise de la rétention après restauration isolée

Le 12 octobre, l'utilisateur a explicitement confirmé que l'archive du
19 septembre peut expirer le 19 mars 2027 : les exceptions mentionnées
ci-dessus sont levées pour ce lot. La règle préparée cible exclusivement
`technical-evidence/2026-09-19/` avec une date UTC, sans expiration ajoutée
pour les sauvegardes MongoDB ou les autres lots.

Le script `scripts/configure-technical-evidence-retention.py` prépare puis,
avec `--apply`, applique la configuration en préservant les règles existantes.
Il vérifie les deux objets attendus, refuse les erreurs d'accès ambiguës et
relit toutes les règles après application. Cinq tests locaux ont réussi
(préservation/idempotence, conflit d'ID, changement d'inventaire, distinction
entre absence Lifecycle et refus d'accès, contrôle du terminal sans accès seek). Ils utilisent des réponses simulées,
pas le bucket réel.

La session de l'agent ne dispose pas de l'accès SSH du WSL au droplet
(`Permission denied`). Le transfert et l'exécution distante sont donc à faire
par l'utilisateur. Celui-ci a ensuite fourni le résultat distant :

```text
EVIDENCE_DIR=/root/clinia-s3-retention-7c_8tqn2
PLAN_OK objects=2 prefix=technical-evidence/2026-09-19/ expiration_utc=2027-03-19T00:00:00Z mongo_excluded=true
LIFECYCLE_APPLIED
S3_RETENTION_VERIFIED expiration=2027-03-19 existing_rules_preserved=true objects_present=2
```

La configuration Lifecycle est donc appliquée et vérifiée en lecture retour
pour ce lot autorisé. Les règles existantes sont préservées ; la règle ajoutée
exclut MongoDB. Les deux objets sont toujours présents. Le contrôle initial
du terminal a été corrigé (`r` au lieu de `r+`) avant la saisie des clés et
l'application. L'expiration future effective n'est pas encore observable.
Le point P2 est terminé pour le lot inventorié ; chaque nouveau lot doit
faire l'objet de la même revue des exceptions et d'une échéance calendaire.

## Préparation de la mesure de basculement

L'utilisateur a fourni le nouvel état du déploiement : les backends
`backend-gko400wwcs44csw8000o0sss-135151443999` et
`backend-replica-gko400wwcs44csw8000o0sss-135151526784` sont healthy.
Les conteneurs MongoDB `mongo-gko400wwcs44csw8000o0sss-135151368986`,
`mongo-replica-1-gko400wwcs44csw8000o0sss-135151387976` et
`mongo-replica-2-gko400wwcs44csw8000o0sss-135151417022` sont démarrés ;
leurs rôles et état de réplication restent à relever. Readiness publique :
HTTP 200, MongoDB connecté, durée curl 0.141476 seconde. Le SHA de ces
nouveaux conteneurs n'a pas encore été fourni.

Le nouveau mode `--observe-seconds` conserve une réservation synthétique
acquittée, relit son identifiant par le parcours réception et produit un
journal de statuts/durées sans données patient ni secrets. Après la fenêtre,
il recontrôle le même rendez-vous en base. Les résultats ambigus conservent
les mécanismes de récupération. Onze tests d'intégration locaux réussis,
nettoyage MongoDB jetable confirmé. Aucun basculement sur ce nouveau
déploiement n'est encore attesté. Il s'agit d'un instrument pour une écriture
acquittée et un parcours authentifié ; ce n'est pas une mesure de RPO général.

Première référence production, run `22351c6b-cb1b-4a48-a555-d1e3bb14c289` :
connexion, recherche curl, réservation 201 et refus du rejeu réussis. La
première version de l'observateur utilisait urllib et a reçu 15 refus HTTP 403
sur 15 requêtes ; leur code applicatif n'avait pas été conservé. Le même
rendez-vous a été confirmé en base après la fenêtre, sans doublon, puis
`CLEANUP_OK`. Aucun arrêt de service n'a eu lieu. Ce résultat ne valide pas
le trafic authentifié et ne doit pas être présenté comme une interruption
mesurée lors d'un basculement.

Correction préparée : utiliser le même client curl, le même Origin et les
mêmes fichiers d'autorisation et de requête que la recherche initiale. Le
journal ajoute seulement un code d'erreur technique connu pour faciliter
le diagnostic si le refus persiste. La cause exacte des 403 urllib n'a pas
été établie avec cette seule sortie production.

Référence corrigée fournie par l'utilisateur, run
`155219a2-4e34-4e9d-b321-8cef46519ab6` : quinze lectures sur quinze HTTP 200,
même rendez-vous à chaque lecture, zéro échec, aucune fenêtre d'interruption
observée. Durées entre 139.7 et 264.9 ms. Acquittement de la réservation à
14:58:58 UTC (10:58:58 America/Toronto), contrôle du même rendez-vous en base,
logout et nettoyage opérationnel confirmés. La dernière ligne de succès est
tronquée dans la sortie fournie ; les contrôles et `CLEANUP_OK` sont complets.
Ce résultat valide la référence du parcours d'observation, sans panne provoquée.

Fenêtre backend préparée : SHA épinglé, santé des deux backends et trois rôles
MongoDB contrôlés avant arrêt ; arrêt de vingt secondes du seul principal,
événements UTC et reprise sur interruption. Syntaxe Bash et trois simulations
Docker réussies, dont reprise après échec de stop. Aucun arrêt production
n'est encore attesté.

Tentative de fenêtre backend : les deux nouveaux backends ont été confirmés
au SHA `9acb2908f3be6d7d1573732b627e08775c472a4a`. La commande s'est arrêtée
après ces contrôles, avant `MONGO_PREFLIGHT_OK` et les événements d'arrêt.
Aucun arrêt provoqué n'est attesté par cette sortie. L'observation associée,
run `153d8b10-fed8-4ceb-be50-2b870600377a`, affiche 113 lectures HTTP 200
avec le même rendez-vous, puis une interruption clavier. Pas de résumé final,
contrôle final de persistance ou nettoyage confirmé pour ce run. Les comptes
ont été désactivés et le répertoire de récupération conservé ; le nettoyage
manuel reste à confirmer. Aucun résultat de basculement n'est revendiqué.

L'utilisateur a confirmé avoir interrompu l'observation, pensant à une boucle
infinie. L'affichage ajoute désormais temps écoulé et restant. La durée reste
bornée à celle passée en argument. Le contrôle préalable est séparé en mode
`--check` et lit `replSetGetStatus` par le driver de la réplique, avec erreur
minimisée au lieu du contrôle mongosh silencieux. Cinq simulations de portes
de contrôle et de reprise réussies ; la lecture réelle de l'état MongoDB sur
le droplet reste à confirmer.

Nettoyage manuel du run interrompu confirmé par l'utilisateur :
`CLEANUP_OK operational_fixtures=0 audits=retained`.
Le contrôle en lecture seule confirme ensuite les deux SHA attendus, mais
`replSetGetStatus` échoue avec code 13 (autorisation refusée au compte
applicatif). Aucun service arrêté. Le contrôle utilise désormais les
identifiants administratifs déjà présents dans le conteneur MongoDB, transmis
par un pipe privé à un processus driver ponctuel dans la réplique backend.
Les droits et la configuration persistante du compte applicatif restent
inchangés. Le contrôle réel des trois membres reste à confirmer.

Contrôle administratif production confirmé ensuite par l’utilisateur avec
le compte `root` et le mot de passe du conteneur : un PRIMARY, deux SECONDARY,
trois membres et `lagSeconds=0`. Les identifiants utilisant le nom
d’initialisation du conteneur et du fichier `.env` avaient échoué avec code 18.
Le script utilise désormais `root` par défaut, avec surcharge explicite
`MONGO_ADMIN_USERNAME`. Aucun changement de compte ou de mot de passe, et
aucun arrêt de service réalisé lors de ces contrôles. Le basculement sous
trafic reste à exécuter.

Fenêtre backend réellement exécutée en production (sortie utilisateur) :
les deux backends au SHA `9acb2908f3be6d7d1573732b627e08775c472a4a`,
MongoDB avec un PRIMARY, deux SECONDARY et retard de deux secondes.
Arrêt demandé à 15:38:54.006 UTC, terminé à 15:38:54.247 ; redémarrage demandé
à 15:39:14.325, terminé à 15:39:14.772 ; les deux backends healthy à
15:39:24.962. Maintien arrêté avant demande de reprise : 20,078 secondes ;
demande d’arrêt jusqu’au retour de santé des deux backends : 30,956 secondes.
Le journal joint du run `55130451-e20f-431a-ac89-d93195d9b91b` est partiel :
50 lectures complètes HTTP 200 avec `booking_unchanged=true`, latences
123,9 à 247,1 ms, puis ligne 51 tronquée. Réservation acquittée à 15:38:44 UTC.
Ces lectures couvrent la fenêtre d’arrêt et la reprise sans échec visible.
Le résumé final des 300 secondes, la persistance finale et le nettoyage ne
sont pas encore fournis ; aucun RTO nul ou résultat global de cinq minutes
n’est revendiqué.

Nettoyage manuel de la première observation interrompue confirmé :
`CLEANUP_OK operational_fixtures=0 audits=retained`.

Deuxième fenêtre backend et observation complète de 120 secondes réussies
en production (sorties utilisateur). Les deux SHA sont
`9acb2908f3be6d7d1573732b627e08775c472a4a` ; MongoDB confirme un PRIMARY,
deux SECONDARY, trois membres et un retard d’une seconde avant l’arrêt.
Événements UTC du 12 octobre 2026 : arrêt demandé à 15:42:45.857, terminé
à 15:42:56.103 ; redémarrage demandé à 15:43:16.169, terminé à 15:43:16.515 ;
les deux backends healthy à 15:43:26.667. Délai de stop : 10,246 secondes ;
maintien arrêté avant demande de reprise : 20,066 secondes ; demande d’arrêt
jusqu’au retour de santé des deux backends : 40,810 secondes. Ce dernier
délai mesure la récupération du conteneur, pas une interruption HTTP.

`TRAFFIC_SUMMARY` : 120 requêtes, zéro échec, 120 succès consécutifs en fin
d’observation, aucun intervalle d’échec observé, aucune réponse ambiguë ou
invalide. `BOOKING_DB_OK count=1`, `BOOKING_PERSISTENCE_OK same_appointment=1
duplicates=0`, `LOGOUT_OK`, nettoyage opérationnel confirmé avec audits
conservés, puis `RECEPTION_BOOKING_SMOKE_PASSED`. Le RUN_ID et le journal
JSONL complet du deuxième run n’ont pas été fournis dans cette sortie.

La fenêtre backend sous trafic et la persistance de cette réservation
acquittée sont validées pour ce parcours et cette cadence d’observation.
Une interruption plus courte que la cadence n’est pas exclue. Aucun
basculement MongoDB, RPO général, restauration des index ou reconstruction
sur hôte isolé n’est revendiqué ; ces travaux restent distincts.

Agent-Review: backend | sorties de version et définitions d'index fournies par l'utilisateur vérifiées
Validation: vérification en lecture seule exécutée sur les deux backends | trois index conformes, SHA attendu
Agent-Contribution: backend | mode concurrent du parcours réception avec authentification réelle et deux preuves distinctes
Validation: bash scripts/run-urgentologist-walk-in-integration.sh --reception-smoke | 8/8 et nettoyage MongoDB jetable confirmé
Validation: production --concurrent | 409/201, deux preuves distinctes, une réservation en base, nettoyage opérationnel confirmé ; sortie fournie par l'utilisateur
Agent-Review: security | inventaire S3 et absence de Lifecycle selon sorties utilisateur ; exceptions de conservation non résolues, aucune expiration activée
Agent-Contribution: backend | observation temporelle du parcours réception et contrôle du rendez-vous acquitté
Validation: bash scripts/run-urgentologist-walk-in-integration.sh --reception-smoke | 11/11, nettoyage MongoDB jetable confirmé
Validation: fenêtre backend | bash -n et trois simulations Docker réussies, sans arrêt de service réel

Validation: production backend sous trafic | 120 requêtes, zéro échec observé, même réservation sans doublon, deux backends healthy, nettoyage confirmé ; sorties utilisateur

Préparation du test de restauration sur WSL Ubuntu, distinct du droplet :
Docker et Compose disponibles, age présent et permissions de la clé 600.
La sauvegarde chiffrée du 12 octobre 05:15 UTC a été copiée avec son checksum
dans un dossier privé hors dépôt. L’utilisateur confirme `SHA256_OK` et
`DECHIFFREMENT_ET_GZIP_OK`. Aucun contenu de clé ou document sauvegardé
n’a été fourni au modèle.

Le nouveau script de restauration utilise un conteneur sans réseau ni port,
un replica set d’un membre et des tmpfs neufs. La suppression TTL est
désactivée dans cette seule cible ; les index TTL restent restaurés.
L’audit avant application valide les collections et les trois index critiques.
La fin des commandes internes est confirmée par un fichier de statut avant
lecture des rapports, afin de ne pas accepter une sortie Docker prématurée.
Test local réel sur archive synthétique : restauration et renommage de base
réussis, trois index unique/partial conformes, document TTL expiré conservé ;
index absent et ordre de clés incorrect refusés. Conteneur synthétique retiré.
La restauration de la sauvegarde réelle et la reconstruction applicative sur
WSL restent à exécuter ; aucune réussite de ces étapes n’est encore revendiquée.

Agent-Contribution: backend | script de restauration isolée et validation avant démarrage applicatif
Validation: restauration synthétique MongoDB sans réseau | restauration, index conformes et deux cas de refus vérifiés, nettoyage confirmé

Restauration réelle confirmée ensuite sur WSL par l’utilisateur :
`ISOLATION_OK network=none published_ports=0 fresh_tmpfs=1 ttl_monitor=disabled`,
`RESTORE_COMMAND_OK`, 31 collections validées, trois index critiques conformes,
MongoDB 7.0.43 et `ISOLATED_RESTORE_PASSED`. Aucun backend n’avait démarré
pendant ce contrôle des index.

L’agent a ensuite pu accéder au même moteur Docker local et réaliser la
reconstruction sans intervention supplémentaire de l’utilisateur. Sources
propres extraites par `git archive` au commit
`d19ee7cc75e35c83b8ee24b049c78e18a33950d3` ; images backend et frontend
reconstruites avec `docker build --no-cache` depuis leurs Dockerfiles production
et lockfiles, sans environnement local dans le contexte. SHA backend gravé
dans `/app/build-revision.json`, vérifié identique. Versions réellement chargées :
Node 24.21.0, Nodemailer 10.0.14, proxy-addr 2.0.8.

Avant application, `audit-isolated-rebuilt-backend.mjs` a contrôlé les index
contre les schémas du code reconstruit : 23 collections auditées, zéro erreur
et zéro index supplémentaire. Un instantané des nombres de documents et
définitions d’index est resté identique avant/après cet audit. `autoIndex` et
`autoCreate` sont désactivés avant l’import des modèles et pendant le démarrage
applicatif ; aucune migration réparatrice ne masque une restauration incomplète.

Démarrage du backend reconstruit et de Nginx réussi dans le namespace réseau
du MongoDB isolé. L’upstream frontend a été adapté de `backend:4000` vers
`127.0.0.1:4000` dans une image de configuration dérivée : aucun réseau Docker
ou port public n’a été ajouté. Racine des services en lecture seule, privilèges
retirés, tmpfs de fonctionnement. Clés JWT/MFA temporaires générées uniquement
pour le drill, IA simulée et récupération courriel désactivée ; aucune clé
applicative production ou connexion SMTP réelle utilisée.

Contrôle HTTP confirmé depuis un conteneur de contrôle partageant ce même
namespace : readiness backend HTTP 200/Mongo connecté, readiness via le proxy
Nginx HTTP 200/Mongo connecté, frontend HTTP 200 et deux assets compilés
(JS/CSS) récupérés avec succès. Les trois conteneurs étaient Running, sans
port publié, avec namespace MongoDB toujours `none`.

Nettoyage réalisé par l’agent après vérification des labels et IDs : frontend,
backend et MongoDB restauré retirés, données tmpfs et secrets runtime
temporaires supprimés. Les sauvegardes chiffrées, la clé age originale et les
preuves privées de restauration sur WSL sont conservées. Les images
reconstruites sans données runtime sont conservées dans Docker.

Le volet restauration des index et reconstruction applicative isolée est
validé pour cette sauvegarde et ce SHA. Le périmètre est un replica set MongoDB
d’un membre, un backend et un frontend ; il ne valide pas la reconstruction
complète de la topologie HA trois MongoDB/deux backends, la restauration de
secrets production ou l’utilisation des MFA chiffrées avec les clés originales.
Aucun RTO de reconstruction ou RPO général n’a été mesuré. La revue clinique
humaine et la rétention S3 avec exceptions restent ouvertes.

Agent-Contribution: backend | reconstruction des images depuis le commit sauvegardé et audit des schémas restaurés
Agent-Review: security | absence de ports/egress, secrets temporaires, index automatiques désactivés et nettoyage des conteneurs vérifiés
Validation: restauration réelle WSL | 31 collections valides, trois index critiques conformes, MongoDB 7.0.43 ; sortie utilisateur
Validation: reconstruction isolée | SHA d19ee7c, versions Node/Nodemailer/proxy-addr attendues, 23 audits index sans erreur ni extra, frontend/assets/proxy readiness HTTP 200, nettoyage confirmé

Identifiants techniques des images reconstruites :

- Backend : `sha256:22074b09612c4bb943d038ba9dfbd77c35a8e64af04883b8e7479064a7af13f2`.
- Frontend compilé : `sha256:16d5993206f55a0de6e6afa8fac62fa5739b12a775520da3408cced89c8cf3b9`.
- Frontend avec upstream local : `sha256:fa75aba4dc5e342bfd5cd76e281d4e7363408533896ea9051deefa2aaeed6ba1`.
