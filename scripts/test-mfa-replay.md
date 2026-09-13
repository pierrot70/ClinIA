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
