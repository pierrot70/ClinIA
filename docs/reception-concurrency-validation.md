# Validation multi-RECEPTION — 2026-09-11

Référence examinée : `5c034b2`, branche `coolify`. Validation locale uniquement,
avec données fictives ; aucune connexion à Coolify. Après validation, correction
autorisée du retour 500 pour le conflit de création d'identité décrit ci-dessous.

## Méthode

`backend/integration/receptionConcurrency.integration.js` ajoute deux comptes
RECEPTION actifs associés à la même clinique, deux comptes MEDECIN et une seconde
clinique non autorisée. Les connexions passent par le vrai routeur `/api/auth/login`.
Les requêtes utilisent leurs jetons distincts et traversent `verifyJWT`,
`requireRole`, le routeur RECEPTION, les services, les index et les transactions
MongoDB réels. Le routeur de rendez-vous sert aux annulations/complétions par le
médecin autorisé ; RECEPTION ne reçoit aucun nouveau droit d'annulation.

Une barrière propre au serveur de test libère les deux requêtes après leur
authentification. Elle vérifie deux arrivées et expire après cinq secondes.
L'horloge est fixe, mais les sockets, compteurs, écritures et reprises de
transaction ne sont pas simulés. Les fixtures sont recréées dans une transaction
pour chaque test ; la base est supprimée et son absence de collections vérifiée
après chaque test, y compris en échec. Le lanceur retire ensuite le conteneur
MongoDB temporaire, sans volume de données persistant.

## Résultats par point

Exécution initiale : **20 tests réussis, 1 échec sur 21** (18 nouveaux tests
multi-RECEPTION et 3 tests existants). L'échec reproduit le retour HTTP 500 décrit
ci-dessous ; le code MongoDB `11000` est également vérifié par le test.

Après correction : **21/21 tests d'intégration réussis**, conteneur temporaire
nettoyé ; **561/561 tests backend et 1122/1122 tests frontend réussis**.
La page RECEPTION compte **69/69 tests réussis**, dont le conflit dans les neuf langues.

| Point | Résultat observé |
| --- | --- |
| 1. Même créneau | Une création HTTP 201, un refus HTTP 409, un seul patient/rendez-vous/compteur. Audit attribué à la bonne réception. |
| 2. Même patient | Patient connu : une seule réservation active, autre demande en 409. Nouveau patient créé simultanément : index anti-doublon efficace ; après correction, réponse perdante **409 PATIENT_ALREADY_EXISTS**, auparavant 500. |
| 3. Dernière place | À 19 consultations, une seule des deux demandes est acceptée. Total final 20, aucun dossier partiel. |
| 4. Annulation/report | Reports concurrents : un seul remplacement, liens historiques cohérents. Conflits avec annulation/réservation : pas de double créneau actif dans les scénarios exécutés. |
| 5. Autorisation | Autre clinique refusée pour les deux réceptions ; jeton absent/invalide, mauvais rôle et réception désactivée refusés. Médecin devenu inactif, sans compte ou avec mauvais rôle : masqué et réservation refusée. |
| 6. Atomicité/audit | Rejet réel de l'insertion finale d'audit : rollback du patient, rendez-vous et compteur pour les deux comptes. Les audits inspectés ne contiennent ni noms patients, ni RAMQ, ni coordonnées, ni texte clinique. |

## Défaut reproduit — création simultanée du même nouveau patient

1. Les deux réceptions demandent la création de la même identité fictive, sur
   deux médecins/créneaux différents.
2. Elles peuvent toutes deux passer la recherche préalable `Patient.exists`,
   effectuée avant les transactions dans `createWalkInPatientAndAppointment`.
3. L'index `owner_health_insurance_number_unique_idx` empêche la seconde création
   et MongoDB retourne un doublon (code numérique `11000`).
4. Ce conflit n'est pas traduit en erreur métier par ce parcours ; le gestionnaire
   générique du routeur RECEPTION renvoie `PERSISTENCE_FAILED`, HTTP 500.

La base conserve **un patient et un rendez-vous**, pas de doublon. Le problème
est la réponse incorrecte reçue par la réception perdante. La correction proposée
est de reconnaître ce doublon précis et retourner `PATIENT_ALREADY_EXISTS`,
HTTP 409, pour demander une nouvelle recherche du patient. Ne pas convertir
indifféremment tous les doublons MongoDB : d'autres index protègent les créneaux.

La correction reconnaît le code `11000` uniquement avec les quatre clés exactes
de l'index d'identité patient. Elle renvoie `PATIENT_ALREADY_EXISTS` (HTTP 409),
sans transmettre le message MongoDB ni ses valeurs. Les autres erreurs restent
inchangées. L'interface affiche un rappel de refaire la recherche avant de réserver,
avec source française versionnée et traductions dans les huit autres langues.

Le test conserve l'attente correcte `[201, 409]`. Il n'est ni ignoré ni déclaré
« attendu en échec ». Le test retient uniquement les codes numériques des erreurs MongoDB,
jamais leurs messages ou documents qui pourraient contenir des identifiants.

## Reproduction

Depuis la racine du dépôt, avec Docker local et `mongo:7` déjà disponible :

```bash
npm --prefix backend run test:walkin
npm --prefix backend run test:walkin -- -t '1. Same slot'
npm --prefix backend run test:walkin -- -t '2. Same patient'
npm --prefix backend run test:walkin -- -t '3. Last daily'
npm --prefix backend run test:walkin -- -t '4. Booking'
npm --prefix backend run test:walkin -- -t '5. API authorization'
npm --prefix backend run test:walkin -- -t '6. Atomic failure'
```

## Limites à ne pas confondre avec une certification de sécurité

- Les audits gardent les IDs internes du patient/de la ressource pour la
  traçabilité. Ce sont des données pseudonymisées, pas des journaux anonymes ;
  leur accès et leur conservation nécessitent une politique appropriée.
- Les contrôles portent sur les collections d'audit clinique et les réponses
  testées, pas sur l'ensemble des journaux d'infrastructure de Coolify.
- Deux sessions HTTP distinctes, un serveur Node et un replica set mono-nœud :
  pas de test de bascule multi-nœuds, de charge prolongée ni de plusieurs instances
  applicatives dans cette validation.
- Une barrière de requêtes exerce la concurrence mais n'explore pas tous les
  entrelacements possibles d'exécution. Les index et transactions restent les
  garanties structurelles.
- Les désactivations sont effectuées après affichage des disponibilités mais
  avant l'envoi de la réservation ; une désactivation exactement concurrente
  à une transaction déjà en cours n'est pas certifiée ici.
