# Options des réponses historiques diabète

## Cause observée le 1 novembre 2026

Une inspection en lecture seule, limitée aux entrées synthétiques exactes
DT2-55, DT2-78-LOW-FRAILTY et DT2-CV-58 de la simulation, a retrouvé une
réponse réelle enregistrée par cas. Le tableau normalisé `treatments` était
vide, alors que `other_ai_fields.therapeutic_options` conservait les options.
Le garde des résumés ne supprimait pas ces listes. Les fixtures antérieures,
reconstituées à partir des textes de l'interface, ne reproduisaient pas ces
trois formats historiques.

| Cas fictif | Conteneur source | Options attendues |
| --- | --- | --- |
| DT2-55 | `additional_options` : tableau avec `class` | 3 |
| DT2-78-LOW-FRAILTY | `additional_or_alternative_options` : dictionnaire | 3 |
| DT2-CV-58 | `additional_agents` : tableau avec `class` | 2 |

## Contrat de restitution

Le normaliseur reconnaît explicitement ces conteneurs sous
`therapeutic_options`. Les classes et clés du dictionnaire désignent les
options effectivement fournies. Une clé de dictionnaire peut remplacer ses
traits de soulignement par des espaces pour l'affichage ; sa forme originale
et les champs de l'option restent accessibles dans les données source.
Le groupe « Other agents » reste une seule option : ses molécules ne sont
pas séparées en traitements inventés.

Seules les informations propres à l'option alimentent ses détails. Une
contre-indication textuelle propre à une option est conservée comme un
élément, sans découpage ni interprétation médicale. Les considérations,
bénéfices, notes et autres champs restent conservés ; ils ne deviennent pas
automatiquement des précautions ou des points de surveillance. Les listes
globales de surveillance et de précautions restent séparées. Aucune recherche
récursive de noms dans les références ou le contexte n'est ajoutée.

Une `current_strategy` décrite sans nom explicite reste du contexte source,
sans carte fabriquée à partir de sa phrase. Les listes `treatments` déjà
explicites gardent leur priorité. Un résultat sans option exploitable reste
vide, avec l'avertissement existant et sans substitution par un exemple.

La protection `summary_safety.status=withheld` reste appliquée aux résumés
réels diabète. La relecture des trois cas ne modifie pas leurs sorties
enregistrées et ne déclenche aucune nouvelle génération. Le correctif de
structure ne valide ni les affirmations cliniques historiques ni les niveaux
de preuve manquants ; la décision demeure celle du médecin.

## Vérifications

Les régressions backend couvrent les trois formats, l'ordre et la fidélité
des champs, les contre-indications textuelles, les formats inconnus et les
contextes globaux exclus. Les régressions frontend passent par le véritable
normaliseur et le garde du cache, puis vérifient les cartes, les fiches, le
retour et la provenance réelle réutilisée. Les fixtures sont synthétiques et
minimales ; aucun identifiant de document historique n'est nécessaire.

Le rapport local de reprise distingue les structures effectivement lues en
production, le rejeu isolé des sous-structures récupérées et les tests de
fixtures. Une revue de logiciel par agents ne constitue pas une validation
clinique humaine.

## Tests DT2-55 en production du 22 novembre 2026

Les deux parcours ont réussi dans Chrome sur `clinique-ai.ca`, au commit
`f2ab1d9`, avec l’interface en anglais (Canada). Le cas fictif sélectionné
dans « Endocrinology » était « Type 2 diabetes », avec un âge de 55 ans et
« Metformin » dans la liste des médicaments actuels.

1. **Résultat en cache avec le compte médecin de test `test1` — réussi.**
   Après le clic sur « Analyze », ClinIA a affiché la fenêtre centrée
   « Result from a previous request » avant de montrer le résultat. Le message
   indiquait qu’une réponse enregistrée correspondait aux paramètres et
   qu’elle pouvait être consultée sans nouvel appel à OpenAI. Après le clic
   sur « View result », le résumé affichait « Current medications » puis
   « Metformin ». Les trois fiches de cette réponse historique portaient sur
   les agonistes du GLP-1, les inhibiteurs du SGLT2 et le groupe « Other agents ».
2. **Fiche de metformine dans la démo publique — réussi.**
   Après déconnexion de `test1`, le même cas a été ouvert sur `/clinical-demo`.
   Dans « Alternatives and recommendations », le lien « Details » de la carte
   « Metformin » a ouvert la fiche. Elle affichait « Simulated data » comme
   source et « Metformin » sous « Current medications ». La vérification de
   tout le texte visible a confirmé l’absence du champ `efficacy` et de la
   valeur `90`.

## Test DT2-78-LOW-FRAILTY en production du 22 novembre 2026

