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

## Assistant WalkIn intégré

Depuis le 31 octobre 2026, la page `/walk-in-arrival` propose un guide local
facultatif pour le rôle `RECEPTION`. Le lien principal « Arrivée sans rendez-vous »
ouvre directement ce parcours dans les menus ordinateur et mobile ; les rôles
cliniques conservent leur lien « Analyse clinique ». Le bouton « Activer l’assistant WalkIn »
ouvre un panneau de progression. Le guide met en évidence la zone utile et peut
cliquer sur les commandes existantes de recherche, de sélection d’une identité
explicitement vérifiée et d’affichage des disponibilités. L’utilisateur saisit
les renseignements et choisit le médecin et le créneau avec le patient.

Pour un nouveau patient, le guide ouvre les champs prénom et nom après le choix
du créneau. « Vérifier les renseignements » cible un champ manquant ou le
récapitulatif. « Aller à la confirmation » met seulement le focus sur le bouton
de création ou de remplacement : une action distincte de l’utilisateur reste
nécessaire pour enregistrer. Le succès est affiché après la réponse de ClinIA.
Un rendez-vous antérieur est conservé jusqu’à la confirmation du remplacement.

« Arrêter l’assistance » rend la main et restitue le focus au bouton
d’activation sans effacer la saisie. Une opération ClinIA déjà demandée peut se
terminer. Un changement de clinique arrête le guide et efface le contexte de
saisie précédent ; un changement de RAMQ invalide la sélection et les réponses
asynchrones antérieures. Les conflits d’identité ou de replanification imposent
un retour à une recherche fraîche. Les erreurs de créneau demandent une nouvelle
lecture des disponibilités. Plusieurs rendez-vous existants ne sont jamais
départagés automatiquement.

### Données et autorisations

Le guide fonctionne selon des étapes et règles programmées, sans modèle IA,
appel OpenAI, capture d’écran, lecture globale du DOM, télémétrie ou stockage
persistant ajoutés. Ses libellés français versionnés et leurs huit traductions
sont résolus localement. Les opérations administratives continuent d’utiliser
les services habituels `/api/reception` de ClinIA avec leurs validations, droits
de clinique, preuves de recherche et audits. Le guide ne fournit ni triage ni
décision clinique et ne nécessite aucune installation sur le poste ou téléphone.

### Extension et vérification

Le composant `GuidedWorkflow` reçoit les textes, l’étape et les actions connues
du parcours appelant. `walkInGuide.ts` définit le parcours `walk-in`, version 1,
à partir d’indicateurs d’état uniquement. Aucune référence à une commande de
confirmation finale n’est cliquée par le guide. De futurs parcours peuvent
réutiliser le panneau avec leurs propres règles et références explicites.

La suite `WalkInArrivalPage.guide.test.tsx` exerce la vraie page et le véritable
adaptateur `receptionApi` avec le transport HTTP simulé. Elle vérifie notamment
les seules URL `/api/reception`, l’absence de requête directe externe, les choix
explicites, la confirmation séparée, l’arrêt, les réponses périmées et les reprises
après conflit. Les autres tests WalkIn et les tests serveur de permissions,
preuve de recherche et réservation restent applicables.

