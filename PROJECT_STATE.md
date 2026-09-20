# État du projet ClinIA

## État documentaire — 2026-09-20 (preuves des 19 et 20 septembre)

Cette section remplace les états historiques ci-dessous. Base de départ du lot :
branche `coolify`, commit `519fd83d2e2ea232bed61b8d9cf64044187df8bc`.
Le travail reste sur `coolify` : conserver et valider le lot actuel en STAGING,
puis commit/push après succès. Le déploiement et le test Coolify reviennent à
l'utilisateur. Reprendre les neuf points individuellement uniquement en cas de
problème majeur ; aucune suppression de changements n'a été effectuée.
Révision du code examinée : `3171013ce4d5d6b2957275f6e607d3e09bd986f4`.
Les résultats ci-dessous distinguent les validations locales/STAGING des
observations Coolify fournies par l'utilisateur le 19 septembre. Le CI local
a été réexécuté le 20 septembre avant le commit documentaire ; aucun nouveau
contrôle de santé distant n'a été exécuté pour cette mise à jour.
Le CI complet est lancé localement avant commit/push ; GitHub Actions est
désormais manuel (`workflow_dispatch`), conformément au choix de l'utilisateur.

### Priorités prises en charge

- P0 dépendances : `nodemailer` épinglé à `9.1.0`, verrou backend régénéré.
  Audits npm backend et frontend réussis (aucune alerte high/critical selon
  le contrôle CI existant). CI configuré pour Node 24 et artefacts sur 30 jours.
  Le rebuild STAGING synchronise désormais le volume partagé `node_modules`
  avec `npm ci` pendant l'arrêt des deux backends, car un simple rebuild d'image
  ne remplace pas ce volume. Version 9.1.0 vérifiée sur les deux instances
  STAGING sous Node 20.20.2 ; connexion SMTP Mailpit réussie, sans envoi de mail.
- P0 réauthentification : l'instabilité signalée n'a pas été reproduite.
  Une erreur réelle du script manuel a été corrigée : une confirmation acceptée
  dans une autre session retourne maintenant un code d'échec 2, testé.
  Aucun délai de sécurité serveur n'a été raccourci.
  Investigation ciblée du point 2 : les cinq anciens CI des changements auth
  s'arrêtaient tous à l'audit npm avant les tests. Un défaut distinct d'isolation
  de la suite `auth.service.test.js` a ensuite été reproduit avec
  `--sequence.shuffle --sequence.seed=3` : le test de réception sans clinique
  recevait `USER_EXISTS` au lieu de `INVALID_INPUT`, en héritant du mock d'un
  test précédent. `vi.resetAllMocks()` remplace `vi.clearAllMocks()` dans la
  préparation de cette suite ; les réponses et implémentations sont réinitialisées.
  Les assertions et le code applicatif restent identiques. Le CI conserve
  désormais cet ordre de régression, en plus des suites complètes et des 21
  scénarios. Sans le journal initial, ce défaut confirmé ne peut pas être
  assimilé avec certitude à l'instabilité de réauthentification évoquée au départ.
- P0 STAGING auth : drill HTTP avec les vraies routes déployées et Mongo STAGING,
  dans un serveur et des collections isolés. Rejeu MFA refusé dans la même
  fenêtre TOTP (401), code frais accepté (200), cookie de réauth emprunté refusé
  (403), ancien JWT refusé immédiatement après logout (401), autre session
  toujours valide (200), nettoyage confirmé. Voir
  `scripts/run-staging-auth-security-drill.md`. Ne couvre pas le proxy, le
  navigateur ou la concurrence entre les deux instances applicatives.
- P0 RAMQ → réservation existante : preuve opaque à usage unique, hash seulement
  en Mongo, expiration 10 minutes, liée au compte/session/clinique/patient.
  Consommation dans la transaction de réservation ; rejeu concurrent refusé.
  Une transaction annulée restitue la preuve. Frontend adapté. Le nouveau
  modèle porte un index unique et un TTL, tous deux vérifiés dans STAGING après
  rebuild ; vérifier aussi leur présence après le déploiement Coolify.
- P1 résultats cliniques : alternatives thérapeutiques et `red_flags` affichés
  immédiatement, labels issus de la source française et neuf langues couvertes.
  Le contenu médical reçu n'est pas traduit dynamiquement par ces sections.
