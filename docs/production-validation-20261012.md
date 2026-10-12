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

Agent-Review: backend | sorties de version et définitions d'index fournies par l'utilisateur vérifiées
Validation: vérification en lecture seule exécutée sur les deux backends | trois index conformes, SHA attendu
Agent-Contribution: backend | mode concurrent du parcours réception avec authentification réelle et deux preuves distinctes
Validation: bash scripts/run-urgentologist-walk-in-integration.sh --reception-smoke | 8/8 et nettoyage MongoDB jetable confirmé
Validation: production --concurrent | 409/201, deux preuves distinctes, une réservation en base, nettoyage opérationnel confirmé ; sortie fournie par l'utilisateur
