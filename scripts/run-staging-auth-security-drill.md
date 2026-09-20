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

## Verification interactive entre les deux instances STAGING

```bash
bash scripts/test-reauth-session-binding.sh staging-pair
```

Utiliser un SUPERADMIN de test avec MFA configure. Le lanceur verifie les
identifiants des instances locales sur 4002 et 4003 avant de demander les
identifiants. Il cree la session A sur 4002, puis B sur 4003 (attendre un
nouveau code MFA pour B). La confirmation de A est creee sur 4002 puis
verifiee sur 4003 : elle doit fonctionner pour A et etre refusee pour B.
Apres logout de A sur 4002, son ancien jeton doit etre refuse sur 4003,
tandis que B doit rester valide sur 4002. Les sessions creees sont deconnectees
et les fichiers temporaires prives supprimes ; un echec de deconnexion empeche
le marqueur final `STAGING_PAIR_PASSED`. Les sessions deja ouvertes du compte
de test peuvent etre remplacees selon la politique de sessions.

Les mots de passe, codes MFA, cookies et reponses contenant les comptes ne
sont pas affiches. Ce mode ne verifie pas encore le rejeu MFA entre instances,
ni les cookies du navigateur, ni le proxy Coolify. Un test du lanceur avec
reponses simulees ne remplace pas cette execution interactive reelle.

Pour le rejeu MFA entre ces memes instances :

```bash
bash scripts/test-mfa-replay.sh staging-pair
```

Un premier code est accepte sur 4002, puis rejoue automatiquement avec un
nouveau challenge sur 4003. Le refus doit etre `401 INVALID_MFA_CODE` dans
la meme fenetre TOTP cote serveur, avec marge aux frontieres ; sinon le test
est non concluant. L'utilisateur saisit ensuite un nouveau code different,
qui doit etre accepte sur le meme challenge de B. Les deux sessions sont
deconnectees avant le marqueur `STAGING_MFA_PAIR_PASSED`. Un echec de nettoyage
interdit ce marqueur. Le code n'est jamais affiche et aucun MFA n'est enrole.
Cet essai sequentiel ne prouve pas le refus de deux soumissions simultanees.

## Verification via le proxy Coolify

Depuis le poste local, `bash scripts/test-reauth-session-binding.sh coolify`
demande une confirmation explicite avant les connexions distantes. Il verifie
la liaison de reauthentification, puis la validite des deux sessions avant
logout A, le refus de l'ancien jeton A (401) et le maintien de B (200).
`COOLIFY_AUTH_PASSED` n'est affiche qu'apres deconnexion des sessions creees.
Ce mode cible la production via HTTPS, sans garantir deux instances distinctes.
Il ne couvre ni le navigateur ni les requetes simultanees. Utiliser un compte
de test avec MFA ; ses sessions existantes peuvent etre remplacees.
