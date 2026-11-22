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

## Noms des entités fictives

En staging et en production, utiliser `type_lettre_sha8` pour le nom affiché
de chaque nouvelle entité fictive. Écrire le type en minuscules. La lettre
majuscule (A, B, C…) distingue les entités d’un même type. Garder la même
lettre pour la même entité tout au long du parcours. Le suffixe `sha8`
correspond aux huit premiers caractères du SHA Git de la version applicative testée.

| Entité fictive | Exemple pour la version `66d82c09` |
| --- | --- |
| Patient | `patient_A_66d82c09` |
| Patient sans rendez-vous (WalkIn) | `walkin_A_66d82c09` |
| IPS | `ips_A_66d82c09` |
| Urgentologue | `urgentologue_A_66d82c09` |
| Clinique | `clinique_A_66d82c09` |

Par exemple, si `walkin_A_66d82c09` passe de `clinique_A_66d82c09` à
`clinique_C_66d82c09`, son nom affiché reste `walkin_A_66d82c09` dans les deux cliniques.

Dans la passe Chrome, les scénarios 1 à 6 utilisent `patient_A` à `patient_F`
et les scénarios 7 à 12 utilisent `walkin_A` à `walkin_F`. Le script ajoute le
suffixe de l’image applicative au début de la passe. Le formulaire conserve
`Essai` comme prénom et affiche l’identifiant complet dans le champ **Nom**.
Deux passes sur la même version réutilisent les mêmes noms. Le numéro
d’assurance maladie fictif et les courriels distinguent leurs dossiers.

## Déploiement de la production

Les déploiements ClinIA sur Coolify sont manuels. Au 21 novembre 2026, la
production est épinglée sur `46f8a98b33e4820294f9d75b1ca8136751da21d5`
(`46f8a98`).

Les quatre commits suivants sur `coolify`, ajoutés depuis `46f8a98`,
concernent la documentation et le CI.

| Commit | Changement |
| --- | --- |
| `b443f48` | Rapport WalkIn 12/12 sur `46f8a98` et mise à jour du guide |
| `9800d52` | Classification des pushes documentaires sur une nouvelle branche et tests CI |
| `f7f4cf1` | Consignation du test GitHub avec un changement uniquement Markdown |
| `042ab6f` | Consignation du test GitHub mixte, avec code et Markdown |

La décision du 21 novembre 2026 est de conserver `46f8a98` épinglé en production.
Aucun déploiement manuel n’est nécessaire pour ces quatre commits.

Sur `coolify`, les trois commits qui suivent `d143779` sont uniquement
documentaires. `f954edf` consigne le résultat de la passe WalkIn, `93dae58`
documente le déploiement manuel et `b39fe83` ajoute la checklist. Aucun
déploiement applicatif n’était nécessaire pour ces trois commits.

### Checklist du prochain déploiement applicatif

- [ ] Confirmer que le CI a réussi sur `coolify` pour le commit applicatif et
  copier son SHA complet.
- [ ] Dans Coolify, noter le SHA actuellement épinglé comme point de retour.
- [ ] Remplacer le SHA épinglé par celui du commit validé, enregistrer et vérifier
  la valeur affichée.
- [ ] Lancer le déploiement manuellement. Attendre le statut **Finished**, puis
  vérifier que `/api/health/ready` renvoie `ok` avec le nouveau SHA.
- [ ] Mettre à jour le SHA dans ce guide.
- [ ] Après environ cinq déploiements applicatifs depuis la dernière passe
  complète, relancer manuellement les 12 scénarios WalkIn sur demande, sans
  pause ajoutée et avec arrêt au premier échec. Dernière passe complète le
  21 novembre 2026 sur `46f8a98`, avec 12 scénarios réussis sur 12.
  Le [rapport de cette passe](../../docs/production-validation-walkin-20261121-46f8a98.md)
  sert de référence pour les prochaines relances.

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

## Historique des validations en production

### 22 novembre 2026 · Retrait de la liste d’attente de la clinique active · `66d82c0`

Test réussi en production dans Chrome avec le compte RECEPTION et un patient
fictif. Le patient était inscrit aux cliniques A et B. Une première tentative
à C a été refusée, la limite de deux cliniques étant atteinte. Après avoir
confirmé le retrait dans la clinique active A, RECEPTION a repris le même
dossier à C et l’inscription a réussi.

MongoDB a confirmé un seul dossier patient et exactement deux inscriptions,
à B et à C. L’inscription à B avait conservé son identifiant et son horodatage
d’origine. Les affectations habituelles du compte RECEPTION ont été rétablies.

Le nettoyage a supprimé en une transaction le dossier fictif et les deux
inscriptions restantes. Une seconde lecture de MongoDB a confirmé **0 dossier
et 0 inscription** pour ce patient. L’empreinte des **9 audits** était identique
avant et après le nettoyage. Les 5 audits patient couvrent la création du
dossier et quatre recherches. Les 4 audits d’écriture retracent les inscriptions
à A, B et C ainsi que le retrait de A.

### Passes complètes des 12 scénarios

- [21 novembre 2026 · `46f8a98` · 12 scénarios sur 12](../../docs/production-validation-walkin-20261121-46f8a98.md)
- [15 novembre 2026 · `d143779` · 12 scénarios sur 12](../../docs/production-validation-walkin-20261115-d143779.md)
