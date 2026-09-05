# Consultations et prise en charge permanente

## Contrat

- La réception crée le patient et son rendez-vous dans la même transaction. Le nouveau patient a `ownerUserId: null` : ni la réception ni le médecin du rendez-vous ne deviennent automatiquement titulaires du dossier.
- Le rendez-vous appartient au médecin receveur validé (`Specialist.accountUserId`, compte actif `MEDECIN`), y compris si le patient a déjà un autre titulaire.
- `/api/consultations` est réservé aux médecins actifs. L'accès clinique repose sur le spécialiste associé au compte et le rendez-vous concerné, jamais sur la seule appartenance à une clinique.
- Un rendez-vous `scheduled` permet de lire les notes précédentes du patient et d'ajouter une note. Un rendez-vous `completed` permet seulement de relire ses propres notes de ce rendez-vous, sauf si le patient est sous sa prise en charge permanente. Les statuts annulé, absent et replanifié ne donnent pas cet accès.
- Les nouvelles notes sont des entrées séparées, attribuées à leur auteur, sans API de modification ou suppression. Les anciennes notes du profil restent intactes et sont affichées en lecture seule dans cet écran. Pas de traduction du contenu ni d'appel à une IA.
- L'action explicite `POST /api/consultations/:appointmentId/accept-care` attribue un dossier sans titulaire au médecin. Elle ne transfère jamais le dossier d'un autre médecin. Une mise à jour conditionnelle transactionnelle départage deux acceptations concurrentes.
- La réception et SUPERADMIN n'obtiennent aucun droit sur cette API. Les autorisations déléguées existantes et les API génériques ne sont pas élargies.
- Les consultations sont auditées ; les mutations et leur audit sont transactionnels. Les écritures verrouillent les documents d'autorisation pour détecter les changements concurrents. Aucun contenu de note, nom ou RAMQ n'entre dans les journaux ajoutés.
- La page affiche les 100 rendez-vous les plus récents. Les libellés proviennent du catalogue français et de huit traductions locales.

## Compatibilité

Aucune migration des propriétaires existants. Patient1 créé avant ce changement conserve donc son ancien titulaire. Pour valider le nouveau comportement, utiliser un **nouveau patient fictif** ; ne pas réassigner en masse les dossiers existants.

L'ancien écran Patients reste la clientèle du titulaire. Le médecin ponctuel utilise **Consultations**, pas une permission générale d'édition du dossier. La liste des rendez-vous affiche uniquement les noms associés à sa page de rendez-vous autorisée, même sans prise en charge permanente.

## Vérification STAGING, pas PROD

1. Préparer des créneaux futurs pour Leroux et Morgan, tous deux associés à des comptes MEDECIN actifs et aux cliniques voulues.
2. Avec RECEPTION, créer un nouveau patient fictif et un rendez-vous avec Leroux. Vérifier que le patient et le rendez-vous ne sont créés qu'à la confirmation.
3. Avec Leroux, ouvrir **Consultations**, ouvrir ce rendez-vous et ajouter une note fictive en anglais. Ne pas accepter la prise en charge. Le patient ne doit pas apparaître dans sa clientèle Patients.
4. Avant tout rendez-vous Morgan, vérifier qu'il n'a pas ce dossier dans Consultations. Un GET direct avec l'identifiant de la consultation Leroux doit répondre 403.
5. Avec RECEPTION, rechercher le même patient et réserver un autre créneau avec Morgan. Avec Morgan, ouvrir sa propre consultation : la note Leroux doit être lisible, sans bouton de modification, et une nouvelle note Morgan doit pouvoir être ajoutée.
6. Avec Leroux, terminer son rendez-vous dans la liste. Sans prise en charge, il doit maintenant relire uniquement ses propres notes de ce rendez-vous. Morgan conserve l'accès à l'historique tant que son rendez-vous est actif.
7. Avec Morgan, cliquer **Accepter la prise en charge permanente** puis confirmer. Le patient doit maintenant apparaître dans sa clientèle Patients. Aucun autre médecin ne doit pouvoir se l'attribuer par cette action.
8. Avec RECEPTION/SUPERADMIN ou un médecin inactif, vérifier les refus d'accès clinique. Annuler un rendez-vous de test et vérifier que son accès clinique disparaît au prochain appel.
9. Changer successivement les neuf langues : libellés traduits, texte médical inchangé.

