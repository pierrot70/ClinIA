# État du projet ClinIA

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
