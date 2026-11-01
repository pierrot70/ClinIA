# Réutilisation du CI après promotion vers coolify

Le circuit conserve un CI complet sur la branche `maintenance/**`. Si ce même
commit est ensuite poussé vers `coolify`, les tests lourds peuvent s'appuyer sur
la preuve de cette exécution, au lieu de recommencer. Une promotion qui crée un
autre SHA, notamment un commit de merge, repasse les tests complets.

## Contrôles conservés

Les trois jobs gardent leurs noms et produisent toujours un résultat. Le job
`Classify changes and check documentation` rejoue ses tests de routage, les
tests du contrôle de preuve, la classification du diff complet de l'événement
et les contrôles documentaires. Une erreur dans ce job fait échouer les deux
contrôles requis ; un job ignoré ne remplace pas un contrôle réussi.

Pour un changement applicatif, les jobs backend et frontend gardent le checkout,
Node 24, `npm ci` et un **audit npm frais**, même si la preuve est réutilisée.
Cela conserve notamment la consultation des avis de vulnérabilité actuels.

| Étape lors de la promotion | Preuve complète admissible | Preuve absente ou refusée |
| --- | --- | --- |
| Routage et documentation | Rejoués | Rejoués |
| Installation et audit npm backend/frontend | Rejoués | Rejoués |
| Tests backend, isolation auth et intégrations MongoDB | Résultat source référencé | Rejoués |
| Typage, traductions, tests et build frontend | Résultat source référencé | Rejoués |
| Rapport de validation MongoDB | Artefact source conservé et référencé | Nouveau rapport produit |

Les vérifications de santé d'un déploiement restent distinctes du CI et ne sont
pas remplacées par cette preuve.

## Preuve admissible

La recherche est réservée à la première tentative d'un événement `push` sur
`refs/heads/coolify`. Elle consulte les métadonnées GitHub Actions avec un token
temporaire limité à `actions: read` dans le seul job de classification. Les
autres jobs conservent `contents: read`. Aucun token n'est journalisé ; aucun
journal applicatif ni contenu d'artefact n'est téléchargé ou exécuté.

Le contrôle exige les éléments suivants :

- Le même SHA complet, le même dépôt et dépôt source, le même workflow `CI`
  dans `.github/workflows/ci.yml`.
- Une exécution `push` sur `maintenance/**`, créée depuis moins de 24 heures.
  La date de création sert à cette limite ; une relance ne rajeunit pas la preuve.
- La dernière exécution source pertinente et sa dernière tentative terminées
  avec succès. Une exécution plus récente en échec ou en cours empêche de
  reprendre un ancien succès.
- Les trois jobs et toutes leurs étapes obligatoires réellement terminés avec
  succès, dont les installations, audits, tests, build, isolation auth,
  intégrations MongoDB et archivage. Des étapes ignorées ne suffisent pas.
- Un artefact de rapport `reception-validation-SHA` non expiré, non vide et lié
  à cette exécution et à ce SHA.
- Des listes API complètes, sans doublon ou ambiguïté. Le contrôle relit
  l'exécution et la sélection après lecture des preuves pour détecter une
  relance ou un changement de source intervenu entre-temps.

Les contrôles de jobs portent sur la tentative précise de l'exécution, via
[l'API des tentatives GitHub Actions](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt).
La recherche des exécutions utilise
[l'API du workflow](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow).
Les URL sont construites sur l'origine API attendue ; les liens reçus ne sont
pas suivis avec le token.

Une exécution documentaire, une PR ou un run qui a lui-même réutilisé des tests
ne fournit pas une nouvelle preuve complète : les étapes lourdes doivent être
réellement réussies dans la source. La réutilisation ne se propage donc pas de
run en run.

## Repli et validation complète explicite

Une erreur API, une permission absente, une réponse incomplète ou mal formée,
une preuve expirée, un état en cours ou une ambiguïté déclenche le parcours
complet. La recherche ne filtre pas uniquement les succès et ne masque pas une
tentative plus récente qui a échoué.

Une relance de `coolify` et `workflow_dispatch` exécutent le parcours complet.
Cela permet de demander une nouvelle validation sans modifier le commit.
Le traitement existant des changements purement documentaires reste décrit
dans [le circuit documentaire](ci-documentation.md).

Chaque job qui réutilise les résultats publie dans son résumé un lien vers le
run complet d'origine. Son installation et son audit restent visibles dans le
run de promotion. Le rapport MongoDB demeure dans le run source avec sa
rétention existante de 30 jours ; aucune copie ne le fait passer pour une
nouvelle exécution des tests.

## Vérifier localement

```bash
python3 -m unittest discover -s scripts -p 'test_*documentation.py'
python3 -m unittest discover -s scripts -p 'test_classify_ci_changes.py'
python3 -m unittest discover -s scripts -p 'test_ci_promotion_reuse.py'
```

Les tests du contrôle de preuve utilisent des réponses synthétiques, sans
réseau ni données patient. Ils couvrent le succès, les refus de provenance,
les étapes manquantes ou ignorées, les relances, l'expiration, les erreurs API,
les listes incomplètes et les changements d'état pendant la lecture. Les tests
des gardes exécutent les vrais scripts Bash des deux jobs requis.

Agent-Contribution: backend | Contrôle de preuve GitHub Actions et tests de réutilisation du CI.
Agent-Review: security | Provenance, complétude, fraîcheur des audits, relances et repli conservateur.
Validation: suites de contrôle locales et exécutions GitHub du même commit avant/après promotion à vérifier lors de la publication.