- P1 Coolify : option `Include Source Commit in Build` activée ; le SHA
  `beb527c63c82cb7441396479d7a7ac3cf76fce29` a été lu dans les deux images backend.
  Le montage des rapports a été vérifié en lecture seule (`RW=false`) sur les
  deux backends, exécutés sous UID/GID 10001. Le rapport propre `55957d49…`
  a été publié et consulté en SUPERADMIN, avec correspondance de version.
  Après le déploiement de `3171013`, la capture de l'interface confirme ce
  nouveau SHA et le menu rétabli ; l'ancien rapport indique correctement une
  différence de version. La conservation et l'archivage restent à appliquer,
  les exports PDF/JSON en production restent à confirmer. L'automatisation
  de la publication est explicitement reportée.
- P1 charge STAGING : premier essai interrompu après des timeouts HTTP ; une
  écriture auth tardive a laissé une collection synthétique. Nettoyage exact
  confirmé ensuite, sans modification des autres collections. Le runner est
  corrigé pour attendre les traitements avant suppression et conserver les
  collections si cette attente échoue. Second essai réussi : 10 comptes,
  121 secondes mesurées, 150 connexions et 150 déconnexions, 10 refus 429
  attendus, aucune erreur inattendue, audits 150/150, aucune session refresh
  active et nettoyage confirmé. P95 login 5,83 s (délais volontaires et 429
  inclus), logout 0,22 s. Le passage d'une fenêtre de quota a permis de dépasser
  100 connexions au total. Serveur et générateur partagent le même processus ;
  ces résultats ne mesurent pas un nombre d'utilisateurs réels supportés.
- P1 restauration S3/basculement : essais réalisés le 19 septembre, détaillés
  ci-dessous. Restauration dans un MongoDB local isolé, sans restauration sur
  la production. Basculements backend, secondaire et primaire MongoDB exécutés
  par l'utilisateur sur le Droplet ; retour à un état sain confirmé. Une requête
  HTTP a expiré après 10 secondes pendant le basculement backend : aucune
  garantie de continuité sans interruption ni mesure précise du temps de reprise.
- P2 : Node 24 dans le CI local et les deux jobs GitHub ; attribution normalisée
  dans `AGENTS.md`. Les Dockerfiles utilisent encore Node 20. Cette mise à jour
  corrige l'état du projet ; une archive privée locale des preuves et une copie
  chiffrée S3 sont créées et vérifiées. Leur conservation reste à organiser.

### Attribution

```text
Agent-Contribution: backend | preuve RAMQ transactionnelle, tests et nettoyage du drill de charge
Agent-Contribution: frontend | alternatives thérapeutiques et red_flags, labels et tests
Agent-Contribution: security | drill auth STAGING, code de sortie réauth et régression
Validation: résultats finaux consignés ci-dessous ; pas de validation clinique humaine
```

### Validation

Validation complète avant commit/push, depuis la racine :

```bash
bash scripts/ci-local.sh
```

`./rebuild-local.sh staging` appelle également cette validation complète, une
seule fois, avant l'arrêt et la reconstruction des conteneurs. Un échec du CI
interrompt le rebuild. Les anciens appels séparés aux tests unitaires et au
rapport d'intégration après redémarrage sont remplacés par ce passage unique ;
les contrôles de disponibilité STAGING et de l'état Mongo restent en place.
Le rapport est écrit dans `validation-artifacts/`, monté dans les backends.

Cette commande et GitHub Actions appellent les mêmes étapes versionnées :
`npm ci`, audits (seuil high/critical), suites frontend/backend, régression auth,
build frontend et les 21 scénarios sur MongoDB jetable. Prérequis : Node 24,
npm, Bash, jq, Git, Docker local actif et accès aux registres npm/Docker.
Backend en `America/Toronto`, frontend en `UTC`, `CI=true` dans les deux cas.
Le succès complet affiche `CI_LOCAL_PASSED` ; une erreur interrompt la commande.
Un audit réseau indisponible est désormais un échec, jamais un audit vide vert.
Les `node_modules` locaux sont réinstallés ; les volumes STAGING ne sont pas
modifiés. Le rapport d'intégration reste dans `validation-artifacts/`.
Cela ne reproduit pas la VM GitHub, ses permissions, caches ou l'envoi des
artefacts. Les contrôles STAGING pertinents restent distincts. Le CI distant
est désormais manuel (`workflow_dispatch`) : aucun lancement automatique sur
push ou pull request. Le feu vert avant déploiement repose sur la validation
locale du code envoyé ; un contrôle distant reste disponible à la demande.
Les hooks Git ne lancent pas
automatiquement cette commande : l'exécuter avant chaque commit du lot testé.

