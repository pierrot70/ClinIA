# Contrôles CI pour les changements documentaires

Une PR contenant uniquement des documents autorisés vérifie leur format et
leurs liens locaux sans installer les dépendances applicatives, compiler le
frontend ou démarrer MongoDB. Les deux contrôles requis gardent leurs noms
`Backend tests and audit` et `Frontend tests, build and audit`.

## Choix du parcours

Le job `Classify changes and check documentation` teste les outils de contrôle,
compare les commits de l'événement GitHub et valide les documents modifiés.
Les deux jobs requis vérifient ensuite son succès. Ils exécutent leurs étapes
applicatives uniquement si le changement n'est pas purement documentaire.
Une erreur d'exécution des outils ou de validation documentaire fait échouer
les contrôles requis ; elle ne produit pas un succès par simple job ignoré.

La liste documentaire autorisée comprend :

- Les fichiers `.md` sous `docs/` et `scripts/`.
- `PROJECT_STATE.md`, `RUNNING.md` et les `README.md` à la racine, avec suffixe
  de langue éventuel, par exemple `README.fr.md`.

Les fichiers `AGENTS.md`, le code, la configuration, les workflows `.github/`,
les scripts de validation et les Markdown sous les répertoires applicatifs
restent dans le parcours complet. Une PR mixte reste également complète.
Les suppressions et les deux chemins d'un renommage participent au choix ;
renommer du code en `.md` ne permet pas d'ignorer les tests applicatifs.

Pour une PR, le diff va de l'ancêtre commun des SHA base/head à la tête de PR.
Pour un push, il compare les SHA before/after. Une comparaison indisponible,
un nouveau push sans SHA précédent, un changement vide ou un lancement manuel
conserve le parcours applicatif complet.

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
