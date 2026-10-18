# Bilan final des tests en production du 18 octobre 2026

La validation fonctionnelle sur https://clinique-ai.ca est terminée pour les
parcours décrits ci-dessous. La version finale déployée est **8da14f2**
(`8da14f2fb14063514fde396440f511aec7600423`), branche `coolify`.
Le dossier fictif utilisé pour les écritures est finalement archivé et absent
des dossiers actifs. Le motif de sa dernière réactivation est conservé après
rechargement complet, avec auteur, date et reçu de vérification.

## Version et état final

| Élément vérifié | Résultat observé |
| --- | --- |
| Dépôt utilisé par VS Code | HEAD `8da14f2`, branche `coolify` |
| Dépôt vu depuis le Dev Container | Même HEAD, aucune modification locale en attente |
| GitHub | `refs/heads/coolify` sur le même SHA complet |
| Coolify | Lien du commit actif sur le même SHA ; déploiement `Finished` |
| Disponibilité après le dernier déploiement | `/api/health/ready` HTTP 200, statut `ok`, MongoDB `connected` |

Le dernier déploiement a commencé le 18 octobre à 14:09:51 UTC et les nouveaux
conteneurs ont démarré à 14:12:30 UTC, soit 10:12:30 à Toronto.
L'alignement des trois environnements a été revérifié après le test et le
nettoyage final. Ce bilan documente cette version applicative ; son ajout à
la documentation ne constitue pas un nouveau déploiement.

## Corrections déployées