### Dernières preuves disponibles au 20 septembre

- CI local du 20 septembre avant commit documentaire : `CI_LOCAL_PASSED`,
  1 171 tests frontend, 698 backend, 57 tests auth seed 3, build et deux audits
  réussis ; intégration 21/21 et nettoyage confirmé. Journal local :
  `/tmp/clinia-docs-ci-20260920.log`. Rapport
  `41888017-4db3-4646-a8a7-e8243dfb6d5c`, base `3171013`, `dirty: true`
  (deux documents modifiés). Cette nouvelle preuve n'est pas incluse dans
  l'archive chiffrée déjà envoyée à S3 ; le présent résultat a été consigné
  après l'exécution, sans changement de code applicatif.
- CI local avant le commit `3171013` : `CI_LOCAL_PASSED`, 1 171 tests frontend,
  698 backend, 57 tests auth seed 3, build et deux audits au seuil high/critical
  réussis. Les 57 tests auth sont une réexécution ciblée, pas 57 tests distincts
  supplémentaires. Journal local : `/tmp/clinia-menu-ci.log`.
  Rapport d'intégration `038072c6-0d67-4498-a34c-f91d54021199` : 21/21,
  nettoyage confirmé, base `beb527c`, `dirty: true` car le changement de menu
  n'était pas encore commité. Ce rapport ne constitue pas une preuve propre
  rattachée au SHA `3171013`.
- Rapport propre publié :
  `validation-artifacts/55957d49-617f-4887-b68d-5b68509f9dde.json`,
  commit `beb527c63c82cb7441396479d7a7ac3cf76fce29`, `dirty: false`, 21/21,
  sortie 0 et nettoyage confirmé. Empreinte SHA-256 vérifiée avant publication :
  `ee0991fd4b8a35122509fd01f8f88d686baaf23f7df4c5baa90fa0aa2163824b`.
  La preuve porte sur l'intégration isolée ; ce n'est ni le rapport de toutes
  les suites ni un test du déploiement Coolify.
- Restauration : archive S3 du 19 septembre à 05:15:02 UTC, empreinte vérifiée,
  déchiffrement `age` et flux gzip valides. Restauration locale dans un conteneur
  sans réseau, sans port publié et avec données sur volumes temporaires en
  mémoire. Comparaison au manifeste : 29 collections, 6 138 documents, aucun
  écart de noms ou de comptage ; validation complète des collections réussie,
  144 index recensés (pas de comparaison de leurs définitions au manifeste).
  TTL désactivé pendant l'essai pour conserver l'état de la sauvegarde.
  L'erreur intermédiaire de transfert du manifeste a été corrigée avant le
  succès final. Conteneur et données restaurées supprimés, nettoyage confirmé.
  Journal : `/tmp/clinia-isolated-restore-result.log` ; script d'essai :
  `/tmp/clinia-isolated-restore-check.sh`. La clé privée est restée locale.
- Basculement : journal du Droplet
  `/root/clinia-failover-20260919-151028.log`, transmis par l'utilisateur.
  Trois étapes `status=passed`, puis `DRILL PASSED`. Une requête a expiré
  après 10 secondes lors de l'arrêt du backend ; l'API a ensuite répondu
  pendant son arrêt. Lors de l'arrêt du primaire MongoDB, une réplique a pris
  le rôle PRIMARY ; l'état final était un PRIMARY, deux SECONDARY sains et
  un retard mesuré nul. Le dernier `docker ps` fourni confirme les deux
  backends `healthy` et les trois conteneurs MongoDB démarrés. Aucune réservation
  pendant la panne n'a été testée, ni reprise après perte complète du Droplet.

