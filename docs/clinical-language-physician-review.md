# Validation médecin de la politique linguistique et des résultats cliniques

Statut : préparation terminée, revue humaine non effectuée.
Version historique des observations O1 et O2 : `9127f51a9d7d40ff69404a4e1f6b2481602179fc`.
Candidat corrigé : branche `codex/staging-clinical-fixes`. Consigner le SHA
effectivement présenté au médecin au début de la revue.
Préparé le 24 octobre 2026, actualisé le 25 octobre 2026.
Périmètre : prototype ClinIA et cas fictifs.

Le médecin doit décider séparément si la politique linguistique est acceptable,
si les explications sont interprétables et si les alternatives présentées sont
appropriées aux cas examinés. La réussite des tests logiciels ne répond pas à
ces trois questions. Cette revue ne vaut pas autorisation d’usage clinique réel.

## État technique du candidat au 25 octobre 2026

Les essais techniques en staging ont vérifié le rattachement des précautions
par traitement, la restauration des résultats sans nouvelle analyse, la
provenance et la réutilisation du cache, la conservation du brouillon manuel
pendant la navigation et les libellés du panneau diabète dans neuf langues.
Ces essais utilisent des cas fictifs et ne constituent pas un avis clinique.

Les signaux historiques O1 et O2 ci-dessous restent à examiner par le médecin
sur le candidat corrigé. Conserver les cases de revue humaine non évaluées
jusqu'à son avis explicite. Un résultat technique favorable ne valide ni le
contenu médical, ni la qualité linguistique, ni un usage clinique réel.

## Corrections issues de la simulation par IA du 25 octobre 2026

La simulation de réviseur demandée par l'utilisateur emploie uniquement des
cas fictifs (hypertension à 55 ans, diabète à 55 ans, variante à 78 ans avec
fragilité faible et profil cardiovasculaire élevé à 58 ans). Elle ne remplace
pas la revue humaine décrite dans cette grille. Les avis humains restent
non évalués. La version initialement observée est `cc242a8` ; consigner le SHA
et/ou l'empreinte des modifications effectivement rejouées.

| Point | Comportement corrigé à vérifier au rejeu |
| --- | --- |
| SIM-01 Provenance par contenu | Une réponse réelle sans liste de traitements exploitable n'est plus complétée silencieusement par les exemples du frontend. Les options structurées réellement fournies doivent rester visibles avec leurs données et leur provenance. |
| SIM-02 Fragilité explicitement rapportée | L'âge, la tolérance et une donnée absente ne suffisent plus à établir la fragilité. Les mentions négatives ne doivent pas être interprétées comme une fragilité positive. Les coefficients du graphique restent illustratifs et ne sont pas validés par cette correction. |
| SIM-03 Complétude et rattachement | Conserver les détails, justifications, précautions, surveillance et références effectivement fournis pour l'option. Les données globales restent séparées. Signaler l'absence d'explication ou de donnée ; une catégorie comme « Pharmacologic treatment » ne constitue pas à elle seule une justification. Aucune information médicale manquante n'est inventée. |
| SIM-04 Fidélité des résumés | Le contrat d'entrée du diabète contient des objectifs et des éléments de tolérance, mais pas d'observation vérifiée établissant le contrôle glycémique. Les résumés générés des réponses réelles concernées sont retenus avec `summary_safety.status=withheld`, y compris à la relecture du cache. Les paramètres soumis restent visibles. |

La protection SIM-04 est volontairement conservatrice : elle retient aussi
des résumés génériques ou prudents. Elle ne constitue pas un validateur
sémantique universel des réponses médicales. Son périmètre est celui des
champs de résumé reconnus ; les autres textes exigent toujours une lecture
critique. Les anciennes sorties stockées restent intactes ; la protection
porte sur la vue retournée, sans correction médicale silencieuse ni nouvel
appel IA imposé. L'absence de détail dans une ancienne source reste une limite
de contenu même lorsque son affichage est réparé.

Le rejeu doit distinguer les réponses simulées du staging, les fixtures de
réponses réelles reconstituées pour les régressions et toute réponse réellement
observée. Ne pas attribuer aux tests une validation médicale des médicaments,
des scores, des références scientifiques ou des futures générations.

## Politique soumise au médecin

| Contenu | Comportement soumis à validation |
| --- | --- |
| Navigation, commandes, titres, messages d’interface | Traduits selon la langue choisie. Les termes qui influencent l’interprétation clinique doivent aussi être examinés. |
| Contenu médical de référence et réponses simulées | Source anglaise conservée et affichée sans traduction automatique. Une source anglaise peut néanmoins être erronée ou incomplète. |
| Notes et textes saisis par le médecin | Conservés dans leur langue originale, y compris négations, accents, nombres et unités. |
| Réponse IA réelle, mise en cache ou de secours | Provenance à consigner pour chaque cas. Le changement de langue de l’interface ne doit pas en reformuler le contenu clinique. |
| Résumé ou explication destiné à un patient | Le médecin doit préciser quels textes peuvent être partagés et lesquels nécessitent une explication adaptée ou une version humaine validée. L’anglais seul n’est pas présumé compris par le patient. |

