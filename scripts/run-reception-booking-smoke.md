# Parcours RECEPTION par curl, avec nettoyage

À lancer sur l'hôte Coolify, avec Bash, Docker, curl et jq. Le script et son
helper doivent être dans le même dossier. Il utilise les modèles et la
connexion MongoDB de l'image backend déjà déployée : aucun rebuild nécessaire.

Depuis le terminal local WSL à la racine du dépôt :

```bash
scp scripts/run-reception-booking-smoke.sh scripts/reception-booking-smoke-helper.mjs root@138.197.142.207:/tmp/
```

Sur le serveur :

```bash
bash /tmp/run-reception-booking-smoke.sh
```

Pour rejouer deux réservations concurrentes après vérification des index et
d'une sauvegarde récente, copier les deux fichiers locaux à jour puis lancer :

```bash
bash /tmp/run-reception-booking-smoke.sh --concurrent
```

Ce mode obtient deux preuves distinctes par deux recherches RAMQ avant de
lancer les demandes en parallèle. Il exige les statuts 201 et 409 avec
`RECEPTION_REPLAN_REQUIRED`, vérifie une seule réservation en base, effectue
le logout et le nettoyage habituel. La confirmation finale est
`RECEPTION_BOOKING_CONCURRENCY_PASSED`, après `CLEANUP_OK`. Un timeout ou une
réponse amont ambiguë conserve les mêmes mécanismes de désactivation et reprise
que le mode séquentiel. Les deux requêtes passent par l'URL publique ; cela ne
garantit pas qu'elles ont été traitées par des instances différentes.

Validation locale du mode concurrent : huit tests du parcours smoke réussis
sur MongoDB jetable, dont chevauchement forcé des requêtes et erreur amont 504.

Par défaut, URL `https://clinique-ai.ca` et découverte d'un unique conteneur
`backend-` hors `backend-replica-`. Si plusieurs correspondent, préciser :

```bash
BACKEND_CONTAINER=nom-exact BASE_URL=https://clinique-ai.ca bash /tmp/run-reception-booking-smoke.sh
```

## Ce qui est exécuté

1. Readiness publique 200 et MongoDB connecté.
2. Création transactionnelle de cinq objets synthétiques : clinique, compte
   RECEPTION limité à cette clinique, compte MEDECIN, spécialiste et patient.
   Créneau dédié à J+30 ; aucun créneau d'un vrai médecin n'est utilisé.
3. Vraie connexion RECEPTION via curl, recherche de l'identifiant synthétique,
   vérification de l'ID patient renvoyé, puis réservation (201).
4. Rejeu exact de la preuve : 403 `RECEPTION_LOOKUP_REQUIRED` attendu.
5. Vérification MongoDB d'une unique réservation planifiée, puis logout HTTP.
6. Nettoyage transactionnel des objets possédés, compteurs, preuves et sessions,
   puis vérification de leur absence. Historique d'audit conservé.

Les deux dernières confirmations attendues sont :

```text
CLEANUP_OK operational_fixtures=0 audits=retained
RECEPTION_BOOKING_SMOKE_PASSED
```

La préparation et le nettoyage utilisent Docker/MongoDB, car les routes
RECEPTION ne permettent pas l'administration des comptes et cliniques ni leur
purge. La connexion et les opérations métier passent par curl, le proxy public
et les vraies routes déployées. Aucun JWT n'est fabriqué. Aucun test OpenAI,
email ou SMS n'est déclenché. Les index ne sont pas créés/modifiés par le helper.

## En cas d'échec ou d'interruption

