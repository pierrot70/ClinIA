# Exploitation du quota courriel

Le plafond partagé est de **150 tentatives SMTP par jour UTC**, pour tous les
backends. Une réservation MongoDB précède chaque envoi de récupération ou de
confirmation de changement de mot de passe. Une erreur SMTP consomme la place ;
une écriture MongoDB incertaine peut aussi la consommer. Ne jamais décrémenter,
effacer ou recréer le compteur du jour pour rétablir les envois.

## Signaux opérationnels

Le service écrit `CLINIA_EMAIL_QUOTA` suivi d'un objet JSON dans les journaux
des backends. Les champs autorisés sont `event`, `day`, `limit` et, seulement
lorsqu'il est confirmé, `count`. Aucun destinataire, code de récupération,
jeton, secret ni erreur MongoDB brute n'est journalisé.

| Événement | Déclenchement | Action |
| --- | --- | --- |
| `EMAIL_QUOTA_APPROACHING_LIMIT` | Réservation numéro 120 (80 %, 30 restantes) | Avertir l'exploitation et examiner la consommation. |
| `EMAIL_DAILY_LIMIT_REACHED` | Réservation numéro 150, puis chaque refus | Signaler l'indisponibilité des prochains envois. La tentative numéro 150 reste autorisée. |
| `EMAIL_QUOTA_UNAVAILABLE` | Initialisation ou réservation MongoDB en échec | Incident immédiat ; aucun envoi SMTP pour cette tentative. |

Le comptage atomique émet le signal de seuil une fois pour l'ensemble des
backends. Une interruption entre réservation et journalisation peut perdre ce
signal : consulter aussi le compteur MongoDB en lecture seule lors du suivi.
Une réservation échouée après écriture peut déjà avoir franchi le seuil ;
le signal d'indisponibilité reste alors la référence.

## Alerte dans l'administration ClinIA

Le bloc quota est visible pour les rôles ADMIN et SUPERADMIN. Il lit le compteur
partagé du jour UTC, à l'ouverture puis toutes les 60 secondes : consommation,
places restantes, avertissement dès 120 tentatives, quota épuisé dès 150.
Le jour UTC est affiché pour éviter une confusion avec le jour local.
La lecture ne réserve aucune place et n'envoie aucun courriel.

`GET /api/db-status/email-quota` utilise la validation JWT et le contrôle
ADMIN/SUPERADMIN existants. La réponse exclut toute donnée personnelle et les
erreurs techniques brutes ; elle n'est pas mise en cache.

Une erreur de lecture MongoDB ou de chargement affiche une indisponibilité,
jamais un compteur nul présenté comme sain. Une réservation MongoDB refusée
est aussi signalée par l'instance qui l'a observée, jusqu'à une nouvelle tentative de réservation
confirmée par MongoDB ou au nouveau jour UTC. Ce dernier indicateur est en mémoire : il est
local au processus, disparaît à son redémarrage et n'est pas partagé entre
instances. Les événements `EMAIL_QUOTA_UNAVAILABLE` des deux backends restent
la preuve opérationnelle des refus. Une lecture réussie ne prouve pas à elle
seule que MongoDB autorise les écritures.

L'alerte est consultable lorsque l'administration est ouverte. Ce changement
ne configure pas de notification externe ni d'alerte lorsque personne n'est
connecté. Le statut SMTP n'est pas déduit du compteur.

## Quand la limite approche ou est atteinte

1. Lire le compteur de la date UTC courante dans la collection
   `emaildailyquotas` de la base applicative, avec un accès en lecture seule :
   `db.emaildailyquotas.findOne({ _id: new Date().toISOString().slice(0, 10) })`.
2. Vérifier si la hausse vient du trafic attendu ou de demandes répétées, sans
   extraire d'adresses ni de codes dans les journaux. Vérifier les limitations
   de requêtes et l'état SMTP ; des échecs SMTP consomment aussi le quota.
3. Prévenir l'exploitation de l'impact sur récupération et confirmations. Pour
   une récupération urgente, appliquer la procédure administrative existante
   avec vérification d'identité et changement obligatoire du mot de passe.
