# Corrections issues des essais UI du 26 septembre 2026

Base : `6b5c19b`, corrections locales destinées au staging avant publication.

## Constats et corrections

- RECEPTION : recherche, choix d'un créneau, confirmation et nouvelle recherche
  du rendez-vous observés par l'utilisateur. Le rappel d'urgence anglais est
  conservé à sa demande explicite, comme contenu médical English-only.
- Exemples cliniques : six exemples et deux cas comparatifs utilisent désormais
  des termes médicaux anglais fixes, indépendants de la langue de l'interface.
  Les cinq formulations anglaises du contexte diabète sont ajoutées explicitement
  à la liste backend autorisée ; les ajouts de texte arbitraire restent refusés.
  Les paramètres et les recommandations thérapeutiques ne sont pas modifiés.
- Résultat réutilisé : « Consulter le résultat » remplace la déclaration de
  lecture prématurée. Échap ferme la fenêtre ; focus initial et navigation Tab
  sont pris en charge. Le dialogue possède ses traductions versionnées.
- Résumé : les paramètres réellement soumis sont affichés séparément du résumé
  généré, même si celui-ci est absent d'un ancien résultat. Les valeurs absentes
  sont signalées, aucune caractéristique patient n'est déduite du texte généré.
  L'affichage repose sur une liste explicite de champs et ne révèle pas les
  paramètres de contrôle temporaires.
- Copie JSON : libellé et messages traduits dans les neuf langues, source
  française versionnée. Le contrôle temporaire `incidentAckId` est exclu de
  la copie, comme les autres paramètres de pilotage.
- Rapports : aucun mélange d'export reproduit. Les audits de l'essai montraient
  des demandes pour le deuxième rapport et les PDF correspondaient à ces
  demandes. Tests ajoutés : deux exécutions d'un même commit, tri, JSON puis
  PDF de chacune, URL, nom et contenu binaire associés au bon téléchargement.

## Validation

- Suite frontend : 47 fichiers, 1 207 tests réussis.
- Build frontend : réussi ; avertissement de taille de bundle préexistant.
- Suite backend : 96 fichiers, 742 tests réussis en America/Toronto.
- Complément après la suite frontend : 8 tests comportementaux réussis,
  contexte transmis au résultat et contrôles exclus de la copie vérifiés.
- Les huit payloads réels d'exemples ont été confrontés à la validation backend
  lors du travail : acceptés. Les suites versionnées restent indépendantes
  des fichiers de l'autre composant pour fonctionner dans leurs conteneurs.
- Une première exécution backend dans le sandbox a échoué sur `listen EPERM`
  et `spawnSync bash EPERM`. La suite relancée avec les permissions nécessaires
  a réussi ; aucun test n'a été désactivé pour contourner ces erreurs.

Ces contrôles ne constituent pas une revue clinique humaine. Les anciens
résultats et mocks ne sont pas réécrits ; un résultat sans `red_flags` ne
permet toujours pas de vérifier visuellement cette section.

```text
Agent-Contribution: frontend | exemples anglais, dialogue de réutilisation, résumé structuré, traduction et régressions des exports
Agent-Contribution: backend | cinq formulations anglaises autorisées et tests du contrôle des entrées
Validation: suites frontend/backend et build frontend | 1207/742 tests et build réussis
```

## Complément : bouton d'analyse et chargement

- « Analyser » utilise désormais une traduction statique versionnée dans les
  neuf langues, dont « Analyze » en anglais ; aucun appel de traduction requis.
- Le spinner indique « Analyse clinique en cours… » (ou sa traduction), sans
  affirmer un appel OpenAI avant de connaître la provenance de la réponse.
  Le statut est annoncé aux technologies d'assistance avec `role="status"`.
- 42 tests ciblés réussis : bouton dans les neuf langues, labels et chargement
  avec source mock, réelle ou inconnue. Aucune modification de routage IA.

## Validation finale avant commit/push

`bash scripts/ci-local.sh` : `CI_LOCAL_PASSED`, 1 220 tests frontend,
742 backend, 57 régressions auth, build et audits au seuil high/critical réussis.
Intégration 21/21 et nettoyage confirmé. Rapport local
`586e4678-aae0-40f0-b62b-4b08ec76f02b`, base `6b5c19b`, `dirty: true`
(lot local avant commit). Journal `/tmp/clinia-ui-fixes-prepush-ci.log`.