Les six preuves disponibles ont été copiées sans modification le 20 septembre
dans une archive privée locale hors du dépôt :
`~/.local/state/clinia-evidence/2026-09-19-review-20260920T125023Z/`.
Elle contient le journal CI, le résultat et le script de restauration isolée,
les deux rapports JSON référencés ci-dessus et la transcription utilisateur du
basculement. `manifest.json` décrit leur provenance ; `SHA256SUMS` couvre les
six fichiers ainsi que le manifeste et le README. Les huit empreintes ont été
vérifiées. Dossier en mode 700, fichiers en mode 600 ; aucun original supprimé.
Les captures et le dernier état des conteneurs restent dans la conversation.
Le journal original du Droplet n'a pas été récupéré à nouveau le 20 septembre.
Ces empreintes ne constituent pas une signature.
Aucune archive MongoDB, clé privée ou configuration secrète n'a été copiée
dans ce dossier. Les journaux opérationnels restent hors du dépôt public.

Le 20 septembre, les neuf fichiers de ce dossier (six preuves, README,
manifeste et SHA256SUMS) ont été regroupés et chiffrés avec le destinataire
public de la clé `age` existante. Déchiffrement local et comparaison de chacun
des neuf fichiers aux sources réussis, sans fichier supplémentaire.
Archive : `clinia-evidence-20260919-review-20260920T125023Z.tar.gz.age`.
Empreinte SHA-256 :
`d16cbc62e9ee3ee45d24da529337f2a0065471c84b0f9e337fa6e492a7a70299`.
L'utilisateur a confirmé le transfert au Droplet, puis l'envoi de l'archive et
de son empreinte sous `technical-evidence/2026-09-19/` dans le stockage S3
existant, avec ACL privée demandée. Retéléchargement de l'archive depuis S3
et comparaison à l'empreinte locale de référence réussis. Cette preuve atteste
une copie hors du poste ; aucune règle de rétention ni protection contre la
suppression n'a été configurée ou vérifiée lors de cet envoi.

Une copie de secours de la clé privée, chiffrée par phrase secrète sur support
USB, a été déchiffrée et comparée à l'original avec succès par l'utilisateur.
Une première copie dont la phrase avait été divulguée a été remplacée, puis
supprimée selon sa confirmation ; l'effacement physique sur mémoire flash
n'est pas garanti. Aucune phrase secrète ni clé privée n'est consignée ici.
La conservation séparée de la nouvelle phrase et la mise en lieu sûr du
support restent des actions de l'utilisateur, non vérifiées par ces tests.
Le manifeste de l'archive reste inchangé : il décrit l'état local lors de sa
création, avant cette copie S3 ; le présent paragraphe consigne l'étape suivante.

### Vérifications encore ouvertes

- Auth : trajet navigateur/proxy et fonctionnement entre les deux instances.
- RAMQ : index unique/TTL et parcours synthétique sur le déploiement Coolify.
- Dépendances : version Nodemailer chargée et SMTP dans Coolify ; différence
  entre Node 24 pour les tests et Node 20 dans les images à prendre en compte.
- Rapports : exports PDF/JSON en production, application de la conservation
  et de l'archivage. Publication automatisée reportée par l'utilisateur.
- Résultats cliniques : vérification visuelle en production ; les tests
  d'affichage ne constituent pas une validation scientifique du contenu.
- CI : le build Vite ne lance pas de contrôle TypeScript global `tsc --noEmit`.
  L'exécution complète avant push reste manuelle, sans blocage automatique
  dans les hooks Git.
- Preuves : application de la conservation des copies locales et S3 ; aucune
  purge ni protection contre la suppression n'est configurée par cette opération.

### Résultats historiques du lot initial

Validation locale complète antérieure du 19 septembre 2026 : code de sortie 0 et
`CI_LOCAL_PASSED`, 1 171 tests frontend, 698 backend (dont les 7 tests du
lanceur/audit), 57 tests de régression auth seed 3, build et deux audits verts
au seuil high/critical. Les 21 scénarios d'intégration ont réussi et le
nettoyage du MongoDB jetable est confirmé (`cleanup: true`). Rapport local :
`validation-artifacts/43dc549b-824b-4afd-9d15-979373aeebce.json`.
Cette exécution porte sur les changements locaux au-dessus de `fd5b956`
(`dirty: true` dans le rapport), avant le changement des déclencheurs CI et
la mise à jour documentaire ; elle ne constitue pas un contrôle GitHub distant.

