# Validation locale des langues de l’interface

La langue choisie dans le sélecteur doit être appliquée immédiatement et
restaurée après rechargement. Le navigateur ne remplace pas un choix enregistré.
Les neuf langues proposées sont déclarées dans `frontend/src/i18n/uiLocales.ts`.

## Ajouter ou modifier un libellé

1. Définir la source française dans `frontend/src/i18n/uiLabels.fr.ts`.
2. Ajouter les huit traductions dans un catalogue versionné, puis le brancher
   dans `localUiTranslations.ts`. Réutiliser les catalogues existants lorsque
   le contexte et le sens sont identiques.
3. Afficher le texte avec `useUiLabels`, `useUiLabelTree`, `UiText` ou
   `useTranslation`. Un objet `labels.*` français directement rendu n’applique
   pas la langue du sélecteur.
4. Conserver les paramètres nommés, y compris leurs répétitions. Une traduction
   de `{count} / {limit}` doit conserver `{count}` et `{limit}`.
5. Tester les états concernés et le changement de langue sans rechargement.

Éviter les fragments traduits séparément lorsqu’ils composent une phrase : les
langues peuvent utiliser un ordre différent. Les messages conservés dans l’état
React doivent garder leur source française et être traduits lors du rendu.

## Contrôles automatisés

Depuis la racine du dépôt, sans installation ni accès à la production :

```sh
bash scripts/validate-ui-translations-local.sh
```

Cette commande vérifie les catalogues, les paramètres, les clés de connexion,
les tests frontend, la compilation et les tests backend de traduction. Le
rapport `/tmp/clinia-ui-translation-coverage.json` distingue les traductions
manquantes, les valeurs identiques et les exceptions explicites. L’inventaire
AST `/tmp/clinia-ui-translations-audit.json` recherche aussi les textes hors
catalogue ; ce contrôle statique ne prouve pas à lui seul le rendu d’une page.

Le job frontend existant exécute également les contrôles bloquants des catalogues
et des textes directement rendus détectables par l’analyse statique. Le fichier
`scripts/ui-translations-exceptions.json` est vide : aucune dette de rendu n’est
acceptée. Toute future exception doit avoir une justification explicite.
Une nouvelle source sans traduction dans une langue proposée fait échouer ce
contrôle avant publication.

Les tests de connexion simulent les réponses d’authentification et de MFA : ils
ne nécessitent aucun compte MFA de staging, aucun secret et aucun envoi SMTP.
Les tests vérifient aussi la restauration du choix et la direction RTL pour
l’hébreu.

La validation du 10 octobre 2026 couvre 1 971 libellés dans les neuf langues,
sans traduction manquante ni paramètre perdu. L’analyse de 71 fichiers ne
détecte aucun texte directement rendu hors des règles contrôlées. Elle conserve
59 avertissements de revue, notamment pour les sources de messages serveur :
ce résultat ne remplace pas une vérification de tous les états à l’écran.

## Cache et erreurs serveur

Les libellés locaux versionnés ont priorité sur les anciens caches du navigateur
et les réponses de traduction. Le cache d’un libellé inclut sa source : changer
la source invalide son ancienne traduction. Les paramètres reçus sont validés.
Les bundles de la page d’accueil sont locaux dans les neuf langues.

`UiMessage` traduit les messages d’interface connus et leurs paramètres. Pour
une réponse serveur inconnue, il affiche un message fixe localisé. Le texte
serveur, les données patient et les contenus cliniques générés ne sont envoyés
à aucun service de traduction. Un code API générique comme `INVALID_INPUT`
ne suffit pas à choisir une explication précise sans le contexte de l’opération.

## Vérification humaine en staging

Pour chaque écran, vérifier la langue après sélection et après rechargement,
puis les états disponibles : chargement, liste vide, succès, erreur et accès
refusé. Vérifier aussi les confirmations, infobulles, titres et textes accessibles.

La revue visuelle doit couvrir téléphone, tablette et ordinateur, ainsi que
l’hébreu : champs, boutons, menus, tableaux et messages longs. La couverture
des catalogues ne garantit ni la qualité linguistique, ni l’absence de texte
coupé. Une revue humaine des traductions cliniques reste nécessaire.

Les contenus médicaux d’exemple explicitement marqués `lang="en"` et
`translate="no"` conservent leur politique anglaise existante. Les titres,
commandes et avertissements d’interface autour de ces contenus sont localisés.
Le panneau technique anglais des reçus conserve également son exception
explicite. Ces exceptions ne dispensent pas les nouveaux libellés de traduction.

Les indications visuelles de navigation vocale suivent le sélecteur. Les
réponses parlées conservent actuellement leur mécanisme français/anglais ;
leur extension aux autres langues demande une vérification distincte.

Agent-Contribution: frontend | Catalogues locaux, sélecteur et rendu des messages.
Agent-Contribution: backend | Validation des payloads et parité des clés approuvées.
Agent-Review: security | Inventaire statique et limites des contrôles automatisés.
