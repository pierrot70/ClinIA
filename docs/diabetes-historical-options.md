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
