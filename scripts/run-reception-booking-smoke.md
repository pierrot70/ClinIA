# Parcours RECEPTION par curl, avec nettoyage

À lancer sur l'hôte Coolify, avec Bash, Docker, curl et jq. Le script et son
helper doivent être dans le même dossier. Il utilise les modèles et la
connexion MongoDB de l'image backend déjà déployée : aucun rebuild nécessaire.

Depuis le terminal local WSL à la racine du dépôt :

```bash
scp scripts/run-reception-booking-smoke.sh scripts/reception-booking-smoke-helper.mjs root@138.197.142.207:/tmp/
```

Sur le serveur :

```bash
bash /tmp/run-reception-booking-smoke.sh
```

Par défaut, URL `https://clinique-ai.ca` et découverte d'un unique conteneur
`backend-` hors `backend-replica-`. Si plusieurs correspondent, préciser :

```bash
BACKEND_CONTAINER=nom-exact BASE_URL=https://clinique-ai.ca bash /tmp/run-reception-booking-smoke.sh
```

## Ce qui est exécuté

1. Readiness publique 200 et MongoDB connecté.
2. Création transactionnelle de cinq objets synthétiques : clinique, compte
   RECEPTION limité à cette clinique, compte MEDECIN, spécialiste et patient.
   Créneau dédié à J+30 ; aucun créneau d'un vrai médecin n'est utilisé.
3. Vraie connexion RECEPTION via curl, recherche de l'identifiant synthétique,
   vérification de l'ID patient renvoyé, puis réservation (201).
4. Rejeu exact de la preuve : 403 `RECEPTION_LOOKUP_REQUIRED` attendu.
5. Vérification MongoDB d'une unique réservation planifiée, puis logout HTTP.
6. Nettoyage transactionnel des objets possédés, compteurs, preuves et sessions,
   puis vérification de leur absence. Historique d'audit conservé.

Les deux dernières confirmations attendues sont :

```text
CLEANUP_OK operational_fixtures=0 audits=retained
RECEPTION_BOOKING_SMOKE_PASSED
```

La préparation et le nettoyage utilisent Docker/MongoDB, car les routes
RECEPTION ne permettent pas l'administration des comptes et cliniques ni leur
purge. La connexion et les opérations métier passent par curl, le proxy public
et les vraies routes déployées. Aucun JWT n'est fabriqué. Aucun test OpenAI,
email ou SMS n'est déclenché. Les index ne sont pas créés/modifiés par le helper.

## En cas d'échec ou d'interruption

Un refus HTTP définitif déclenche le nettoyage ; le bilan du test reste en échec.
Un timeout, une réponse 5xx, une réponse invalide, ou une préparation interrompue
peut laisser une opération serveur en cours. Le script tente de désactiver les
comptes synthétiques et conserve le répertoire privé de reprise et son UUID.
Il affiche `CLEANUP_UNCONFIRMED`, jamais un faux succès de nettoyage.
Un arrêt brutal (SIGKILL, perte de l'hôte) ne permet pas l'exécution du trap.

Après confirmation que les anciennes opérations sont terminées (ou après
redémarrage des backends qui les traitaient), relancer avec le même UUID :

```bash
bash /tmp/run-reception-booking-smoke.sh --cleanup UUID_AFFICHE
```

Le nettoyage est idempotent et vérifie IDs et marqueurs. Il refuse une référence
étrangère ou un marqueur modifié. Conserver le dossier privé si ce contrôle échoue.
Une reprise réussie ne supprime pas l'ancien dossier local : après contrôle de
`CLEANUP_OK`, supprimer uniquement le chemin `RECOVERY_DIR` de cette exécution.
Ce dossier contient des identifiants temporaires ; ne pas le partager.

Les comptes/passwords/tokens ne sont pas imprimés ni passés dans les arguments
curl. Les données de test sont synthétiques ; les audits obligatoires ne sont
pas effacés. Les cliniques/comptes synthétiques peuvent être visibles brièvement
par les administrateurs pendant le test. Le résultat est un contrôle séquentiel,
pas une preuve de concurrence, de basculement ou de revue clinique.

## Validation du script sans production

```bash
bash scripts/run-urgentologist-walk-in-integration.sh --reception-smoke
```

MongoDB jetable local et vraies routes Express, requêtes curl réelles. Un shim
Docker exécute le helper avec les modèles locaux ; le proxy et l'image Coolify
ne sont pas couverts. Les 21 scénarios du rapport standard restent inchangés.

Validation locale du 27 septembre 2026 : six tests réussis, conteneur MongoDB
jetable supprimé. Parcours complet, refus HTTP définitif, erreur amont 504 avec
reprise idempotente, marqueur modifié, conservation d'une autre exécution et
référence étrangère couverts. Les signaux pendant la préparation et les écritures
serveur réellement retardées ont été revus dans le code, sans injection de ces
courses dans cette suite. Aucun lancement en production par l'agent.

```text
Agent-Contribution: backend | script curl, fixtures transactionnelles, nettoyage et tests isolés
Agent-Review: security | propriété des objets, interruptions et limites des écritures tardives ; revue de code
Validation: bash scripts/run-urgentologist-walk-in-integration.sh --reception-smoke | 6/6, CLEANUP_OK
```

## Exécution Coolify confirmée le 27 septembre 2026

Résultats fournis par l'utilisateur pour l'exécution
`74a5d57d-a1a6-4bd2-97fe-7d2d5bc5e841` sur le Droplet : connexion et recherche
réussies, réservation HTTP 201, rejeu HTTP 403 `RECEPTION_LOOKUP_REQUIRED`,
une réservation vérifiée en base, logout et `CLEANUP_OK` suivis de
`RECEPTION_BOOKING_SMOKE_PASSED`. Le backend avait auparavant été vérifié au
commit `beb3db433f4d18d7c91fbe551aff32bf12cdbb45` sur les deux instances.

Cette exécution utilisait la vraie base applicative avec des objets synthétiques
dédiés, supprimés ensuite ; les audits sont conservés. Les six tests de
développement utilisaient une base jetable distincte. Ce résultat fourni par
l'utilisateur ne prouve ni concurrence ni basculement. Une infrastructure de
test isolée permanente sur le Droplet est envisagée, mais n'a pas été créée.