Questions à trancher : les médecins visés comprennent-ils suffisamment l’anglais
clinique pour vérifier le contenu sans traduction automatique ? L’avis sur la
langue est-il visible et compréhensible ? Quels usages ou publics doivent être
exclus du périmètre accepté ?

## Préparer la séance

1. Désigner un médecin compétent dans les domaines examinés et noter les langues
   qu’il peut réellement évaluer. Un domaine ou une langue hors de sa compétence
   reste non évalué ou requiert un autre réviseur compétent.
2. Utiliser le staging et un compte médecin de test. Confirmer que le staging
   correspond au SHA cible, ou consigner le SHA différent et les écarts. Ne pas
   modifier de dossier réel ni utiliser le dossier fictif de production pour
   créer de nouvelles notes pendant cette séance.
3. Utiliser des réponses simulées ou des exemples figés et identifiés. La route
   `/clinical-demo` et un cas prérempli ne garantissent pas à eux seuls un mode
   simulé : vérifier la provenance effective. Ne pas forcer un appel IA réel.
4. Identifier chaque entrée et chaque réponse examinées : cas, mode, date de
   génération si disponible et copie des seuls textes fictifs utiles. Une
   réponse régénérée doit être réévaluée, même si le SHA n’a pas changé.
5. Prévoir ordinateur et écran de téléphone. Examiner le français et l’anglais ;
   ajouter l’espagnol seulement si un réviseur peut en apprécier le sens. Le
   contrôle complet des neuf langues, de la navigation et des formulaires fait
   partie d’une validation de production distincte et n’est pas attesté ici.

Pour chaque cas, noter **Accepté**, **À corriger** ou **Non évalué**, avec une
observation et une référence de preuve. Ne pas remplacer les cases vides par
une réussite implicite. Le médecin peut arrêter la séance sur un risque majeur.

## Cas à examiner

| Cas | Manipulation avec données fictives | Critère à apprécier par le médecin |
| --- | --- | --- |
| L1 Politique et compréhension | Lire l’avis sur la langue dans le formulaire et les résultats. | La différence entre interface traduite et contenu clinique anglais est explicite ; les limites de compréhension et de partage au patient sont définies. |
| L2 Invariance linguistique | Ouvrir le même exemple d’hypertension ; changer français, anglais et éventuellement espagnol, puis recharger. | Les commandes changent de langue ; les mêmes textes cliniques anglais gardent leur sens et leur contenu. Vérifier notamment les négations, nombres, unités, noms de médicaments et champs saisis. |
| E1 Explication et fiche | Depuis le résultat d’hypertension, ouvrir deux alternatives distinctes, dont une option médicamenteuse, puis revenir aux résultats. | Nom, explication, précautions et surveillance concernent bien l’option choisie. Une explication décrit ses raisons et ses limites, sans certitude non étayée ni prescription. Lever le signal O1 ci-dessous. |
| A1 Alternatives et contexte | Comparer les fixtures diabète de type 2 standard, à risque cardiorénal et âgé fragile. Faire préparer les profils à partir des fixtures existantes si nécessaire. | Les différences proposées sont justifiées par les données présentes ; les informations manquantes sont reconnues. Rechercher les omissions importantes et les options non médicamenteuses pertinentes, sans imposer une liste préparée par l’agent. |
| P1 Provenance | Comparer une réponse simulée avec le résultat fictif déjà mis en cache, si disponible. Examiner le résultat puis sa fiche. | Simulation, cache, secours et génération réelle sont distinguables ; la source reste compréhensible en passant d’un écran à l’autre. Lever le signal O2 ci-dessous. |
| I1 Données et indicateurs | Examiner une réponse sans explication ou précaution détaillée, ainsi que les badges de pertinence, graphiques et pourcentages lorsqu’ils sont présents. | « Non fourni » ne signifie pas « absent » ou « sans risque ». Les valeurs illustratives et badges heuristiques ne sont pas pris pour des probabilités validées, une efficacité mesurée ou une recommandation de première intention. |
| N1 Langue originale des notes | Sur un dossier de staging exclusivement fictif, enregistrer puis relire une note française et une note espagnole, avant et après changement de langue. | Texte original, négations, accents et unités sont conservés ; aucune traduction ou reformulation silencieuse. Faire vérifier le sens par une personne compétente dans la langue concernée. |
| R1 Sources et limites | Pour les affirmations retenues dans E1 et A1, relever la source scientifique, sa date, la population et la portée. | Le médecin peut confirmer ou contester l’affirmation à partir d’une source appropriée. Une source absente, inaccessible ou non applicable reste une réserve explicite, sans inventer de référence. Un lien général ne justifie pas à lui seul chaque score ou affirmation. |

