# Validation WalkIn en production du 15 novembre 2026

**Résultat de la relance après déploiement Coolify : 12 scénarios réussis sur 12.**

| Élément | Résultat observé |
| --- | --- |
| Commit en service | `d1437799a21bfbf6f55c66bc3b9890c614a7ec25`, branche `coolify` |
| Disponibilité avant la passe | `/api/health/live` et `/api/health/ready` à `ok`, MongoDB connecté |
| Session de test | Chrome, rôle RECEPTION, compte de test `receptioncool1`, clinique fictive isolée |
| Cadence | Déclenchement manuel, une passe sans pause ajoutée, arrêt au premier échec prévu par la procédure |
| Chrome | 6 dossiers existants et 6 nouveaux patients fictifs. Les 36 soumissions invalides ont été refusées. Les 12 inscriptions valides ont été confirmées. |
| MongoDB | Après chaque confirmation, un seul dossier patient et une seule inscription liée, avec les trois coordonnées et le mode de rappel attendus. Le contrôle final a retourné `completed: true`. |
| Nettoyage | Données fictives retirées et affectations habituelles du compte de test rétablies. |

Les six ordres de correction du numéro d’appel, du numéro SMS et du courriel
ont été vérifiés pour les dossiers existants et les nouveaux patients. Les refus
intermédiaires ont été contrôlés dans Chrome. La vérification MongoDB a eu lieu
après chaque confirmation.

[Guide et matrice des 12 scénarios](../scripts/walkin-chrome/README.md) ·
[Commit validé](https://github.com/pierrot70/ClinIA/commit/d1437799a21bfbf6f55c66bc3b9890c614a7ec25)
