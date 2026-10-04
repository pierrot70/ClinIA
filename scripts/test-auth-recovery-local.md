# Vérifier la récupération depuis le terminal VS Code

Depuis la racine du dépôt, dans le terminal Bash/WSL :

```bash
bash scripts/test-auth-recovery-local.sh
```

Prérequis : Node 24, curl, Docker local démarré, dépendances backend installées
et image `mongo:7` disponible. Si nécessaire, les préparer une seule fois :

```bash
npm --prefix backend ci
docker pull mongo:7
```

Le script démarre un replica set MongoDB jetable en mémoire et une API de test
sur des ports aléatoires liés à `127.0.0.1`. Il ne lit pas `.env`, n'utilise pas
`MONGO_URI`, ne contacte pas Coolify et laisse les services locaux habituels
sur leurs ports. Les courriels et l'audit auth sont simulés dans les tests ;
aucun envoi Brevo ni consommation du quota réel. Les comptes sont synthétiques,
sans patient ni clinique. Aucune adresse réelle ni secret n'est demandé.

Le parcours curl exerce les vraies routes Express et cookies de session :
connexion, demande de récupération sans déconnexion, refresh encore accepté,
vérification du code, refus de son rejeu, changement du mot de passe, refus du
rejeu du grant, refus de l'ancien mot de passe et des anciennes sessions avant
et après reconnexion, nouvelle session/refresh, puis déconnexion.

Les 30 scénarios complémentaires vérifient notamment les opérations
concurrentes, le rollback MongoDB, les expirations et les écritures MFA tardives.
Ils couvrent aussi la connexion et la réauthentification avec un ancien mot de
passe dépassant 72 octets UTF-8, puis son remplacement par un mot de passe
conforme. Les nouveaux mots de passe dépassant cette limite sont refusés sans
consommer le grant de récupération. Les réinitialisations administratives et
changements obligatoires couvrent aussi révocation permanente, concurrence,
rollback et conservation du MFA inscrit.
Les tokens et réponses HTTP restent dans un dossier temporaire privé supprimé
en fin de test. La base et le conteneur sont supprimés à la sortie du lanceur.
Un arrêt brutal de la machine ou SIGKILL peut empêcher ce nettoyage ; ne jamais
utiliser une purge Docker globale pour le reprendre.

Résultat attendu : `31 passed`, puis :

```text
CLEANUP_OK disposable MongoDB container removed (no persistent data volume).
AUTH_RECOVERY_LOCAL_PASSED — ne constitue pas une vérification du déploiement.
```

Un échec renvoie un code de sortie non nul et n'affiche pas le marqueur final.
Cette vérification porte sur le code présent localement, y compris les
modifications non commitées. Elle ne valide pas les images réellement servies,
le proxy HTTPS, les deux instances Coolify, leurs secrets, ni la réception des
courriels. Ces contrôles de déploiement restent distincts.

Agent-Contribution: backend | lanceur local et parcours curl sur base jetable
Agent-Review: security | isolation MongoDB/SMTP, fichiers temporaires, curl sans proxy et limites de portée ; revue statique
Validation: bash scripts/test-auth-recovery-local.sh | 16/16 réussis, CLEANUP_OK, AUTH_RECOVERY_LOCAL_PASSED le 3 octobre 2026
Validation: bash scripts/ci-local.sh | suite récupération étendue à 17/17, CLEANUP_OK et CI_LOCAL_PASSED le 4 octobre 2026

Validation: bash scripts/ci-local.sh | suite étendue à 31/31 avec resets administratifs, CLEANUP_OK et CI_LOCAL_PASSED le 4 octobre 2026
