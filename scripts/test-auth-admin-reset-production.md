# Test HTTP de réinitialisation administrative en production

Depuis le terminal Bash local de VS Code, à la racine du dépôt :

```bash
bash scripts/test-auth-admin-reset-production.sh
```

Prérequis : Node 24 ou plus, Bash, curl, accès HTTPS à `https://clinique-ai.ca` et compte SUPERADMIN dont le MFA est déjà configuré. Aucun SSH, accès MongoDB ou fichier `.env` n'est utilisé. Aucun redéploiement nécessaire pour ce client local.

Le terminal demande l'identifiant, le mot de passe et, si demandé par le serveur, le code MFA actuel. Les trois saisies sont masquées. Ne pas coller ces valeurs dans une conversation. Aucun enrôlement MFA n'est effectué. Une erreur de connexion arrête le script, sans boucle de tentatives. La connexion utilise la politique normale du site et peut remplacer une session SUPERADMIN déjà ouverte dans le navigateur.

Le script utilise exclusivement les routes HTTP publiques et le contrôle d'accès normal : login, MFA, réauthentification sensible puis création d'un compte USER synthétique sans MFA et sans clinique. Son identifiant est unique (`smoke-auth-<UUID>`), son adresse est dans `example.invalid` et ses mots de passe sont aléatoires. Aucun patient ni courriel réel n'est impliqué.

Il vérifie successivement :

- session initiale utilisable ;
- réinitialisation administrative explicite, refus de l'ancien mot de passe, des anciens JWT et des anciens renouvellements ;
- maintien de ces refus après reconnexion ;
- génération d'un mot de passe temporaire et obligation de changement ;
- changement obligatoire, invalidation de la session temporaire avant et après reconnexion ;
- nouvelle session, renouvellement puis déconnexion.

Le nettoyage révoque les familles de renouvellement par une dernière réinitialisation, désactive puis supprime uniquement le compte portant l'identifiant, le courriel, le rôle et l'ID attendus. Il vérifie ensuite son absence. Les audits restent conservés. Les métadonnées révoquées des sessions et les compteurs de limitation expirent selon les TTL de l'application ; le script n'efface pas les collections. La session SUPERADMIN ouverte par le script est déconnectée.

Succès attendu :

```text
RESET_OK ...
FORCED_CHANGE_OK ...
CLEANUP_OK ...
AUTH_ADMIN_RESET_PASSED
```

Les réponses, cookies et jetons sont stockés temporairement dans un répertoire privé, sans apparaître dans les arguments de curl, puis supprimés à la fin. `Ctrl+C` demande un arrêt et laisse la requête en cours se terminer (maximum 25 secondes) avant nettoyage. Ne pas tuer brutalement le processus : un arrêt forcé ou une panne de la machine empêche le nettoyage automatique, y compris celui des fichiers locaux privés.

Avant création, le script affiche un chemin `Journal de secours`. En cas de nettoyage non confirmé, il conserve uniquement ce journal sans secrets et termine en échec. Une erreur réseau peut laisser une requête encore active côté serveur : attendre sa fin avant de reprendre le nettoyage. Relancer la commande exacte affichée, par exemple :

```bash
bash scripts/test-auth-admin-reset-production.sh --cleanup /tmp/clinia-auth-smoke-XXXXXX/cleanup.json
```

Ce mode redemande les identifiants/MFA et ne crée aucun compte. Ne pas relancer le test complet pour tenter de nettoyer un précédent essai. Si le compte a changé d'identité ou si les permissions ne permettent plus sa suppression, le script refuse de conclure au succès : conserver le journal pour un diagnostic ciblé.

## Validation locale du client

```bash
bash scripts/test-auth-recovery-local.sh
```

La suite exécute ce même client curl contre les vraies routes Express et un MongoDB jetable. Elle teste un SUPERADMIN synthétique avec MFA, le parcours nominal et le nettoyage après une erreur HTTP injectée. Les courriels et l'écriture des audits sont simulés dans cette suite locale ; ils ne le sont pas dans le client de production. Un résultat local ne constitue pas une validation de production.

Agent-Contribution: backend | client curl interactif et tests d'intégration sur base jetable
Agent-Review: security | lecture du client, secrets, MFA, transport et propriété du compte nettoyé ; aucune validation réglementaire ni exécution en production
Validation: bash scripts/test-auth-recovery-local.sh | 33/33 tests réussis, CLEANUP_OK et AUTH_RECOVERY_LOCAL_PASSED le 2026-10-04
Validation: node --check scripts/auth-admin-reset-smoke.mjs et bash -n scripts/test-auth-admin-reset-production.sh | réussis
Validation: exécution du client en production par l’utilisateur le 2026-10-04 | RESET_OK, FORCED_CHANGE_OK, CLEANUP_OK et AUTH_ADMIN_RESET_PASSED confirmés par la sortie fournie