Exemples de notes purement fictives pour N1 :

- Français : « Note fictive de validation linguistique : poids 70 kg ; aucun symptôme ajouté. »
- Espagnol : « Nota ficticia de validación lingüística: peso 70 kg; no se añade ningún síntoma. »

Les fixtures de référence sont dans
[les scénarios frontend](../frontend/src/data/clinicalDemoScenarios.ts),
[les cas préremplis](../frontend/src/data/clinicalExampleCases.ts) et
[les réponses simulées backend](../backend/mocks/clinicalMocks.json).
Elles servent de matériel de revue, pas de recommandations déjà approuvées.

## Signaux à lever avant acceptation du périmètre concerné

**O1 Rattachement des précautions.** Lors de la vérification fonctionnelle du
24 octobre sur la production `9127f51`, le résultat fictif d’hypertension déjà
mis en cache a ouvert une fiche « Calcium channel blockers (e.g., amlodipine) ».
Cette fiche affichait notamment « History of angioedema related to ACE
inhibitors » et « Gout (use with caution) ». Faire vérifier le rattachement
par option et la pertinence par le médecin, puis l’origine des données par
l’équipe technique. Il s’agit d’un signal observé, pas d’une erreur
pharmacologique confirmée par une revue clinique. Ne pas accepter E1 tant que
ce signal n’est pas expliqué et, si nécessaire, corrigé puis retesté.

**O2 Provenance entre écrans.** Le même parcours annonçait une analyse
équivalente déjà disponible, puis la fiche affichait « Contexte clinique
genere ». Vérifier si cette formulation permet de comprendre la provenance
effective et l’ancienneté du contenu. Ne pas en déduire que la fiche est une
référence médicale validée. Résoudre toute ambiguïté avant d’accepter P1.

## Fiche de résultats à compléter

Le dépôt GitHub est public. Conserver l’identité, la signature et les éventuels
détails personnels du médecin dans un compte rendu privé. Ne versionner ici
qu’un identifiant de revue non identifiant et une synthèse sans données réelles.

| Élément | À compléter |
| --- | --- |
| Identifiant de la revue et référence du compte rendu privé | Non renseigné |
| Date, environnement et SHA effectivement examinés | Non renseigné |
| Domaines et langues couverts par le médecin | Non renseigné |
| Cas, entrées et réponses figées examinés | Non renseigné |
| Résultats L1, L2, E1, A1, P1, I1, N1 et R1 | Non évalués |
| Sort des signaux O1 et O2 et preuves de retest | Non évalué |
| Politique linguistique | Non évaluée |
| Explications | Non évaluées |
| Alternatives | Non évaluées |
| Réserves, usages exclus et corrections demandées | Non renseignés |

Pour chaque anomalie : consigner le cas, l’option, la langue, le texte observé,
la raison clinique du désaccord, l’attendu proposé par le médecin, la gravité
et le résultat du retest. Distinguer un problème d’affichage, de données,
de rattachement, de langue et de contenu médical.

## Décision et clôture

L’acceptation porte uniquement sur les cas, réponses, langues, domaines et
usages explicitement examinés. Elle exige un avis humain explicite et la levée
des points bloquants du périmètre retenu. Une moyenne de bonnes réponses ne
compense pas une erreur susceptible de modifier une décision clinique.

Si des corrections sont demandées, conserver leur lien avec les observations,
faire les contrôles techniques appropriés puis soumettre le nouveau résultat
au médecin. Un changement de contenu, de source, de modèle ou d’affichage qui
affecte l’interprétation peut nécessiter une nouvelle revue. Ne pas étendre
une acceptation des simulations à toutes les futures réponses IA réelles.

## Repères pour la revue

Le [Collège des médecins du Québec sur la responsabilité professionnelle](https://www.cmq.org/fr/pratiquer-la-m%C3%A9decine/informations-clinique/intelligence-artificielle/sia-imputabilite-responsabilite)
rappelle la nécessité de relire les résultats et de faire primer le jugement
clinique. L’[OMS sur les modèles génératifs en santé](https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models)
souligne les risques de résultats inexacts et de confiance excessive, ainsi
que la participation des professionnels à leur évaluation. Ces repères
motivent la revue ; ils n’approuvent ni ClinIA ni sa politique linguistique.

Agent-Contribution: frontend | Préparation de la grille fondée sur les écrans et les parcours existants.
Agent-Review: clinical | Revue de la structure des cas et des critères ; aucune validation clinique humaine.