Tests automatisés : `backend/services/__tests__/consultations.service.test.js`, `backend/routes/__tests__/consultations.routes.test.js`, tests de montage RBAC, réception, patients et rendez-vous ; `frontend/src/pages/ConsultationsPage.test.tsx`.

Les tests unitaires ne remplacent pas le drill STAGING avec MongoDB répliqué. La preuve d'intégrité RAMQ → réservation (P0.3) et les drills de concurrence réels restent distincts : ce changement ne les déclare pas validés.

## Retour de test navigateur — 2026-09-05

Parcours confirmé par l'utilisateur avec deux comptes médecins et un patient fictif :

- le second médecin lit la note du premier et ajoute une note distincte ;
- après acceptation explicite, le patient apparaît dans la clientèle du second médecin, pas dans celle du premier ;
- après clôture, le premier médecin ne voit que sa propre note, sans formulaire d'ajout ;
- après clôture, le médecin ayant accepté la prise en charge conserve la lecture des deux notes.

Le filtre réception exige la spécialité médecin de famille, même si un autre spécialiste possède des disponibilités walk-in. Ces captures valident le parcours fonctionnel, pas les refus API ni les courses concurrentes en environnement réel.

## Replanification par RECEPTION

La recherche exacte du patient annonce immédiatement ses rendez-vous `scheduled`
dans la clinique active (y compris ceux dont l'heure est passée mais qui ne sont
pas clôturés). Les rendez-vous des autres cliniques ne sont ni retournés ni modifiés.

- Aucun rendez-vous planifié : création habituelle.
- Un rendez-vous planifié : proposer une replanification explicite, jamais une
  deuxième création. Le choix d'un autre médecin actif de la clinique est possible.
- Plusieurs rendez-vous déjà planifiés : bloquer et demander une vérification des
  doublons existants. Aucun nettoyage automatique, aucune annulation implicite.

Le navigateur transmet `replaceAppointmentId` lors de la recherche des créneaux
et de la confirmation. Le serveur vérifie cet identifiant contre le rendez-vous
planifié du patient dans la clinique autorisée. Une sélection manquante, étrangère
ou périmée produit `RECEPTION_REPLAN_REQUIRED` (HTTP 409).

La recherche est en lecture seule. À la confirmation, une transaction verrouille
le patient (`__v`) pour sérialiser les réservations RECEPTION concurrentes,
revérifie le rendez-vous, passe l'ancien à `rescheduled`, libère sa capacité
journalière, crée le nouveau et relie les deux avec `rescheduledFrom` /
`rescheduledTo`. Les audits sont inclus. En cas d'erreur, toute la transaction est
annulée. Ce verrou ne remplace pas les règles des autres parcours de réservation.

### Test STAGING supplémentaire

1. Utiliser un patient fictif ayant exactement un rendez-vous planifié dans la
   clinique active. À la recherche, vérifier l'avertissement et le bouton
   « Replanifier ce rendez-vous ».
2. Chercher un autre créneau, puis revenir en arrière sans confirmer : vérifier
   que l'ancien rendez-vous est toujours `scheduled`.
3. Confirmer un nouveau créneau : vérifier un seul rendez-vous `scheduled`,
   l'ancien `rescheduled`, les liens historiques et les notes inchangées.
4. Sur un autre cas fictif, rendre le nouveau créneau indisponible avant la
   confirmation : la réservation doit échouer et l'ancien rendez-vous rester intact.
5. Confirmer deux remplacements concurrents par API : un seul doit réussir ;
   l'autre doit être refusé après revérification, sans deuxième réservation active.
6. Vérifier qu'un identifiant d'un autre patient ou d'une autre clinique est refusé.

Les tests unitaires couvrent les branches, le partage de session et les refus.
Le rollback et la concurrence sur MongoDB réel restent à confirmer avec ce drill.