**Résultat du test d’affichage en Chrome : réussi sur le commit `8a8640e`.**
Dans la [démo publique de ClinIA](https://clinique-ai.ca/clinical-demo), le cas
« Endocrinology » → « Type 2 diabetes » a été repris en portant l’âge à 78 ans.
Les paramètres soumis affichaient « Frailty » à « Low » et la metformine
figurait parmi les médicaments en cours.

Depuis « Alternatives and recommendations », le lien « Details » de chaque
carte a été ouvert successivement pour ce même résultat. Les deux fiches
affichaient « Simulated data » et présentaient chacune une explication sous
« How to interpret this information? ».

1. **Metformine.** L’encadré précisait qu’avec une faible fragilité déclarée,
   l’âge seul ne justifie pas l’arrêt de la metformine déjà prise. Pour discuter
   de sa poursuite, la fiche invitait à examiner la fonction rénale, la tolérance
   et la dernière HbA1c mesurée au regard de l’objectif individuel du patient.
2. **Option GLP-1.** Après le retour aux résultats, la fiche « Reassessment of
   a GLP-1 option » indiquait que la faible fragilité laissait cette option
   ouverte à la discussion. Elle invitait à peser les bénéfices cardiovasculaires
   et glycémiques possibles, les symptômes digestifs et le risque de perte de
   poids involontaire, en tenant compte des préférences du patient.

## Test DT2-CV-58 en production du 22 novembre 2026

**Le test d’affichage a réussi dans Chrome sur le commit `ebaf6b1`.** Dans la
[démo publique de ClinIA](https://clinique-ai.ca/clinical-demo), le profil
fictif de 58 ans indiquait un risque cardiovasculaire « High ». Les antécédents
comprenaient « Atherosclerotic cardiovascular disease » et « Metformin »
figurait parmi les médicaments en cours.

Depuis « Alternatives and recommendations », le lien « Details » a permis
d’ouvrir successivement les deux fiches du même résultat. Toutes deux
affichaient « Simulated data » et expliquaient le rôle de l’antécédent
cardiovasculaire sous « How to interpret this information? ».

1. **Metformine.** La fiche rappelait que le patient prenait déjà la metformine
   pour contrôler sa glycémie. Elle invitait à revoir sa fonction rénale et sa
   tolérance avant de discuter de la poursuite du traitement. Elle précisait
   que la maladie cardiovasculaire athéroscléreuse justifiait aussi de discuter
   des traitements qui réduisent le risque de futurs événements cardiovasculaires,
   même si l’HbA1c est à la cible.
2. **Option GLP-1.** La fiche « Reassessment of a GLP-1 option » présentait un
   agoniste du récepteur du GLP-1 dont le bénéfice cardiovasculaire est démontré
   comme une option à discuter pour réduire ce risque, même si l’HbA1c est à la
   cible. Elle invitait à tenir compte des effets digestifs et des préférences
   du patient.

La validation de la formulation clinique par un médecin reste à faire.

## Bilan pour la revue médicale des trois cas de diabète

Les tests du 22 novembre 2026 ont confirmé l’affichage des trois cas fictifs
en production. La revue clinique reste ouverte. Pour chaque cas, cochez une
conclusion et notez votre avis dans le tableau. Ajoutez une ligne par correction.

### DT2-55 — Metformine déjà en cours à 55 ans

La fiche simulée présente la metformine parmi les traitements en cours et invite
à revoir sa tolérance et la dernière HbA1c mesurée. Le score « efficacy: 90 »
a été retiré. Le texte distingue-t-il clairement la poursuite du traitement et
la discussion d’une autre option ? Comprend-on que le dossier fournit une cible
d’HbA1c et que la valeur mesurée reste à vérifier ? Dans la réponse historique,
les explications sur les agonistes du GLP-1, les inhibiteurs du SGLT2 et le
groupe « Other agents » sont-elles assez précises ?

- [ ] Acceptable en l’état
- [ ] À corriger

| Avis du médecin | Phrase ou élément à revoir | Correction ou formulation proposée |
| --- | --- | --- |
| | | |

### DT2-78-LOW-FRAILTY — Fragilité déclarée faible à 78 ans

La fiche de metformine explique que l’âge seul ne justifie pas son arrêt.
La fiche GLP-1 invite à peser le bénéfice attendu, les effets digestifs et
le risque de perte de poids involontaire, en tenant compte des préférences
du patient. Les deux fiches donnent-elles un poids approprié à la faible
fragilité ? Quelle information sur ce patient manquerait pour discuter de
chaque option ?

- [ ] Acceptable en l’état
- [ ] À corriger

| Avis du médecin | Phrase ou élément à revoir | Correction ou formulation proposée |
| --- | --- | --- |
| | | |

### DT2-CV-58 — Maladie cardiovasculaire athéroscléreuse documentée à 58 ans

La fiche de metformine distingue son rôle dans le contrôle glycémique de
l’objectif de prévention cardiovasculaire. La fiche GLP-1 précise que la
discussion porte sur un médicament dont le bénéfice cardiovasculaire est
démontré, même si l’HbA1c est à la cible. Cette distinction est-elle exacte
et assez claire pour guider la discussion ? Le graphique mentionne aussi les
inhibiteurs du SGLT2. Faudrait-il expliquer leur présence dans la légende ou
leur consacrer une fiche ?

- [ ] Acceptable en l’état
- [ ] À corriger

| Avis du médecin | Phrase ou élément à revoir | Correction ou formulation proposée |
| --- | --- | --- |
| | | |

### Langue d’affichage des trois cas

Les explications cliniques sont en anglais, y compris dans l’interface
française. Cet affichage convient-il à la lecture en consultation ?

| Avis du médecin sur la langue | Adaptation souhaitée |
| --- | --- |
| | |
