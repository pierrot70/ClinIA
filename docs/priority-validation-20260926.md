# Reprise des priorités du 26 septembre 2026

Base : `coolify`, `3dc782b73ee62637989329c3662b774db43d127c`.
Le déploiement sur le Droplet reste manuel dans Coolify, réalisé par
l'utilisateur. Les contrôles locaux ne prouvent pas l'état de production.

## GitHub Actions et protection

L'API GitHub ne retourne aucune exécution pour le SHA de base au moment de la
reprise. La branche distante est encore sur ce SHA et expose `protected: false`.
L'accès détaillé aux protections retourne 403 avec le connecteur disponible.
Le lancement d'un workflow et la modification des protections ne sont pas
disponibles depuis ce connecteur ; `gh` n'est pas installé dans ce poste.

Avant publication du nouveau lot, dans GitHub > Actions > CI > Run workflow,
sélectionner `coolify`. Vérifier que le run porte exactement `3dc782b…`, puis
conserver son URL et ses résultats, même en cas d'échec des anciens audits.
Après publication du lot, le nouveau workflow déclenchera automatiquement
les push sur `coolify` et les pull requests ciblant cette branche.

Après un premier run réussi du nouveau SHA, configurer la protection de
`coolify` pour exiger les deux contrôles `Backend tests and audit` et
`Frontend tests, build and audit`, avec branche à jour avant fusion et
interdiction du force-push et de la suppression. Vérifier la protection avec
le compte administrateur ; une modification YAML locale ne l'active pas.

## Déploiement manuel : preuves à recueillir

Déployer le nouveau commit validé et publié, avec `Include Source Commit in
Build` activé. Conserver un retour possible vers l'image précédente et une
sauvegarde vérifiée. Pour chacun des deux conteneurs backend, relever uniquement :

```bash
docker exec NOM_CONTENEUR cat /app/build-revision.json
docker exec NOM_CONTENEUR node --version
docker exec NOM_CONTENEUR node -e 'console.log(JSON.stringify({express:require("express/package.json").version,nodemailer:require("nodemailer/package.json").version}))'
```

Attendu : SHA exact du commit publié sur les deux instances, Node 24,
Express 4.22.3 et Nodemailer 9.1.1. Vérifier readiness publique 200 et les
deux conteneurs healthy. Vérifier aussi SMTP sans envoyer de message réel.
Ne pas utiliser les images locales `clinia-validation-*` pour le déploiement :
elles servent uniquement aux essais du code non encore commité.

Sur la base applicative, lire seulement les définitions des index de
`receptionbookingproofs` : `tokenHash_1`, clé `{ tokenHash: 1 }`, `unique: true`,
et `expiresAt_1`, clé `{ expiresAt: 1 }`, `expireAfterSeconds: 0`.
La présence du modèle dans le code ne prouve pas celle des index déployés.

Avec un compte et un patient synthétiques dédiés, exécuter recherche RAMQ →
réservation acceptée → rejeu de la même preuve refusé. Vérifier une seule
réservation créée et nettoyer exactement les objets synthétiques. Ne jamais
consigner RAMQ, jeton, cookie ou contenu patient dans les preuves partagées.

## Vérifications humaines et continuité

- Production : contrôler alternatives, signaux d'alarme et rapports avec les
  rôles prévus. Exporter PDF/JSON et vérifier le SHA, les résultats et les
  refus d'accès attendus. Conserver uniquement des preuves minimisées.
- Revue clinique humaine : faire relire options, justification scientifique,
  contre-indications et signaux d'alarme par un médecin ; consigner date,
  version, périmètre et réserves dans l'espace privé approprié. Les tests
  logiciels et la revue d'un agent ne remplacent pas cette étape.
- Basculement : fenêtre d'essai coordonnée, trafic synthétique continu et
  réservation active. Horodater chaque requête et chaque écriture acquittée,
  l'arrêt, les erreurs et le rétablissement stable. Calculer l'interruption
  observée et vérifier après reprise chaque écriture acquittée, sans doublon.
  Une simple readiness 200 ne mesure ni le RTO du parcours ni le RPO.
- Restauration isolée : exporter les définitions des index avant sauvegarde
  et après restauration, comparer clés ordonnées, unicité, TTL, filtres
  partiels, collation et propriétés sparse/hidden. Comparer aussi les données
  synthétiques acquittées. Ne pas lancer une restauration sur la production.
- Perte complète du Droplet : reconstruire sur un hôte isolé depuis les
  sauvegardes hors site et secrets conservés séparément, sans détruire le
  Droplet actif. Mesurer depuis le début de la reconstruction jusqu'au
  parcours fonctionnel ; relever l'âge de la dernière écriture récupérée.

## Preuves S3 : six mois

La durée demandée est six mois calendaires après la fin du test. Préserver
les preuves des déploiements actif/précédent et les gels d'incident au-delà
de cette échéance, comme dans la politique existante.

La configuration distante reste à appliquer. Avant toute règle d'expiration,
inventorier le préfixe privé `technical-evidence/`, les dates de test, les
exceptions et les empreintes. Isoler les objets protégés du périmètre de purge,
puis appliquer une règle compatible avec le fournisseur S3 et vérifier sa
lecture en retour. Ne pas remplacer les règles existantes du bucket et ne
pas inclure les sauvegardes MongoDB. Une expiration exprimée en jours depuis
l'envoi n'est pas équivalente à six mois calendaires après le test : documenter
cette différence avant activation. Aucun objet n'a été supprimé pendant cette
reprise et aucune rétention distante n'est revendiquée comme active.
