# Contrôles CI pour les changements documentaires

Un changement contenant uniquement des documents autorisés vérifie leur format
et leurs liens locaux, y compris lors du premier push sur une nouvelle branche
de maintenance. Les deux contrôles requis gardent leurs noms
`Backend tests and audit` et `Frontend tests, build and audit`.

## Choix du parcours

Le job `Classify changes and check documentation` teste les outils de contrôle,
compare les commits de l'événement GitHub et valide les documents modifiés.
Les deux jobs requis vérifient ensuite son succès. Ils choisissent leurs étapes
selon le périmètre des fichiers modifiés.
Une erreur d'exécution des outils ou de validation documentaire fait échouer
les contrôles requis ; elle ne produit pas un succès par simple job ignoré.

Une promotion vers `coolify` du même commit déjà validé peut réutiliser les
tests applicatifs selon [le contrôle de preuve de promotion](ci-promotion-reuse.md).
Les installations et audits npm restent frais. Les contrôles documentaires et
les noms des jobs requis sont conservés, même lors de cette réutilisation.

La liste documentaire autorisée comprend :

- Les fichiers `.md` sous `docs/` et `scripts/`.
- `PROJECT_STATE.md`, `RUNNING.md` et les `README.md` à la racine, avec suffixe
  de langue éventuel, par exemple `README.fr.md`.

Une modification limitée aux scripts `chrome.mjs`, `fixtures.mjs`,
`mongo-check.template.mjs` et `passe.mjs` de `scripts/walkin-chrome/`, avec
ou sans leur README, déclenche les contrôles WalkIn ciblés. Le guide seul suit
le parcours documentaire. Le frontend exerce le pilote des 12 scénarios sur le
formulaire de réception. Le backend teste les inscriptions et leur nettoyage
sur un replica set MongoDB jetable. Les deux jobs installent et auditent leurs
dépendances. Le parcours applicatif complet inclut ces tests.

Pour reproduire la voie ciblée avec Node 24 et les dépendances installées,
exécuter `bash scripts/ci-local.sh frontend walkin`, puis
`bash scripts/ci-local.sh backend mongo` et `bash scripts/ci-local.sh backend walkin`.
Le dernier contrôle vérifie que les dossiers et inscriptions d’une autre passe
portant les mêmes noms sont conservés après le nettoyage.

Les fichiers `AGENTS.md`, le code applicatif, la configuration, les workflows `.github/`,
les scripts de validation et les Markdown sous les répertoires applicatifs
restent dans le parcours complet. Un changement du backend ou du frontend dans le même diff exige le parcours complet.
Les suppressions et les deux chemins d'un renommage participent au choix ;
renommer du code en `.md` ne permet pas d'ignorer les tests applicatifs.

Pour une PR, le diff va de l'ancêtre commun des SHA base/head à la tête de PR.
Pour un push sur une branche existante, il compare les SHA before/after.

Lors de la création d'une branche, GitHub indique un SHA before composé de
zéros. Le classificateur utilise alors l'ancêtre commun entre la tête poussée
et la référence locale `refs/remotes/origin/coolify`, fournie par le checkout
avec `fetch-depth: 0`. Le diff couvre tous les commits propres à la branche.
Un commit applicatif suivi d'un commit documentaire exige donc le CI complet.

Ce calcul s'applique aux créations de branches confirmées par l'événement
GitHub. Une référence `coolify` absente, un historique incomplet, des historiques
sans ancêtre commun, une comparaison vide ou ambiguë, la création de `coolify`
elle-même ou un lancement manuel conservent le parcours applicatif complet.

## Vérifications documentaires

Le vérificateur utilise Python et sa bibliothèque standard, sans installation
npm ni requête réseau. Il contrôle les Markdown modifiés encore présents et
les liens entrants vers les chemins modifiés depuis les autres documents.
Cela permet notamment de détecter une référence cassée après suppression ou
renommage d'un document.

Le format vérifié comprend UTF-8, la fin de ligne finale, les espaces de fin de
ligne (sauf les deux espaces d'un saut de ligne Markdown), la séparation des
titres ATX et la fermeture des blocs de code. Les liens et images en ligne,
les références sur une ligne et les ancres de titres ATX sont contrôlés.
Les formes multilignes, les titres Setext et les liens HTML bruts ne sont pas
interprétés. Les blocs de code et le code en ligne sont exclus des liens.

Les règles exactes sont définies dans
[le vérificateur](../scripts/check-documentation.py) et ses
[tests](../scripts/test_check_documentation.py). Les destinations locales doivent rester dans
le dépôt ; les liens symboliques ne permettent pas de sortir de ce périmètre.
Les liens externes ne sont pas téléchargés : leur disponibilité HTTP ne fait
pas partie de ce contrôle léger.

## Validation sur GitHub du 21 novembre 2026

### Changement uniquement documentaire

Le premier push de la nouvelle branche `maintenance/docs-only-smoke-20261121`
a validé le parcours documentaire avec le commit
`64a2f3955d6de5e0c0819e1a456d900b10029545`. Le diff contenait uniquement un ajout
dans `docs/ci-documentation.md`.

- Les contrôles de classification, de format Markdown et de liens locaux ont réussi.
- Les 11 étapes applicatives des jobs backend et frontend ont été ignorées.
- Les deux jobs requis ont validé le résultat du contrôle documentaire.
- Coolify comptait 62 déploiements avant et après le test, avec aucun déploiement actif.
- La production est restée épinglée sur `46f8a98`.

[Exécution CI vérifiée](https://github.com/pierrot70/ClinIA/actions/runs/44915282878) ·
[Commit documentaire testé](https://github.com/pierrot70/ClinIA/commit/64a2f3955d6de5e0c0819e1a456d900b10029545)

### Changement documentaire et code

Le premier push de la nouvelle branche
`maintenance/ci-documentation-new-branch-20261121` a validé le parcours complet
avec le commit `9800d52f496995acb9797de8cf50ee19a2cb4fc5`. Le diff contenait
`docs/ci-documentation.md` ainsi que les deux fichiers Python
`scripts/classify-ci-changes.py` et `scripts/test_classify_ci_changes.py`.

- Les 11 étapes applicatives ont été exécutées avec succès, avec les installations,
  les audits, le contrôle TypeScript, les tests, le build frontend et les intégrations MongoDB.
- Les contrôles de classification et de documentation ont également réussi.
- Coolify comptait 62 déploiements avant et après cette passe, avec aucun déploiement actif.
- La production est restée épinglée sur `46f8a98`.

[Exécution CI complète vérifiée](https://github.com/pierrot70/ClinIA/actions/runs/44914346889) ·
[Commit mixte testé](https://github.com/pierrot70/ClinIA/commit/9800d52f496995acb9797de8cf50ee19a2cb4fc5)

## Rejouer les contrôles

Depuis la racine, avec Git, Python 3 et Bash disponibles :

```bash
python3 -m unittest discover -s scripts -p 'test_*documentation.py'
python3 -m unittest discover -s scripts -p 'test_classify_ci_changes.py'
python3 scripts/classify-ci-changes.py --event pull_request --base BASE_SHA --head HEAD_SHA --output /tmp/clinia-ci-changes.json
python3 scripts/check-documentation.py --changes /tmp/clinia-ci-changes.json
```

Remplacer `BASE_SHA` et `HEAD_SHA` par des SHA de commits présents dans le dépôt.
Le workflow conserve ses déclencheurs habituels, sans `paths-ignore`, afin que
les contrôles requis puissent toujours produire un résultat.