- Point 2 : cinq fichiers auth/réauth, 97 tests, réussis dans chacun des dix
  ordres (seeds 1 à 10), soit 970 exécutions sans échec après correction.
  Avant correction, seed 3 échouait également sur le seul fichier de service
  (56/57). Après correction, 57/57 dans le conteneur STAGING avec seed 3,
  modèles simulés et aucune requête aux collections applicatives.
  Suite backend complète réexécutée après correction : 691/691.
- Rebuild complet `./rebuild-local.sh staging` réussi après synchronisation des
  dépendances ; API 4002/4003 et frontend 5174 prêts, replica set sain
  (un PRIMARY, deux SECONDARY). Suites 691/1171 et intégrations 21/21 repassées.
  Rapport de ce rebuild :
  `validation-artifacts/94349ab3-3f95-4dfa-a22b-da9f6b86f579.json`.
  Drill auth relancé après rebuild : trois protections vérifiées, traitements
  terminés avant suppression et nettoyage confirmé.
- Frontend : 44 fichiers, 1171 tests réussis ; build Vite réussi, avertissement
  de taille de bundle restant.
- Backend : 95 fichiers, 691 tests réussis sous Node 24.14.0 avec
  `TZ=America/Toronto npm test -- --run`, après `npm ci --no-audit`.
  L'installation reproductible frontend a aussi été vérifiée.
- Intégration : 21/21 scénarios réussis, y compris les assertions de preuve
  RAMQ manquante/expirée/mal liée et de rejeu concurrent/séquentiel. Nettoyage
  du conteneur MongoDB jetable confirmé. Rapport local :
  `validation-artifacts/4dc255ea-b585-4a0c-8cab-b677db3d0f56.json`.
- Un premier rapport a conservé deux échecs sur les scénarios historiques qui
  omettaient encore la preuve RAMQ. Les fixtures ont été adaptées, puis les
  21 scénarios ont été réexécutés avec succès ; aucune assertion de réservation
  ou de contrôle d'accès n'a été retirée.
- Ces rapports du lot initial portent `dirty: true` : le SHA de base seul ne
  décrit pas le code testé. Le rapport propre `55957d49…`, produit ensuite sur
  `beb527c`, est distingué dans les dernières preuves ci-dessus.
- Le CI précédent, run `34765717569`, a été vérifié sur GitHub : frontend vert,
  backend arrêté à l'audit npm, suites backend/intégration non exécutées.

## Mise à jour de reprise — 2026-08-08

Cette section remplace l'état opérationnel du 31 juillet ci-dessous, qui est
conservé comme trace de reconstruction initiale. La branche active est
`coolify`; le dernier commit validé est `f31b584` (`Add verified coordination
request workflow`). Il contient le parcours de rendez-vous par spécialité, la
protection contre les courses de réservation, la demande de coordination créée
depuis l'écran de rendez-vous et sa résolution vérifiée.

Travail en cours, non encore commit : première version de spécialistes à un ou
deux lieux de pratique. Chaque disponibilité est désormais rattachée à une
clinique précise. Les recommandations, les options d'attribution manuelle, les
créneaux, la création de rendez-vous et la vérification des demandes de
coordination utilisent ce lieu. Un spécialiste ne peut pas être proposé à deux
cliniques au même instant : l'unicité existante du rendez-vous par spécialiste,
date et heure demeure donc effective.

Validation de ce chantier : la suite backend complète passe (411 tests) et le
build Vite de production réussit. Restent le test manuel du formulaire à deux
cliniques, le commit/push et la migration irréversible
`20260808-add-specialist-practice-locations`, qui recopie les données legacy
dans le nouveau champ sans les supprimer. Son application nécessitera
`--allow-irreversible`.

Date de reconstruction : 2026-07-31 (heure locale America/Toronto).

## Sources examinées

- `AGENTS.md` : contraintes de confidentialité Loi 25/PIPEDA, RBAC, audit et
  labels UI français versionnés.
- Documentation de développement, migrations Mongo et checklist de PR.
- État Git, diff non commité, derniers commits et dates de modification.

## Base validée dans Git

Le dernier commit est `ffa42c3` (`Harden OpenAI model configuration and cache`,
2026-07-31 09:11 -0400). Les derniers travaux déjà commités renforcent
notamment la configuration OpenAI/cache, la récupération de mot de passe, la
politique de mots de passe, la résolution d'IP via Cloudflare, le throttling
des échecs de connexion et les sauvegardes/audits Mongo.

