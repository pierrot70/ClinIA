# Preuve HTTP de securite des sessions en STAGING local

Depuis la racine du projet, avec la stack `clinia_mongo_rs` active :

```bash
bash scripts/run-staging-auth-security-drill.sh
```

Le lanceur exige Docker local, le projet Compose attendu et le backend staging.
Le programme exige egalement l'identifiant d'instance staging et les trois noms
Mongo locaux autorises. Il transmet le script par stdin sans modifier les
fichiers du conteneur.

Le drill utilise les routes et middlewares deployes, les vrais delais de mot de
passe et MongoDB staging. Un serveur HTTP distinct ecoute sur un port ephemere
local au conteneur. Toutes les collections des modeles sont renommees avec un
prefixe aleatoire, y compris les audits et quotas. Un compte SUPERADMIN
synthetique et son MFA sont crees dans ces collections uniquement. Les secrets
restent en memoire; aucun dossier patient ni compte existant n'est consulte.

Les preuves attendues sont :

- MFA : premiere validation HTTP 200, rejeu du meme code dans la meme fenetre
  de 30 secondes HTTP 401 `INVALID_MFA_CODE`, nouveau code HTTP 200.
- Reauthentification : confirmation dans la session A HTTP 200, emprunt du
  cookie de A par la session B HTTP 403 `REAUTH_REQUIRED`.
- Deconnexion : jeton A accepte avant logout puis refuse immediatement HTTP
  401; session B toujours valide; aucune session refresh active apres logout B.

Un changement de fenetre pendant le rejeu rend le test non concluant et donne
un code de sortie non nul. Les attentes TOTP ne contournent aucun controle
applicatif. Le programme attend au plus une nouvelle fenetre a chaque etape.

Avant le nettoyage, le serveur refuse de nouvelles requetes et attend la fin
des promesses des handlers, y compris apres un timeout ou une deconnexion HTTP.
Si les handlers ne terminent pas sous 60 secondes, le processus isole s'arrete
en echec et conserve les collections pour inspection; il ne les supprime jamais
pendant que des ecritures peuvent encore etre en cours.

Le nettoyage supprime uniquement les noms exacts des collections creees par ce
run et confirme leur absence par `CLEANUP_OK`. Le programme refuse d'adopter des
collections preexistantes. SIGKILL, interruption du conteneur ou panne Mongo
peuvent empecher ce nettoyage : conserver le prefixe affiche et verifier
uniquement les collections correspondantes.

Ce resultat couvre le code deploye dans le conteneur et Mongo staging. Il ne
valide pas le proxy du port 4002, les cookies du navigateur, une concurrence
entre instances ou Coolify. Les scripts manuels `test-reauth-session-binding.sh`
et `test-mfa-replay.sh` restent disponibles pour le trajet HTTP expose.