| Correction | Comportement obtenu | Référence |
| --- | --- | --- |
| Typage frontend et CI | Correction des erreurs TypeScript ; `npm run typecheck` ajouté au contrôle CI, en complément des tests et du build Vite | [PR 4](https://github.com/pierrot70/ClinIA/pull/4) |
| Accès SUPERADMIN aux dossiers | Le refus `CLINICAL_ACCESS_REQUIRED` explique qu'une autorisation clinique déléguée est nécessaire ; le rôle seul ne donne pas accès aux dossiers | [PR 5](https://github.com/pierrot70/ClinIA/pull/5) |
| Archivage par le médecin | Autorisation de ses propres dossiers uniquement, motif obligatoire, contrôle du propriétaire issu de la session, audit et reçu transactionnels | [PR 6](https://github.com/pierrot70/ClinIA/pull/6) |
| Réactivation par le médecin | Autorisation de ses propres dossiers archivés, sans ouverture des dossiers d'un autre médecin | [PR 7](https://github.com/pierrot70/ClinIA/pull/7) |
| Audit de réactivation | `PATIENT_RESTORE` accepté par le véritable schéma d'audit et par le filtre backend des événements ; correction du refus qui annulait la transaction | [PR 8](https://github.com/pierrot70/ClinIA/pull/8) |
| Conservation du motif de réactivation | Ajout à l'historique du dossier du motif, de l'auteur, de la date serveur et du reçu ; affichage en lecture seule dans le détail | [PR 9](https://github.com/pierrot70/ClinIA/pull/9) |

L'historique est alimenté par ajout atomique lors de la réactivation, dans la
même transaction que le changement d'état et les audits. Les cycles suivants
ne remplacent pas les entrées précédentes. Les champs d'historique sont gérés
par le serveur et exclus des DTO de création et de modification.

Le contenu est exclu des requêtes ordinaires et des listes ; il est chargé
explicitement lors de la lecture autorisée du détail. Le motif libre reste
dans le dossier patient, hors des journaux généraux et des services de
traduction. L'affichage utilise du texte React, sans interprétation HTML.

## Parcours vérifiés en production

Les contrôles généraux ont été réalisés au cours de la session, sur les
versions successivement déployées. Sur la version finale `8da14f2`, le retest
ciblé a couvert la disponibilité, la consultation du dossier fictif,
l'archivage, la réactivation, la persistance de son motif et l'archivage final.
Les contrôles généraux ne sont donc pas présentés comme un nouveau test
exhaustif de tous les modules sur ce dernier commit.

| Parcours | Vérification observée |
| --- | --- |
| Accès public | Accueil et page de connexion en français et en anglais ; ressources frontend disponibles |
| Protection sans session | Refus HTTP 401 des API protégées vérifiées : session, patients, rendez-vous et état de base de données |
| Session SUPERADMIN | Navigation dans les utilisateurs, cliniques, spécialistes, rendez-vous, reçus et état de base ; refus d'accès clinique avec le message explicite après correction |
| Session médecin | Accès aux parcours du médecin et analyse d'un exemple synthétique avec résultat affiché |
| Création du dossier fictif | Création minimale, ouverture via le détail serveur, modification du prénom, rechargement et réouverture confirmant la modification |
| Archivage et réactivation | Succès avec le médecin propriétaire ; reçus de vérification affichés ; présence dans la bonne liste et absence dans l'autre |
| Motif conservé sur `8da14f2` | Motif saisi `desarchivage 1` relu dans l'historique après rechargement complet, avec auteur, date et même reçu |
| Nettoyage final | Dossier présent dans les archives et absent des actifs ; aucune suppression définitive |

Les contrôles de santé et de réplication réalisés pendant la session ont
montré MongoDB connecté et un replica set sain au moment de leur lecture.
Ils ne constituent pas un nouveau test de basculement ou de restauration.

## Dossier fictif et reçus

Seul le dossier **TESTPROD-20261018-CBCC598** a été utilisé pour les écritures
patient de cette validation. Le prénom fictif initial `PatientFictif` a été
modifié en `PatientFictifModifie`. Aucun numéro d'assurance maladie, téléphone,
courriel, adresse ou coordonnées n'a été saisi pour ce dossier ; l'envoi SMS
est resté désactivé.

| Étape | Numéro de vérification |
| --- | --- |
| Création | `WRV-MVDU4Y9T-F789804CD8BA` |
| Modification | `WRV-MVDU662M-F831B78DCA4F` |
| Réactivation avec motif conservé sur la version finale | `WRV-MVDWQNZU-66FD6B54E3E7` |
| Archivage final après vérification du motif | `WRV-MVDWSDZS-9DEB70562E31` |

La réactivation conservée est datée du **18 octobre 2026 à 10:15:14**, heure
locale affichée à Toronto. L'archivage final est daté de **10:16:35**.
L'identifiant de l'auteur est présent dans l'historique du dossier ; il n'est
pas recopié ici. Les confirmations et les saisies de motifs dans les fenêtres
natives du navigateur ont été réalisées par l'utilisateur.

## Validation automatisée de la correction finale

- Backend : `bash scripts/ci-local.sh backend tests`, **885 tests réussis**.
- Frontend : `bash scripts/ci-local.sh frontend tests`, **2 196 tests réussis**,
  contrôles de traduction réussis.
- Frontend : `npm run typecheck` et
  `bash scripts/ci-local.sh frontend build`, réussis.
- Contrôle des secrets suivis et `git diff --check`, réussis.
- [CI GitHub de la PR 9](https://github.com/pierrot70/ClinIA/actions/runs/39134374423) :
  succès des deux jobs, incluant les audits et les intégrations MongoDB prévues
  par le workflow. Le run porte sur la branche de la PR avant fusion ; le
  déploiement du commit de fusion a été vérifié séparément dans Coolify.

Les régressions couvrent notamment le véritable schéma Mongoose, les limites
du motif, les champs obligatoires, le refus de falsification des champs
serveur, le filtrage du propriétaire, les rôles, les erreurs d'audit et de
reçu, l'ajout de plusieurs cycles, les projections de lecture et l'affichage
sans HTML ni inclusion de l'historique dans le PATCH.

## Limites et points restant connus

- Les motifs de réactivation antérieurs à la correction ont été perdus et ne
  sont pas reconstruits. L'historique conserve les nouvelles réactivations.
- Le sélecteur de l'interface des journaux d'audit ne propose pas encore
  l'action Réactivation ; le backend accepte son filtrage et le détail patient
  affiche l'historique conservé.
- Certains autres refus API peuvent encore apparaître sous un message
  générique. Le message SUPERADMIN ciblé a été corrigé et vérifié.
- Le contrôle automatique des fenêtres natives de confirmation reste peu
  fiable dans ce navigateur ; leur validation manuelle ne constitue pas un
  échec du traitement métier, dont le résultat a été relu ensuite.
- Les tests unitaires de transaction simulent les sessions et ne prouvent pas
  à eux seuls un rollback MongoDB réel. Le retest production confirme ici une
  écriture réussie et sa persistance après rechargement.
- Le contenu de l'historique hérite des protections du dossier ; aucun
  chiffrement applicatif supplémentaire du champ n'a été ajouté.
- L'analyse synthétique vérifie le parcours et l'affichage, sans constituer
  une validation clinique humaine ni une preuve indépendante du fournisseur
  IA réellement appelé. Ce bilan n'est pas un audit exhaustif de sécurité ou
  de conformité réglementaire.

## Contributions et portée des revues

```text
Agent-Contribution: backend | Corrections API et schéma, conservation transactionnelle du motif et tests de régression.
Agent-Contribution: frontend | Typage, messages locaux et historique en lecture seule avec traductions et tests.
Agent-Review: security | Revues statiques des droits, du propriétaire, des schémas, des projections et de la minimisation des audits ; pas d'audit réglementaire ou de validation clinique.
Validation: production | Parcours synthétique, persistance après rechargement, archivage final et alignement de la version 8da14f2 confirmés.
```
