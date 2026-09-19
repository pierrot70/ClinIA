# État du projet ClinIA

## État vérifié — 2026-09-19

Cette section remplace les états historiques ci-dessous. Base de départ du lot :
branche `coolify`, commit `519fd83d2e2ea232bed61b8d9cf64044187df8bc`.
Le travail reste sur `coolify` : conserver et valider le lot actuel en STAGING,
puis commit/push après succès. Le déploiement et le test Coolify reviennent à
l'utilisateur. Reprendre les neuf points individuellement uniquement en cas de
problème majeur ; aucune suppression de changements n'a été effectuée.
Les résultats ci-dessous décrivent les validations locales/STAGING ; l'état du
CI distant doit être vérifié pour le SHA exact publié dans GitHub Actions.

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
- P1 Coolify : transmission `SOURCE_COMMIT` et volume de rapports déjà présents
  dans le Compose/Dockerfile. Politique d'accès et conservation précisée dans
  `docs/validation-reports-superadmin.md`. Activation dans Coolify, publication
  des rapports et application de l'archivage restent à effectuer sur l'hôte cible.
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
- P1 restauration S3/basculement : non exécutés. Il manque la cible explicite,
  l'archive, les références d'accès S3/clé de déchiffrement et le créneau.
  AWS CLI absent localement. Le script de restauration existant cible la
  production et utilise `mongorestore --drop` ; ne pas lui substituer une cible
  supposée. Les procédures existent dans `docs/production-incident-runbook.md`.
- P2 : état actualisé, Node 24 dans les deux jobs CI, attribution normalisée
  des contributions/revues ajoutée à `AGENTS.md`.

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
Validation locale complète du 19 septembre 2026 : code de sortie 0 et
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
- Les rapports locaux portent `dirty: true` : le SHA de base seul ne décrit
  pas le code testé. Il faudra une exécution CI sur un commit propre pour
  établir une correspondance avec une future image Coolify.
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