```bash
npm --prefix frontend test -- --run src/pages/WalkInArrivalPage.guide.test.tsx src/pages/WalkInArrivalPage.test.tsx src/i18n/walkInGuideLabels.test.ts
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Ces tests d’interface utilisent des données fictives et un transport simulé ;
ils ne constituent pas un rejeu de réservation sur une base de production.

Agent-Contribution: frontend | Guide local WalkIn, saisie manuelle et confirmation séparée, libellés versionnés dans neuf langues.
Agent-Review: security | Références de commandes limitées, absence de transmission OpenAI, reprise après conflit et protections serveur réception existantes.
Validation: Tests ciblés de parcours et labels, types, compilation et contrôles de traduction ; résultats détaillés dans le compte rendu de validation.

### Reçus personnels du compte réception

Le lien « Mes reçus » ouvre `/my-write-receipts` pour `RECEPTION` et les rôles
cliniques. Le serveur impose l’auteur connecté pour la liste personnelle et
retourne les métadonnées techniques des écritures réussies avec un identifiant
de vérification. Les audits globaux restent réservés aux administrateurs.
La réception ne dispose pas du filtre de recherche dans l’annuaire patient ;
son accès générique à `/api/patients` reste interdit.

La page peut être vide si le compte ne possède pas de reçu avec un identifiant
de vérification. Les anciens événements WalkIn sans cet identifiant ne sont
pas transformés en reçus rétroactivement par cette correction.

Les dates de début et de fin sont préremplies au jour courant selon le fuseau
configuré dans le navigateur de l’utilisateur, indépendamment de la langue UI.
« Réinitialiser » recalcule ce jour local et efface les autres filtres. La recherche
personnelle transmet les instants UTC du début local inclus (`startAt`) et du
minuit suivant le dernier jour exclu (`endBefore`), en plus des dates affichées.
Le serveur valide ces instants et leur donne priorité pour chaque borne ; les
clients historiques sans instants conservent leur traitement des dates existant.
La durée suit le calendrier local, y compris les jours de 23 ou 25 heures.
Aucune localisation GPS ni requête OpenAI n’est nécessaire. Un appareil configuré
avec un autre fuseau suivra ce réglage ; cette détection ne détermine pas la
position géographique réelle de l’utilisateur.

### Reçus vérifiés des nouvelles réservations WalkIn

Chaque nouvelle requête de réservation génère côté serveur un identifiant WRV
distinct. Cet identifiant, le contexte de requête et un relevé réel du replica
set sont transmis aux audits de rendez-vous écrits dans la transaction MongoDB
avec acquittement `majority` et journalisation. La réponse expose un reçu
`CONFIRMED` seulement après le succès des audits obligatoires et du commit.
Le relevé du replica set décrit son état observé avant l’écriture ; il ne prouve
pas à lui seul la présence du document sur chaque secondaire.

Lors d’un déplacement, l’audit UPDATE de l’ancien rendez-vous et l’audit CREATE
du nouveau partagent le même WRV de requête. Un échec de l’audit ou du commit
ne renvoie aucun reçu confirmé. Les audits historiques sans WRV restent tels
quels : aucun reçu n’est fabriqué rétroactivement. « Mes reçus » continue de
limiter les résultats vérifiés à l’auteur connecté.

Les tests `reception.routes.test.js` et `reception.service.test.js` couvrent la
génération, la propagation, les retries et les échecs. L’intégration locale
`receptionConcurrency.integration.js` vérifie les identifiants persistés du
déplacement et le rollback réel lors du rejet d’insertion d’audit sur un MongoDB
jetable isolé.


### Rendez-vous planifiés des jours antérieurs

Pour une nouvelle arrivée, les rendez-vous bloquants sont ceux encore
`scheduled` dans la clinique sélectionnée dont la date est aujourd’hui ou
ultérieure, selon le calendrier `America/Toronto` déjà utilisé pour les horaires.
Un rendez-vous d’aujourd’hui reste bloquant même si son heure est passée.
Plusieurs rendez-vous actuels ou futurs restent un conflit à résoudre.

La recherche RAMQ signale seulement `hasHistoricalScheduledAppointments: true`
si des rendez-vous `scheduled` des jours antérieurs, sans déclaration de présence
administrative, existent dans cette même clinique. Elle n’en retourne ni les détails ni les identifiants. Ces anciens
rendez-vous ne bloquent pas la nouvelle arrivée et ne peuvent pas être choisis
comme remplacement. Aucun statut historique n’est modifié automatiquement.
La vérification finale recalcule le jour dans chaque tentative de transaction,
après la preuve d’accès et le verrou patient. Les capacités quotidiennes et les
reçus WRV continuent de suivre la nouvelle réservation réelle.

### Outils cliniques et rôle RÉCEPTION

Les pages « Mode rapide » et « Résumé patient » présentent actuellement des
exemples cliniques statiques. Elles sont réservées aux mêmes rôles que l’analyse
clinique (`USER`, `MEDECIN`, `ADMIN`, `SUPERADMIN`). Leurs liens sont masqués pour
RÉCEPTION dans les menus ordinateur et mobile, et les deux URL sont protégées
indépendamment du menu. Un accès direct par RÉCEPTION redirige vers l’arrivée
sans rendez-vous ; une personne non connectée passe par la connexion.
Cette restriction de navigation ne modifie aucun droit API ni la démo publique
distincte. Les tests du vrai routeur et du menu vérifient les refus et le maintien
des accès des rôles cliniques.


### Déclaration administrative de présence à un ancien rendez-vous

Après confirmation explicite de l’identité, la réception peut demander au
patient s’il s’est présenté à chacun des anciens rendez-vous non régularisés.
Le choix explicite « Présent » / « Absent » constitue une déclaration du
patient (`patient_statement`), enregistrée séparément dans
`attendanceResolution`. Il ne valide pas une consultation médicalement et ne
remplace pas l’évaluation du médecin.

Le statut clinique du rendez-vous reste inchangé (`scheduled`) : cette action
ne clôture pas les notes du médecin, ne supprime pas la consultation de ses
listes, ne modifie pas la propriété du dossier, les données cliniques, les
capacités quotidiennes ou la facturation. Aucun statut `completed` ou
`no_show` n’est déduit automatiquement d’une date ou de cette déclaration.

`POST /api/reception/historical-appointments/query` reçoit dans le corps
`{ clinic, patientId, bookingProof }`. La preuve récente issue de la recherche
RAMQ exacte est vérifiée sans être consommée, pour l’acteur, sa session, le
patient et la clinique attribuée. La réponse contient au plus 50 rendez-vous
`{ _id, date, time }` et `hasMore`. Seuls les rendez-vous `scheduled` antérieurs
au jour Toronto et sans `attendanceResolution` (absente ou `null`) apparaissent.
Ni identité supplémentaire, ni raison clinique, ni coordonnées ne sont retournées.

`PATCH /api/reception/historical-appointments/:id/attendance` reçoit
`{ clinic, patientId, bookingProof, outcome }`, avec `outcome` strictement
`attended` ou `not_attended`. Aucun autre champ n’est accepté. La transaction
consomme la preuve, verrouille le patient actif, recalcule le jour Toronto et
met à jour uniquement un ancien rendez-vous encore non régularisé dans ce
même périmètre. La source, l’heure et l’acteur sont imposés par le serveur.
Une déclaration existante ne peut pas être écrasée par cet endpoint.

Les audits obligatoires, le reçu WRV UPDATE et une nouvelle preuve sont écrits
dans la même transaction. La réponse après commit contient le rendez-vous
minimal avec son `outcome`, la nouvelle `bookingProof` à substituer à l’ancienne
et le reçu de vérification. Elle permet de traiter le rendez-vous suivant ou
de poursuivre la réservation. Un échec restaure l’ancienne preuve et ne conserve
ni déclaration partielle, ni audit partiel, ni nouvelle preuve. La liste et le
signal d’historique excluent ensuite ce rendez-vous régularisé. Les preuves
restent dans les corps HTTP ; aucune preuve n’est placée dans les URL.
