# Urgentologues : walk-in et plafond quotidien

## Réglage temporaire pour le test manuel à l'écran

Les compositions locales `docker-compose-mongo-rs-local.yml` (les deux backends)
et `docker-compose-local.yml` activent temporairement
`CLINIA_TEST_URGENTOLOGIST_LIMIT=1`. Après `./rebuild-local.sh`, chaque urgentologue
a donc une seule consultation par jour en développement. Le message RECEPTION
utilise le plafond renvoyé par le serveur. Les rendez-vous existants ne sont ni
annulés ni supprimés ; les consultations terminées comptent toujours.

Avec un urgentologue, le deuxième walk-in déclenche les alternatives ; avec deux
urgentologues, chacun doit avoir atteint son quota (deux consultations au total).
Pour restaurer 20 localement :

```bash
CLINIA_TEST_URGENTOLOGIST_LIMIT=20 ./rebuild-local.sh
```

La production ignore ce réglage de test et conserve 20. Les scénarios automatisés
MongoDB en `NODE_ENV=test` restent également à 20, y compris celui des 41 arrivées.
Retirer ce réglage temporaire des compositions locales après le test manuel.

Spécialité enregistrée : `Urgentologue`. Le libellé médical affiché reste
`Emergency Physician` dans les neuf langues. Le compte associé conserve le rôle
`MEDECIN` et doit être actif pour recevoir un rendez-vous par RECEPTION.

## Règles

- Rendez-vous walk-in uniquement ; les disponibilités régulières sont refusées
  à la configuration et à la réservation, même par appel API direct.
- Maximum de 20 consultations par médecin et par date de planification,
  toutes ses cliniques confondues. Chaque visite compte, même pour un patient
  déjà rencontré dans la journée.
- Les statuts `scheduled` et `completed` comptent ; `cancelled`, `rescheduled`
  et `no_show` ne comptent pas. Une consultation terminée ne libère ni quota
  ni créneau. Les autres protections de réservation existantes restent actives.
- Un report exclut uniquement le rendez-vous remplacé. L'ancien rendez-vous
  et la nouvelle réservation sont modifiés dans la même transaction.
- Le quota est recalculé depuis les rendez-vous. Les réservations/déplacements
  d'urgentologue écrivent le même document Specialist avant le décompte dans
  une transaction MongoDB, afin de provoquer un conflit et une reprise si deux
  écritures se disputent la dernière place. Aucun compteur à initialiser.
- Dès qu'un urgentologue a un créneau admissible aujourd'hui, la recherche
  RECEPTION renvoie uniquement les urgentologues d'aujourd'hui
  (`presentation: urgent_today`). Les médecins de famille et la section des
  rendez-vous futurs ne sont pas affichés à cette étape.
- S'il n'y a aucun créneau d'urgentologue aujourd'hui (quota atteint, horaires
  absents/épuisés, ou aucun urgentologue admissible), la recherche renvoie
  `presentation: alternatives`. RECEPTION choisit « Revenir demain » ou « Voir
  les créneaux des médecins de famille ». Les créneaux admissibles des médecins
  de famille d'aujourd'hui et des jours suivants ne sont affichés qu'après ce
  second choix. Un message distinct évite de confondre quota atteint et absence
  de disponibilité. Les dates restent visibles. Le retour demain ne réserve rien,
  ne garantit aucune disponibilité et ne constitue pas un triage médical.
- La prise en charge permanente reste une action distincte et explicite.

## Vérification locale / staging avec données fictives uniquement

1. Associer un spécialiste Urgentologue à un compte MEDECIN actif et configurer
   des créneaux walk-in dans sa clinique. Vérifier le refus des créneaux réguliers.
2. Créer 19 consultations sur une même date : la 20e doit réussir et la 21e
   doit être refusée, y compris si elle vise une deuxième clinique du médecin.
3. Terminer une consultation : elle reste comptée et son créneau indisponible.
   Annuler une réservation : une place de quota redevient disponible.
4. Replanifier une des 20 consultations : le remplacement doit réussir sans
   créer une 21e consultation active. Un échec conserve la réservation initiale.