4. Si nécessaire, désactiver temporairement la récupération via
   `PASSWORD_RECOVERY_ENABLED=false` suivant le processus de déploiement habituel.
   Ne pas augmenter le plafond et ne pas contourner le compteur.
5. Le jour UTC suivant utilise un nouveau document. Vérifier une réservation
   contrôlée et SMTP avec un compte synthétique, puis réactiver la récupération
   si elle avait été désactivée. À Toronto, minuit UTC correspond à 19 h ou 20 h
   la veille selon l'heure saisonnière : utiliser UTC pour le suivi.

## Quand MongoDB refuse la réservation

1. Considérer la récupération par courriel indisponible même si SMTP est sain.
   Les réponses publiques restent génériques ; elles ne prouvent pas un envoi.
2. Vérifier connectivité, authentification du compte applicatif, primaire du
   replica set, quorum majoritaire, disque et latence d'écriture. La réservation
   impose `w: majority`, `j: true`, `wtimeout: 5000` ; ne pas les affaiblir.
3. Après un timeout, ne pas renvoyer automatiquement la même tentative et ne pas
   rembourser de place : l'écriture a peut-être réussi. Réparer MongoDB puis
   relire le compteur, sans le modifier.
4. Vérifier le retour de MongoDB et une récupération synthétique complète.
   Documenter début/fin de l'incident, événements, compteur UTC et résultat SMTP,
   sans données personnelles. Réactiver le parcours si nécessaire.

## Validation locale

`cd backend && npm test -- --run services/__tests__/emailDailyQuota.test.js services/__tests__/passwordRecoveryEmail.service.test.js`

Ces tests vérifient les seuils, les refus, l'absence de données sensibles dans
les alertes et le blocage SMTP lorsque la réservation échoue. Ils ne prouvent
ni la collecte en production ni la réception d'une notification externe.

## Test staging sans consommer le quota applicatif

Après redémarrage des backends staging sur les nouvelles sources :

```bash
docker exec -e CLINIA_EMAIL_QUOTA_DRILL=1 clinia_mongo_rs-backend-1 node scripts/email-quota-drill.mjs
docker exec -e CLINIA_EMAIL_QUOTA_DRILL=1 clinia_mongo_rs-backend-replica-1 node scripts/email-quota-drill.mjs
```

Le programme refuse la production et les noms MongoDB non locaux. Il crée une
collection quota avec un nom synthétique unique et vérifie son absence avant
création. Aucun courriel n'est envoyé. Il vérifie le seuil 120, un refus MongoDB
par conflit d’index unique synthétique dans cette seule collection, la reprise, le seuil 150 et le
refus suivant. `CLEANUP_OK` confirme la suppression de cette seule collection.
Une interruption forcée peut empêcher le nettoyage ; ne supprimer que la
collection exacte du run après arrêt du processus.

Vérifier aussi le bloc dans l'administration staging sur grand et petit écran.
Les scénarios de seuil du programme isolé ne modifient pas le compteur réel
lu par l'interface : les états visuels sont couverts par les tests du composant.

## Validation du 10 octobre 2026

- CI complète : `CI_LOCAL_PASSED`, 1 264 tests frontend, 800 backend,
  59 régressions auth, 8 compteur login, 33 récupération, 3 quota et
  21 réservation ; build, audits et nettoyages réussis.
- Drill quota sur chacun des deux backends staging : seuil 120, refus MongoDB,
  reprise, plafond 150, refus suivant et `CLEANUP_OK` confirmés.
- API quota staging sans authentification : HTTP 401.
- Aucun test de quota ni déploiement de ce changement en production à cette date.

Agent-Contribution: backend | événements quota minimisés, statut administratif protégé et test staging isolé
Agent-Contribution: frontend | bloc quota ADMIN/SUPERADMIN, jour UTC, tentatives restantes et actualisation 60 secondes
Agent-Review: security | revue des champs exposés, contrôle d'accès existant, absence de secrets dans les alertes et limites du signal local
Validation: bash scripts/ci-local.sh et drills quota staging | réussis, collections synthétiques nettoyées