Un refus HTTP définitif déclenche le nettoyage ; le bilan du test reste en échec.
Un timeout, une réponse 5xx, une réponse invalide, ou une préparation interrompue
peut laisser une opération serveur en cours. Le script tente de désactiver les
comptes synthétiques et conserve le répertoire privé de reprise et son UUID.
Il affiche `CLEANUP_UNCONFIRMED`, jamais un faux succès de nettoyage.
Un arrêt brutal (SIGKILL, perte de l'hôte) ne permet pas l'exécution du trap.

Après confirmation que les anciennes opérations sont terminées (ou après
redémarrage des backends qui les traitaient), relancer avec le même UUID :

```bash
bash /tmp/run-reception-booking-smoke.sh --cleanup UUID_AFFICHE
```

Le nettoyage est idempotent et vérifie IDs et marqueurs. Il refuse une référence
étrangère ou un marqueur modifié. Conserver le dossier privé si ce contrôle échoue.
Une reprise réussie ne supprime pas l'ancien dossier local : après contrôle de
`CLEANUP_OK`, supprimer uniquement le chemin `RECOVERY_DIR` de cette exécution.
Ce dossier contient des identifiants temporaires ; ne pas le partager.

Les comptes/passwords/tokens ne sont pas imprimés ni passés dans les arguments
curl. Les données de test sont synthétiques ; les audits obligatoires ne sont
pas effacés. Les cliniques/comptes synthétiques peuvent être visibles brièvement
par les administrateurs pendant le test. Le résultat est un contrôle séquentiel,
pas une preuve de concurrence, de basculement ou de revue clinique. Le mode
`--concurrent` vérifie la concurrence des réservations réception ; il ne
constitue pas une validation de basculement ou une revue clinique.

## Observation d'une réservation pendant un basculement

Copier aussi `reception-failover-observer.py` à côté des deux scripts smoke,
puis lancer d'abord une référence sans arrêt de service :

```bash
BACKEND_CONTAINER=NOM_EXACT_BACKEND_REPLICA \
BASE_URL=https://clinique-ai.ca \
bash /tmp/run-reception-booking-smoke.sh --observe-seconds 15
```

Le parcours crée une réservation synthétique par l'API, note son acquittement,
puis relit le patient avec la session réception toutes les secondes lorsque
les réponses sont rapides. Chaque requête a un timeout de cinq secondes ;
la cadence ralentit pendant un timeout. Le journal JSONL en mode 600 contient
uniquement séquence, UTC, temps monotone relatif, durée, statut HTTP et résultat
du contrôle. Il reste disponible après nettoyage, sans corps HTTP, RAMQ, token,
identifiant patient ou identifiant de rendez-vous. Un code d'erreur technique
connu peut être enregistré ; aucun message ou corps d'erreur n'est conservé.
L'observateur utilise le même client curl et les mêmes fichiers d'en-tête et
de requête que la recherche initiale, sans suivre les redirections. Python
gère seulement la cadence, la vérification du résultat et le journal minimisé.

`OBSERVATION_READY` marque le début de la fenêtre d'observation (5 à 600 secondes).
Le compte et la réservation restent actifs pendant cette fenêtre. Après celle-ci,
le helper vérifie le même identifiant acquitté et exactement une réservation,
puis le script ferme la session et nettoie. Choisir une fenêtre assez longue
pour couvrir arrêt, reprise et au moins cinq réponses correctes consécutives.
Utiliser la réplique pour les helpers si le backend principal doit être arrêté.
Ne pas arrêter le conteneur qui exécute les helpers.

`observed_gap_seconds` mesure la fenêtre entre la dernière réponse correcte
avant une série d'échecs et la première de cinq réponses correctes consécutives.
C'est une mesure échantillonnée, pas le RTO exact. Les temps UTC permettent
de la corréler aux horaires d'arrêt et de reprise enregistrés séparément.
Une réponse 200 avec une réservation absente ou différente fait échouer le test.
Un timeout, 408 ou 5xx conserve le répertoire de récupération et désactive les
comptes : ne lancer `--cleanup RUN_ID` qu'après fin des traitements ou redémarrage
des backends ayant pu traiter les requêtes. Le journal minimisé est conservé
indépendamment du répertoire de récupération.

Cette observation vérifie une écriture acquittée avant l'observation et le
parcours authentifié pendant la fenêtre. Elle ne crée pas de nouvelles
réservations en continu, ne mesure pas la capacité maximale et ne démontre pas
un RPO général. La référence sans panne ne valide pas un basculement.

### Fenêtre d'arrêt du backend principal

Après une référence réussie, `run-backend-failover-window.sh --run` peut
être exécuté dans une seconde connexion SSH pendant une observation de
300 secondes. Il exige les noms exacts des deux backends, le conteneur MongoDB
contenant les identifiants administratifs (`MONGO_STATUS_CONTAINER`),
le SHA attendu et la confirmation explicite
`CONFIRM_PRODUCTION_FAILOVER_DRILL=RUN_CLINIA_FAILOVER_DRILL`.

Avant tout arrêt : les deux backends doivent être healthy au SHA attendu,
MongoDB doit avoir exactement un PRIMARY et deux SECONDARY sains, avec un
retard maximum de dix secondes. La lecture `replSetGetStatus` utilise le driver
du backend réplique. Les identifiants administratifs du conteneur MongoDB sont
filtrés par jq et transmis directement sur stdin au processus ponctuel, sans
les afficher, les écrire sur disque ou les passer dans les arguments. Copier
`mongo-replica-preflight.mjs` à côté du script fenêtre. Les droits du compte
applicatif restent inchangés ; aucune création d'index n'est permise.
Le compte administrateur utilisé est `root` par défaut, comme dans les
sauvegardes ; `MONGO_ADMIN_USERNAME` permet de préciser un autre compte
validé. Le nom d'initialisation du conteneur n'est pas utilisé comme preuve
du nom réel du compte existant.
Le mode `--check` effectue ces seuls
contrôles, sans arrêt et sans exiger la confirmation du drill. Une erreur
MongoDB affiche un code technique et bloque toute action sur les services.
Les identifiants Docker sont épinglés. Le
principal est arrêté avec un délai de grâce de dix secondes, maintenu arrêté
vingt secondes, puis redémarré. Les événements UTC sont affichés et les deux
backends doivent redevenir healthy. Une interruption INT/TERM/HUP ou un échec
de stop déclenche une tentative de redémarrage du conteneur épinglé.

Lancer la fenêtre seulement après au moins cinq lectures HTTP 200 et pendant
que l'observation est encore active. Conserver les sorties des deux terminaux.
`BACKEND_WINDOW_COMPLETED` confirme la fenêtre d'arrêt et le retour de santé ;
la disponibilité et la réservation doivent être évaluées avec le journal de
trafic séparé. Aucun conteneur MongoDB n'est arrêté par ce script.

Validation locale de la fenêtre : syntaxe Bash et trois simulations Docker
(parcours normal, SHA incorrect refusé avant stop, échec de stop après action
du daemon suivi de la tentative de reprise). Aucune panne réelle provoquée
par l'agent.

Correction après la première tentative : le passage du code à mongosh via
`--file /dev/stdin` n'avait pas produit de contrôle confirmé sur le droplet.
Il est remplacé par le driver backend, avec contrôle préalable séparé. Cinq
simulations passent : lecture seule, parcours normal, SHA incorrect, échec
MongoDB bloquant et reprise après échec de stop. L'observateur affiche
maintenant le temps écoulé et restant et traite Ctrl+C sans traceback ; une
interruption conserve toujours les fixtures pour récupération.

Agent-Contribution: backend | observation authentifiée et contrôle du même rendez-vous acquitté après la fenêtre
Agent-Review: security | journal minimisé, absence de suivi de redirection avec Authorization, récupération conservée sur résultat ambigu

## Validation du script sans production

Validation locale du 12 octobre 2026 : onze tests réussis et nettoyage du
conteneur MongoDB jetable confirmé. Les trois nouveaux scénarios vérifient
la persistance du même rendez-vous, un contenu incohérent malgré HTTP 200,
et la conservation des fixtures après une erreur 503 pendant l'observation.

```bash
bash scripts/run-urgentologist-walk-in-integration.sh --reception-smoke
```

MongoDB jetable local et vraies routes Express, requêtes curl réelles. Un shim
Docker exécute le helper avec les modèles locaux ; le proxy et l'image Coolify
ne sont pas couverts. Les 21 scénarios du rapport standard restent inchangés.

Validation locale du 27 septembre 2026 : six tests réussis, conteneur MongoDB
jetable supprimé. Parcours complet, refus HTTP définitif, erreur amont 504 avec
reprise idempotente, marqueur modifié, conservation d'une autre exécution et
référence étrangère couverts. Les signaux pendant la préparation et les écritures
serveur réellement retardées ont été revus dans le code, sans injection de ces
courses dans cette suite. Aucun lancement en production par l'agent.

```text
Agent-Contribution: backend | script curl, fixtures transactionnelles, nettoyage et tests isolés
Agent-Review: security | propriété des objets, interruptions et limites des écritures tardives ; revue de code
Validation: bash scripts/run-urgentologist-walk-in-integration.sh --reception-smoke | 6/6, CLEANUP_OK
```

## Exécution Coolify confirmée le 27 septembre 2026

Résultats fournis par l'utilisateur pour l'exécution
`74a5d57d-a1a6-4bd2-97fe-7d2d5bc5e841` sur le Droplet : connexion et recherche
réussies, réservation HTTP 201, rejeu HTTP 403 `RECEPTION_LOOKUP_REQUIRED`,
une réservation vérifiée en base, logout et `CLEANUP_OK` suivis de
`RECEPTION_BOOKING_SMOKE_PASSED`. Le backend avait auparavant été vérifié au
commit `beb3db433f4d18d7c91fbe551aff32bf12cdbb45` sur les deux instances.

Cette exécution utilisait la vraie base applicative avec des objets synthétiques
dédiés, supprimés ensuite ; les audits sont conservés. Les six tests de
développement utilisaient une base jetable distincte. Ce résultat fourni par
l'utilisateur ne prouve ni concurrence ni basculement. Une infrastructure de
test isolée permanente sur le Droplet est envisagée, mais n'a pas été créée.
