# Les 12 scénarios WalkIn dans Chrome

Depuis Codex, demander « Relance la passe WalkIn sauvegardée dans
`scripts/walkin-chrome/README.md` ». Ce dossier contient la matrice,
les actions Chrome et les commandes MongoDB. La passe vise la production
de ClinIA avec le compte de test `receptioncool1`, dans la clinique
fictive isolée. Elle utilise la session Chrome normale du compte.

Les scénarios 1 à 6 utilisent des dossiers existants. Les scénarios 7 à 12
reprennent les mêmes six ordres avec des patients absents de MongoDB au départ.

| Existant | Nouveau | Ordre des corrections |
| --- | --- | --- |
| 1 | 7 | Appel → SMS → courriel |
| 2 | 8 | Appel → courriel → SMS |
| 3 | 9 | SMS → appel → courriel |
| 4 | 10 | SMS → courriel → appel |
| 5 | 11 | Courriel → appel → SMS |
| 6 | 12 | Courriel → SMS → appel |

## Lancer la passe

Lancer les commandes depuis `scripts/walkin-chrome`, avec Node.js. Sous
Windows, le lanceur utilise WSL Ubuntu pour SSH. Sous Linux ou WSL, il
utilise le client SSH local. L’accès SSH doit déjà permettre d’exécuter
Docker sur l’hôte Coolify avec une clé d’hôte connue.

Au premier lancement depuis un nouveau clone, copier
[`cible.example.json`](cible.example.json) vers `cible.local` et renseigner
l’alias ou la destination SSH, le nom du projet Docker Compose, les
identifiants MongoDB de la clinique fictive et du compte de test, ainsi
que ses deux affectations habituelles dans l’ordre enregistré en base.
Le fichier local est ignoré par Git. Se connecter à ClinIA dans Chrome avec
`receptioncool1` avant la préparation.

1. Facultatif, `node passe.mjs liste` affiche la matrice. La commande
   `node passe.mjs controler` vérifie en lecture seule les prérequis MongoDB.
2. `node passe.mjs preparer` crée six dossiers fictifs et affecte
   temporairement le compte à la clinique de test. Recharger l’onglet
   WalkIn après cette étape. La commande refuse d’écraser l’état d’une
   passe précédente.
3. Dans la session Chrome de Codex, importer [`chrome.mjs`](chrome.mjs)
   avec `pathToFileURL` de `node:url` et appeler `selectTestClinic(tab)`
   avec l’onglet Chrome. Si le dépôt est dans WSL, utiliser le chemin
   Windows du fichier (`wslpath -w`). L’interface ClinIA doit être en
   français.
4. Pour chaque numéro de 1 à 12, lire le scénario avec
   `node passe.mjs scenario N`, puis passer le JSON retourné à
   `runScenario(tab, fixture)` dans **un seul appel Chrome**. Chaque
   scénario commence par trois valeurs invalides. Le script soumet,
   vérifie le refus, corrige un champ et recommence jusqu’à la confirmation.
   Les clics s’enchaînent sans pause ajoutée, y compris lorsque l’erreur
   est affichée.
5. Après la confirmation Chrome, exécuter `node passe.mjs verifier N`.
   MongoDB doit retrouver les trois valeurs attendues dans un seul dossier,
   une seule inscription liée et le mode de rappel attendu. Pour un dossier
   existant, son identifiant doit correspondre à celui relevé au départ.
   Passer au scénario suivant seulement si les deux contrôles ont réussi.
   Cette cadence groupe les trois refus dans Chrome et contrôle MongoDB
   après la confirmation, sans lecture intermédiaire ni pause sur l’erreur.
6. Arrêter la passe au premier échec Chrome ou MongoDB. Relever le numéro
   du scénario, l’étape et le message affiché. À la fin, `completed: true`
   indique que les 12 scénarios ont été vérifiés.
7. Exécuter `node passe.mjs nettoyer` pour retirer les données fictives,
   rétablir les affectations du compte et vérifier le nettoyage. Après
   un délai d’attente pendant un enregistrement, confirmer que la requête
   est terminée avant de nettoyer.

Conserver `passe-en-cours.json` si le nettoyage échoue ou si la préparation
s’interrompt après le contrôle initial. Il contient les références
nécessaires à la reprise du nettoyage. Les journaux d’audit restent en place.
