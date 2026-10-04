# Réinitialisations administratives : vérification du 4 octobre 2026

Base : `f63c817`, branche `maintenance/auth-admin-reset-review`.
Constat initial local, puis correction dans `maintenance/auth-admin-reset-hardening`.
Aucun push ou changement de production pendant cette correction.

## Défaut reproduit

Avant correction, les services `resetUserPassword` et `completeForcedPasswordChange` changeaient
le hash et positionnaient `authTokenInvalidBefore`, sans vider les identifiants
de session ni incrémenter `authVersion`. Une nouvelle connexion remettait le
marqueur temporel à null et conservait l'ancien identifiant de session.

Dans chacun des deux parcours, un JWT synthétique signé, encore non expiré,
est accepté avant le changement, refusé immédiatement après, puis accepté
à nouveau après connexion avec le nouveau mot de passe. L'exploitation
supposerait la possession d'un ancien jeton valide ; aucune exploitation
en production n'est constatée. Le parcours de récupération par courriel
est distinct et possède déjà une invalidation par génération persistante.

## Preuve initiale, avant correction

```bash
bash scripts/run-urgentologist-walk-in-integration.sh --recovery-security -t 'characterizes old JWT reuse'
```

Résultat : deux comportements reproduits, 17 tests non sélectionnés,
`CLEANUP_OK`. Journal : `/tmp/clinia-admin-reset-review.log`.
MongoDB local jetable, comptes synthétiques, audit et courriels simulés.
Ces caractérisations initiales ont été remplacées : la commande filtrée
ci-dessus décrit la reproduction historique, pas le test du correctif actuel.

## Correction implémentée et validée localement

Les deux parcours utilisent une transaction MongoDB : changement de hash,
incrément de génération, suppression des sessions, codes/grants de récupération,
challenges et inscriptions MFA en attente, puis révocation des familles refresh.
Le MFA inscrit et ses codes de secours sont préservés. Le filtre garde le hash
et la génération lus avant bcrypt ; les reprises ne peuvent pas écraser un
changement plus récent. Un échec de révocation annule toute la transaction.

Le changement obligatoire exige aussi un compte actif, le marqueur de changement
obligatoire, un SID encore actif et la génération de la requête authentifiée.
`verifyJWT` transmet cette génération au service. Même un ancien SID réintroduit
par une écriture tardive ne suffit pas à autoriser une requête d'ancienne génération.
Les deux routes renvoient 401 pour une demande invalidée pendant son exécution.
Les audits restent hors transaction pour ne pas être répétés lors des reprises.

Les deux caractérisations sont maintenant des assertions de refus permanent.
Des tests couvrent concurrence, rollback, login tardif, MFA, récupération et
parcours complet du mot de passe temporaire. Aucun changement frontend requis.
Le replica set MongoDB reste nécessaire ; aucun nouvel index ni migration.
La correction doit être déployée sur tous les backends pour être effective.

Agent-Contribution: backend | deux reproductions déterministes sur MongoDB jetable
Validation: commande ci-dessus | deux défauts reproduits, nettoyage confirmé ; aucune validation production

## Validation du correctif

```bash
bash scripts/run-urgentologist-walk-in-integration.sh --recovery-security
```

31 scénarios réussis, `CLEANUP_OK`, journal
`/tmp/clinia-admin-reset-integration-final.log`.

Agent-Contribution: backend | remplacement transactionnel et tests de régression
Agent-Review: security | revue statique de la génération authentifiée, du CAS et des révocations ; aucun test production

Validation: bash scripts/ci-local.sh | CI_LOCAL_PASSED : 1 245 tests frontend, 790 backend, 59 auth réexécutés, 8 compteur, 31 récupération, 3 quota et 21 réservation ; audits/build/nettoyages réussis

Journal complet : `/tmp/clinia-admin-reset-ci.log`. Rapport réservation :
`592997f6-048f-4c5e-9de6-1949c214c49a`, arbre modifié testé avant commit.
La première exécution directe des tests backend a rencontré les restrictions
sandbox sur les sockets/sous-processus et deux assertions à adapter au champ
`authVersion`. Après adaptation, relance avec permissions et fuseau de CI réussie,
puis CI complet réussi. Aucun contournement de contrôle applicatif.
