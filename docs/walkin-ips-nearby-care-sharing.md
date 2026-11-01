# IPS, orientation WalkIn et accès partagé limité

## Recherche et choix du patient

Le rôle professionnel `IPS` est distinct de `MEDECIN`. Un professionnel de
spécialité IPS doit être lié à un compte IPS actif ; les urgentologues et
médecins de famille doivent être liés à un compte MEDECIN actif. La configuration
refuse une association incompatible, y compris lors d’un changement de spécialité.

Pour la clinique attribuée à RECEPTION, la recherche examine les créneaux
WalkIn d’aujourd’hui et les dates futures configurées, selon la priorité
Urgentologue → IPS → Médecin de famille. Si cette clinique n’a aucun créneau
admissible, les autres cliniques sont examinées par distance croissante, jusqu’à
100 km depuis la clinique de départ, avec une tolérance de 10 km : la limite
effective est donc 110 km inclus, avec la même priorité professionnelle.
La distance est une approximation à vol d’oiseau calculée localement à partir
des coordonnées des cliniques ; ce n’est ni une durée de trajet ni la position du patient.

Le bouton de comparaison recherche explicitement des créneaux strictement
antérieurs à la première proposition, dans les autres cliniques géolocalisées
du même rayon effectif de 110 km. Il examine les trois professions, classe les résultats par date
et heure puis distance et conserve la proposition initiale. Le patient peut
ainsi choisir entre sa clinique et un rendez-vous plus rapide ailleurs. La
réservation nécessite toujours une sélection et une confirmation explicites.

Les cliniques sans coordonnées ne sont pas supposées proches. Une recherche
incomplète le signale et ne conclut pas à l’absence de disponibilité. La clinique
locale reste consultable même sans coordonnées.

La réservation recalcule les possibilités dans sa transaction MongoDB. Un
créneau périmé, au-delà de 110 km ou absent des propositions admissibles est refusé.
Le rayon de référence de 100 km, la tolérance de 10 km et le maximum de 110 km
sont explicites dans la réponse ; aucun arrondi ne permet de dépasser ce maximum.
La preuve de recherche du patient reste liée à la réception, sa session et sa
clinique de départ ; elle est transmise dans un en-tête HTTP pour les recherches,
jamais dans l’URL. Un rendez-vous remplacé est conservé si la transaction échoue.
Les quotas d’urgentologues, contrôles de doublons, reçus et audits restent actifs.

## Absence de disponibilité et GAP

Seulement lorsque la recherche réussit et conclut à l’épuisement des possibilités,
une fenêtre informe RECEPTION qu’elle doit utiliser le Guichet d’accès à la
première ligne (GAP). Une erreur réseau ou des coordonnées insuffisantes ne
déclenchent pas ce message. Cette version n’intègre aucun service GAP, n’ouvre
pas de portail et ne fait aucune réservation gouvernementale.

## Périmètre clinique IPS

Le compte IPS peut consulter ses rendez-vous, ses dossiers pris en charge,
ses consultations attribuées, ajouter des notes et utiliser l’analyse clinique.
Les droits administratifs, la réception, les exports et la gestion globale des
dossiers ne lui sont pas attribués. Le serveur vérifie le compte actif et son
association à un professionnel IPS, indépendamment des liens de navigation.

Pour une consultation, le rendez-vous doit appartenir à l’IPS et viser son
professionnel associé. Dans ce seul cadre, l’IPS peut lire le dossier et ajouter
une note même si un médecin est déjà responsable du patient. Le responsable
reste inchangé et la tentative de le remplacer est refusée. Les API génériques
de dossiers restent limitées aux patients propres de l’IPS ; le rendez-vous
n’ouvre pas un annuaire général. La prise en charge d’un dossier sans responsable
reste une action explicite. Après la clôture d’une consultation d’un dossier
non pris en charge par l’IPS, seules ses propres notes de cette consultation
restent accessibles, sans historique global ni nouvelle note.

## Retour du patient auprès d’une autre IPS

Un nouveau rendez-vous explicitement attribué à une autre IPS autorise celle-ci
à consulter le dossier dans le cadre de cette consultation et à ajouter sa propre
note. L’autorisation de l’IPS précédente n’est pas nécessaire pour ce rendez-vous
attribué. Sans ce rendez-vous, aucune recherche générale de dossiers tiers n’est
ouverte à cette nouvelle IPS.

La responsabilité permanente du dossier reste inchangée. La nouvelle IPS ne
peut pas remplacer un responsable existant par le bouton de prise en charge,
qui ne s’applique qu’aux dossiers sans responsable. Aucun parcours de transfert
entre responsables n’est ajouté par cette évolution.

## Autorisation accordée à un médecin ou urgentologue

L’IPS responsable d’un dossier actif peut choisir un médecin ou urgentologue
actif et lui accorder un accès de lecture et d’ajout de notes. Les durées
proposées sont 1 h, 4 h et 24 h, avec 1 h par défaut ; le serveur impose un
maximum de 24 h. L’IPS peut révoquer cet accès. Le destinataire ne peut ni
modifier les notes existantes, ni transférer la propriété, ni déléguer cet accès.

Le destinataire reçoit une projection clinique limitée : identité minimale,
profil clinique autorisé et notes. RAMQ, coordonnées de contact et clés de
stockage sont exclus. L’accès est vérifié à chaque opération, y compris en cas
de désactivation du compte, changement de responsable ou expiration pendant
un audit. L’IPS garde la propriété et peut lire les notes ajoutées.

Les ajouts et révocations sont transactionnels et audités ; l’échec d’un audit
obligatoire annule l’écriture. Les notes ajoutées sont dans une collection
distincte, sans écrasement d’une note antérieure. Les données ne sont envoyées
à aucun nouveau service externe par le guide WalkIn ou le partage de dossier.
L’analyse clinique conserve ses contrôles de minimisation et de confidentialité.

## Vérification reproductible sur données fictives

Les suites unitaires couvrent le routage, le rayon et les coordonnées manquantes,
les changements de créneau, l’autorisation IPS, les durées et révocations, ainsi
que les choix explicites de l’interface. Les suites d’intégration utilisent de
vrais JWT et routeurs HTTP et un replica set MongoDB local jetable, sans `.env`
ni base applicative. Les refus de périmètre, l’atomicité et les courses avec
révocation y sont vérifiés.

```bash
bash scripts/run-urgentologist-walk-in-integration.sh --care-access
bash scripts/run-urgentologist-walk-in-integration.sh --ips-scope
bash scripts/run-urgentologist-walk-in-integration.sh --ips-consultations
npm --prefix backend run test:walkin
bash scripts/ci-local.sh
```

Les trois nouvelles suites font partie de l’étape d’intégration de la CI.
Le compte rendu de validation doit préciser les commandes et résultats réellement
observés sur la version finale. Ces tests ne constituent pas une revue clinique
par un professionnel de santé ni un test effectué en production.

Agent-Contribution: backend | Routage IPS/WalkIn, comparaison de créneaux et partage limité avec audits transactionnels.
Agent-Contribution: frontend | Choix explicites, fenêtre GAP, navigation IPS et interface de partage, labels dans neuf langues.
Agent-Review: security | Revue des périmètres propriétaire/destinataire et des contrôles d’expiration ; limites documentées dans le compte rendu final.