5. Vérifier qu'une nouvelle visite du même patient, après sa consultation
   terminée et dans un autre créneau libre, compte comme une nouvelle consultation.
6. Saturer les urgentologues de la clinique et vérifier les deux choix de
   RECEPTION, puis changer de langue pour vérifier les nouveaux libellés.
7. Preuve de concurrence automatisée sur un vrai replica set MongoDB : avec 19
   consultations, envoyer deux réservations parallèles pour deux patients
   fictifs et deux créneaux différents. Une seule doit réussir ; vérifier le
   total final de 20 et l'absence de dossier/rendez-vous partiellement créé.

## Test automatique reproductible

Depuis la racine du projet :

```bash
npm --prefix backend run test:walkin
```

Prérequis : dépendances backend installées avec `npm ci`, Docker local actif et
image `mongo:7` disponible (`docker pull mongo:7` si nécessaire). La CI exécute
également ce test après les tests unitaires backend.

Le lanceur ne lit pas `.env`, n'utilise pas `MONGO_URI` et refuse un Docker
distant. Il démarre un replica set mono-nœud temporaire sur un port aléatoire
lié uniquement à `127.0.0.1`, sans volume de données persistant. Les conteneurs
ClinIA existants ne sont ni arrêtés ni modifiés.

Le test initialise les collections et les index réels, puis crée dans une
transaction `reception_1`, `clinique_1`, deux urgentologues liés à deux comptes
MEDECIN actifs et `medecin_1`. Chaque urgentologue possède 24 créneaux afin de
prouver que c'est le quota de 20, et non le manque de créneaux configurés, qui
refuse la réservation suivante. Le médecin de famille a un créneau walk-in
le lendemain : un nouveau patient reste soumis à cette règle d'admissibilité.

Les 40 arrivées sont réservées via le vrai routeur HTTP RECEPTION et ses
transactions. La 41e reçoit le signal `allAtCapacity` et l'option du médecin
le lendemain. Une tentative directe chez chaque urgentologue doit renvoyer
HTTP 409 ; aucun dossier, rendez-vous, audit ou verrou de réservation ne doit
subsister de ces transactions refusées. L'acceptation du créneau de demain est
ensuite vérifiée. Après libération d'une place, deux demandes parallèles pour
des patients et des créneaux différents doivent produire un seul succès.

Deux scénarios indépendants couvrent aussi le retour d'un walk-in le même jour,
avec le même urgentologue ou avec l'autre urgentologue. Avant « Complete », une
nouvelle réservation reste refusée au profit du parcours de report. Après
« Complete », la recherche retrouve le même dossier sans rendez-vous en attente
et autorise une nouvelle consultation sur un autre créneau. La première reste
dans l'historique : il ne s'agit ni d'un remplacement ni d'un nouveau dossier.
Le test réserve la dernière place du médecin pour cette deuxième visite et
vérifie le plafond de 20 en comptant également les consultations terminées.

Seules l'horloge (date fictive fixe) et l'identité HTTP authentifiée sont
contrôlées par le test ; il ne teste pas le formulaire de connexion/JWT.
L'affichage des deux boutons, le changement de langue et l'absence de réservation
en choisissant « revenir demain » sont couverts séparément par
`WalkInArrivalPage.test.tsx` dans les neuf langues, sans navigateur réel.

Une transaction globale annulée ne conviendrait pas : les réservations doivent
voir les fixtures validées et utiliser leurs propres sessions concurrentes.
Le nettoyage utilise donc `afterEach` pour supprimer et vérifier la base isolée
après chaque scénario (les fixtures sont recréées dans `beforeEach`),
puis un piège shell `EXIT` supprime le conteneur exact, identifié par son label,
y compris si le test échoue. Un arrêt forcé non interceptable (SIGKILL ou panne
de l'hôte) peut laisser un conteneur `clinia-walkin-test-<UUID>` à retirer après
vérification de son label `clinia.test.run` ; aucune base ClinIA n'est concernée.

Validation locale effectuée : scénario des 41 arrivées, retours le même jour et course concurrente
réussis sur MongoDB réel. Cela ne remplace pas un test de panne/failover sur un
replica set multi-nœuds.

Ce changement ne modifie aucun compte ni rendez-vous existant automatiquement.
