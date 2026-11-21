# Validation WalkIn en production du 21 novembre 2026

**12 scénarios réussis sur 12 sur le commit `46f8a98`.**

| Élément | Résultat observé |
| --- | --- |
| Commit en service | `46f8a98b33e4820294f9d75b1ca8136751da21d5`, branche `coolify` |
| Disponibilité avant la passe | `/api/health/ready` à `ok` avec le SHA attendu, MongoDB connecté |
| Session de test | Chrome, rôle RECEPTION, compte de test `receptioncool1`, clinique fictive isolée |
| Cadence | Relance manuelle, sans pause ajoutée, arrêt au premier échec prévu par la procédure |
| Chrome | 6 dossiers existants et 6 nouveaux patients fictifs, 36 soumissions invalides refusées et 12 inscriptions valides confirmées |
| MongoDB | Après chaque confirmation, un seul dossier et une seule inscription liée, avec les coordonnées et le mode de rappel attendus |
| Dossiers existants | Identifiant du dossier initial conservé dans les 6 scénarios |
| Contrôle final | `completed: true`, 12 scénarios vérifiés et aucun échec |
| Nettoyage | Les 12 dossiers et leurs inscriptions fictives ont été retirés, les affectations habituelles de `receptioncool1` ont été rétablies et les journaux d’audit conservés |

## Résultats par scénario

Chaque scénario commence avec les trois coordonnées invalides. La réception les
corrige dans l’ordre indiqué. Le mode de rappel correspond à la dernière
coordonnée corrigée.

| Scénario | Dossier | Ordre des corrections | Mode de rappel | Chrome et MongoDB |
| --- | --- | --- | --- | --- |
| 1 | Existant | Appel → SMS → courriel | Courriel | Réussi |
| 2 | Existant | Appel → courriel → SMS | SMS | Réussi |
| 3 | Existant | SMS → appel → courriel | Courriel | Réussi |
| 4 | Existant | SMS → courriel → appel | Téléphone | Réussi |
| 5 | Existant | Courriel → appel → SMS | SMS | Réussi |
| 6 | Existant | Courriel → SMS → appel | Téléphone | Réussi |
| 7 | Nouveau | Appel → SMS → courriel | Courriel | Réussi |
| 8 | Nouveau | Appel → courriel → SMS | SMS | Réussi |
| 9 | Nouveau | SMS → appel → courriel | Courriel | Réussi |
| 10 | Nouveau | SMS → courriel → appel | Téléphone | Réussi |
| 11 | Nouveau | Courriel → appel → SMS | SMS | Réussi |
| 12 | Nouveau | Courriel → SMS → appel | Téléphone | Réussi |

Les refus intermédiaires ont été contrôlés dans Chrome. La vérification MongoDB
a eu lieu après chaque confirmation, avant de passer au scénario suivant.

## Scripts exécutés

La passe a utilisé les trois scripts versionnés dans `46f8a98`, copiés à
l’identique dans le répertoire local de validation pour leur chargement depuis
Chrome. Leurs empreintes SHA-256 ont été vérifiées.

[Guide et matrice des 12 scénarios](../scripts/walkin-chrome/README.md) ·
[Commit validé](https://github.com/pierrot70/ClinIA/commit/46f8a98b33e4820294f9d75b1ca8136751da21d5)
