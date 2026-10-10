# Validation courte de sécurité en staging — 10 octobre 2026

Code testé : `1b756a53cb0b87a6f4dcb378364690512c2574e7`, branche `coolify`.
Les sources backend montées dans les deux conteneurs ont été comparées au
checkout : aucun changement backend local, empreintes identiques.

## Déploiement local

Les deux backends `clinia_mongo_rs-backend-1` et
`clinia_mongo_rs-backend-replica-1` sont healthy et leur readiness renvoie 200.
Node `24.21.0`, Nodemailer `10.0.14`, proxy-addr `2.0.8` sur les deux instances.
Le frontend staging sur le port 5174 renvoie 200.

La CI complète du rebuild a réussi. Les modifications quota préparées pendant
cette CI ont ensuite été mises de côté ; les deux backends ont été redémarrés
sur les sources publiées exactes avant les courts tests ci-dessous.

## Courts tests après redémarrage

Chaque parcours a réussi séparément dans chacun des deux conteneurs :

| Contrôle | Résultat observé |
| --- | --- |
| SMTP staging | `verify()` Nodemailer vers Mailpit réussi, aucun message envoyé à Mailpit. |
| Récupération | Demande 202, vérification 200, changement 200 ; rejeu du code et du grant refusé avec 400. |
| Ancien JWT | Refus 401 après récupération, maintenu après nouvelle connexion. |
| Réinitialisation administrative | Refus 403 sans réauthentification, succès 200 avec réauthentification ; ancien JWT refusé 401. |
| Changement obligatoire | Marqueur actif, action protégée refusée 403 ; changement 200, JWT temporaire refusé 401, nouvelle connexion réussie et marqueur levé. |

Deux messages MIME synthétiques sont reçus par un serveur SMTP loopback en
mémoire, avec deux réservations dans un compteur quota isolé. Les handlers
terminent avant nettoyage ; `CLEANUP_OK` confirme l'absence des collections
synthétiques exactes sur les deux exécutions.

## Périmètre et preuves

Les tests chargent les routes et middlewares du code déployé dans un processus
HTTP éphémère distinct, avec MongoDB staging et des collections isolées.
Ils ne couvrent pas le trajet navigateur/ports publics, les échanges entre
instances, SMTP de production ni le déploiement Coolify. Aucune validation de
production ni revue clinique humaine n'est revendiquée.

Lanceur temporaire utilisé : `/tmp/clinia-deployed-recovery-test.sh`, avec le
nom de chaque backend en argument. Ce lanceur et son harnais sont locaux et
ne font pas partie du dépôt. Journaux locaux sans secrets :
`/tmp/clinia-security-primary-20261010.log` et
`/tmp/clinia-security-replica-20261010.log`.

Ce commit consigne la validation ; il ne modifie pas le code applicatif.
Après déploiement en production, refaire les contrôles sur la version
réellement déployée ; les résultats staging ne les remplacent pas.

Agent-Review: security | tests sur les deux backends staging, collections synthétiques isolées et nettoyage confirmé ; limites ci-dessus
Validation: courts tests staging après redémarrage | cinq contrôles réussis sur chaque instance, CLEANUP_OK sur les deux
