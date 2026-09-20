# Verification manuelle du rejeu MFA (point 4)

Depuis la racine du projet, sous Linux/WSL avec Bash, curl, jq et GNU date :

```bash
bash scripts/test-mfa-replay.sh staging
```

Pour Coolify, seulement apres deploiement du correctif :

```bash
bash scripts/test-mfa-replay.sh coolify
```

Le mode distant exige la confirmation `TESTER COOLIFY`. Le script s'execute
depuis votre ordinateur, sans installation dans le droplet.

Utiliser un compte de test avec MFA **deja configure dans le UI**. Le script
ne configure pas le MFA et ne modifie pas les roles. Sans MFA en staging,
il s'arrete : cela ne constitue pas un test du correctif.

1. Saisir l'identifiant et le mot de passe (masque).
2. Attendre que l'authentificateur affiche un nouveau code, puis le saisir
   rapidement. La premiere validation doit retourner HTTP 200.
3. Le script ouvre automatiquement un nouveau challenge et soumet le meme
   code. La reponse attendue est HTTP 401 `INVALID_MFA_CODE`.
4. Attendre le prochain code **different** et le saisir. Sur le meme challenge
   B, la reponse doit etre HTTP 200.

Le script ne conclut a la protection que si les controles positif/negatif
reussissent, avec des horodatages HTTP dans la meme fenetre serveur de
30 secondes (marge de deux secondes) et une sequence initiale de dix secondes
maximum. Un changement de fenetre, un horodatage absent, un rate limit ou une
erreur inattendue donnent un resultat **non concluant**. Ce garde-fou suppose
des horloges serveur/proxy synchronisees ; ce test manuel ne remplace pas les
tests deterministes ou un test de concurrence entre instances.

Codes de sortie : 0 protection confirmee ; 2 rejeu accepte ; 1 erreur ou
resultat non concluant. Ne pas repeter rapidement les essais : les limites
de connexion et les verrouillages MFA restent actifs.

Effets : creation de deux sessions pouvant remplacer des sessions existantes,
consommation des codes MFA et evenements d'audit normaux (dont un echec voulu).
Aucun dossier patient n'est lu. Les sessions connues sont deconnectees a la
sortie, y compris en cas d'interruption ; si une reponse de connexion est perdue
sur le reseau, une session inconnue du script peut subsister. Un echec de
deconnexion est signale. Les fichiers temporaires prives sont supprimes.
Ne pas partager de tokens, mots de passe ou codes MFA.

Les tests automatises du script utilisent uniquement des reponses HTTP
simulees :

```bash
npm --prefix backend test -- --run services/__tests__/mfaReplayScript.test.js
```

## Deux soumissions en parallele

```bash
bash scripts/test-mfa-replay.sh coolify --concurrent
```

Le script cree un seul challenge actif, puis demande un code frais. Deux
processus curl en arriere-plan soumettent le meme challenge et le meme code
avec des fichiers de requete et de cookies separes. Creer une seconde demande
login avant cette paire invaliderait le premier challenge et fausserait le test. Aucune boucle de charge
ni nouvelle tentative automatique n'est lancee. Un 200 et un 401
`INVALID_MFA_CHALLENGE` (ou `INVALID_MFA_CODE`) sont attendus, quel que soit le gagnant. Deux 200 constituent
un echec. Deux refus, une erreur reseau ou une limitation sont non concluants.

Les intervalles des appels cote client doivent se chevaucher et les dates HTTP
doivent rester dans la meme fenetre TOTP avec marge. Un nouveau code different
doit ensuite reussir sur un nouveau challenge cree apres la paire, car le
challenge partage a ete consomme. Ce controle ne reutilise pas le challenge
refuse et ne remplace pas le test sequentiel de rejeu du code. Le marqueur
`MFA_CONCURRENT_PASSED` exige aussi la deconnexion des sessions connues.
Les workers sont attendus avant nettoyage des fichiers temporaires.

Ce resultat ne prouve pas le chevauchement des operations critiques cote
serveur ni leur repartition entre deux instances Coolify. Pour cibler les deux
instances locales connues : utiliser `staging-pair --concurrent`. Les limites
du navigateur, des horloges et des reponses reseau perdues restent applicables.

## Deux instances Coolify via tunnels SSH

Le mode `coolify-pair --concurrent` utilise exclusivement
`http://localhost:4102` et `http://localhost:4103`. Ouvrir au prealable deux
tunnels SSH ecoutes uniquement sur 127.0.0.1 vers les adresses privees des deux
backends, port 4000. Verifier ces adresses apres chaque redeploiement. Le trajet
poste-Droplet est chiffre par SSH ; le trajet Docker interne est HTTP et le
proxy HTTPS public n'est pas traverse. Aucune configuration serveur ne change.

Relever les `meta.instanceId` dans chaque conteneur, puis fournir ces deux
valeurs distinctes au lanceur (les valeurs ci-dessous sont des exemples) :

```bash
CLINIA_EXPECTED_INSTANCE_A=instance-a \
CLINIA_EXPECTED_INSTANCE_B=instance-b \
  bash scripts/test-mfa-replay.sh coolify-pair --concurrent
```

La confirmation `TESTER COOLIFY` est obligatoire. Les identites et la readiness
sont verifiees avant la saisie des identifiants et apres les controles MFA.
Le marqueur `COOLIFY_MFA_PAIR_PASSED` exige les deux instances attendues et la
deconnexion des sessions connues. Une seule acceptation de la paire est attendue.
La verification ne prouve pas un chevauchement des operations critiques cote
serveur. Garder les tunnels ouverts pendant le test, puis les fermer avec Ctrl+C.