Le dépôt de travail est sale uniquement par le chantier rendez-vous ci-dessous;
aucun conflit ou erreur d'espaces (`git diff --check`) n'a été observé.

## Chantier non commité en cours : rendez-vous

### Objectif reconstitué

Permettre jusqu'à deux rendez-vous `scheduled` le même jour pour le même
patient et spécialiste, dans un ordre temporel strict, sans dépasser la
capacité lors de requêtes concurrentes. Les créneaux proviennent des
disponibilités réelles du spécialiste (y compris le soir), et non plus d'une
plage fixe 08:00–17:00.

### Implémentation présente

- `AppointmentBookingGuard` ajoute un compteur atomique par
  `{ patient, specialist, date }` avec index unique.
- Un index unique partiel `{ patient, date, time }` empêche deux médecins de
  créer ou déplacer simultanément des rendez-vous incompatibles pour le même
  patient, même si les spécialistes sont différents. Les erreurs de concurrence
  associées sont renvoyées comme `PATIENT_ALREADY_BOOKED` (HTTP 409).
- Les créations, annulations, changements de statut et déplacements de date
  mettent à jour ce compteur; les mutations accompagnées d'un reçu de
  vérification s'exécutent dans une transaction Mongo avec le reçu d'audit.
- L'API de créneaux renvoie désormais `slots`,
  `existingAppointmentTimes` et `maximumAppointmentsReached`, et vérifie la
  portée du patient connecté lorsqu'un contexte authentifié est fourni.
- Le frontend transmet le patient à cette API, affiche le rendez-vous existant
  ou la limite atteinte, et sélectionne le premier jour réellement disponible
  après le choix d'un spécialiste.
- Une migration ajoute l'index de lecture patient–spécialiste–jour, et une
  seconde crée/remplit les gardes de capacité à partir des rendez-vous planifiés.
- Les tests de service et de route ont été étendus pour les nouveaux contrats,
  le reçu transactionnel et le scénario concurrent.

### Éléments restant à vérifier ou terminer

1. Les validations automatisées disponibles sont vertes : 15 tests backend
   ciblés (`appointments.routes` et `appointments.service`), 124 tests
   frontend, et build Vite de production. Les avertissements de build portent
   seulement sur la fraîcheur des données navigateur et la taille d'un chunk.
2. Revoir l'exécution réelle des migrations sur un replica set : les migrations
   déclarées non transactionnelles doivent rester sûres et idempotentes, et le
   backfill doit être confronté aux données historiques qui dépasseraient déjà
   la limite de deux.
3. Le nouvel index patient–date–heure a des tests dédiés. Ajouter des tests
   dédiés aux migrations de compteur quotidien/backfill, puis exécuter le drill
   STAGING des rendez-vous. Cette validation sur replica set n'a pas été faite
   lors de la reconstruction.
   Le script `scripts/run-staging-appointment-race-drill.sh` prépare toutefois
   automatiquement les données et le JWT de test pour vérifier cette course
   dès que le stack STAGING est disponible.
   Un équivalent production, protégé par une confirmation explicite et une
   sauvegarde vérifiée, est disponible dans
   `scripts/run-production-appointment-race-drill.sh`.
4. Vérifier manuellement le parcours UI (création, seconde réservation,
   troisième refus, déplacement, annulation/statut) et la compatibilité de tous
   les consommateurs de l'ancien contrat `string[]` de `GET /slots`.

## Contexte mémorisé distinct, non commencé dans ce diff

Le prochain axe connu avant cette reconstruction est un artefact séparé
« support-safe JSON » pour l'escalade urgente d'un échec OpenAI par un médecin
vers un SUPERADMIN. Il ne doit pas réutiliser le payload OpenAI brut : il doit
contenir seulement le contexte clinique minimal autorisé et les corrélations de
requête/audit pour permettre une reproduction rapide. Une future action UI
envisagée est « Copier le JSON de support ».

## Environnement local

Pour le travail quotidien, la documentation et le contexte mémorisé désignent
le projet Docker `clinia_local` comme défaut. Ne démarrer l'autre stack que
pour un besoin précis après vérification des collisions de ports, notamment
`localhost:4000`.
