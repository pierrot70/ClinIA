# Revue visuelle staging — 11 octobre 2026

## Décision utilisateur — 12 octobre 2026

Après navigation sur de nombreuses pages, l'utilisateur n'a pas constaté
d'erreur de traduction et accepte les corrections pour intégration directe
dans `coolify`. Cette vérification ne garantit pas l'absence de défauts ;
une nouvelle revue des traductions est reportée à plus tard. Cette acceptation
concerne l'interface et ne constitue pas une validation clinique humaine.

Référence : `coolify`, `f3de013893a789439596c0bb891adb693dee8f28`.
Frontend Vite sur `http://localhost:5174`, API staging sur `http://localhost:4002`.
Tailwind CSS `4.3.3`. La revue a été réalisée avec Chromium via Playwright,
en français, aux dimensions 390 × 844, 768 × 1024 et 1440 × 1000.

## Résultat

**Défauts corrigés en staging local ; vérification utilisateur attendue.**
Les constats initiaux ci-dessous sont conservés pour comparaison avec les
captures après correction. Les modifications s'ajoutent localement à la
référence Git indiquée ; aucun déploiement en production n'a été effectué.
Les mêmes constats se reproduisent dans les captures et les mesures du DOM.
Cette revue établit l'état actuel après migration ; elle ne démontre pas que
chaque défaut a été introduit par Tailwind 4.

| Priorité | Constat | Preuve et effet | Correction recommandée |
| --- | --- | --- | --- |
| P1 | Les indications de recherche patients sont invisibles. | La couleur des placeholders et celle du fond sont toutes deux `rgb(156, 163, 175)` (`#9ca3af`). Les cinq champs semblent vides sans indication. | Donner aux champs une surface contrastée et conserver des indications lisibles ; ajouter des labels visibles. |
| P1 | Les actions patients sont coupées sur tablette. | À 768 px, le tableau mesure environ 882 px dans un conteneur de 718 px avec `overflow-x: hidden`. « Demander du soutien » et « Archiver » débordent et sont masqués. | Permettre le défilement horizontal local ou garder les cartes jusqu'à une largeur suffisante. |
| P1 | Le tableau des options thérapeutiques déborde sur mobile. | À 390 px, déplier « Alternatives et recommandations » porte la largeur de la page à 451 px. La dernière colonne sort de la carte. | Contenir le tableau dans une zone de défilement horizontal ou proposer une présentation en cartes sur mobile. |

Constat secondaire : avec l'adresse longue du compte fictif, l'identité dans
l'en-tête desktop chevauche le sélecteur de langue. Vérifier une réduction de
largeur ou un retour à la ligne de ce groupe.

## Parcours examinés

- Connexion : formulaire visible aux trois tailles ; connexion du compte
  médecin fictif réussie. Aucun débordement horizontal mesuré.
- Patients : deux dossiers actifs, dont un nom long ; cartes et actions
  dépliées sur mobile, tableau sur tablette et desktop, formulaire de création
  aux trois tailles. Aucun dossier créé depuis le formulaire pendant la revue.
- Résultat clinique : exemple approuvé `hypertension55`, réponse HTTP 200 avec
  `meta.source: mock` aux trois tailles ; résumé et alternatives repliés et
  dépliés. Aucun appel IA réel demandé. Le résultat replié ne déborde pas.
- Route rapide `/results` ouverte directement : erreur de concepts cliniques
  approuvés affichée. Cet écran d'erreur a été conservé séparément ; il ne sert
  pas de preuve de réussite du résultat clinique complet.

Les captures du résultat complet montrent aussi des identifiants techniques
`wellTolerated` et `monitoring` dans la colonne « Contre-indications » du tableau
simulé. La correspondance entre indicateurs de traitement et cette colonne doit
être revue séparément ; cette observation n'est pas une validation clinique.

## Preuves et limites

Captures et mesures locales dans
[`validation-artifacts/visual-review-20261011`](../validation-artifacts/visual-review-20261011/).
Exemples :

- [Connexion mobile](../validation-artifacts/visual-review-20261011/connexion-mobile.png)
- [Patients tablette](../validation-artifacts/visual-review-20261011/patients-tablet.png)
- [Résultat mobile déplié](../validation-artifacts/visual-review-20261011/resultat-alternatives-mobile.png)
- [Mesures des champs et du tableau patients](../validation-artifacts/visual-review-20261011/diagnostics.json)
- [Mesures des écrans et erreurs JavaScript](../validation-artifacts/visual-review-20261011/report.json)

Compte médecin et trois patients exclusivement fictifs, propriété identifiée
par un marqueur unique ; nettoyage de ces seuls documents et sessions confirmé
par `CLEANUP_OK`. Les audits restent conservés. Aucune donnée patient réelle
n'a été utilisée. Aucun code applicatif n'a été modifié pendant la revue.

Le navigateur a été redimensionné : ni Safari/iOS sur appareil réel, ni la
production, ni réception/administration n'ont été examinés dans ce périmètre.
Le mock utilisé ne contient pas de liste de signaux d'alarme : leur panneau
n'a pas été validé visuellement. Aucune revue clinique humaine n'est revendiquée.

## Corrections et nouvelle vérification

- Filtres patients : fond blanc, indications gris ardoise et noms accessibles.
- Tableau patients : défilement horizontal local ; actions accessibles à droite.
- Options thérapeutiques : tableau contenu dans la carte, sans élargir la page.
- En-tête : sélecteur de langue et identité séparés ; adresse longue tronquée.
- Contre-indications : les indicateurs `wellTolerated` et `monitoring` restent
  des indicateurs. Les contre-indications explicitement fournies sont conservées ;
  une liste absente affiche « Aucune mentionnée ».

Les parcours connexion, patients, création et résultat clinique simulé ont été
rejoués à 390, 768 et 1440 px. Aucun débordement de page mesuré, y compris avec
les alternatives ouvertes. Une vérification complémentaire des patients à
320, 390, 768, 1024, 1280 et 1440 px confirme le contraste des indications,
l'accès au bouton Archiver après défilement et l'absence de chevauchement
entre identité et langue. La colonne clinique a également été vérifiée après
défilement sur mobile. Les 21 tests ciblés de `ClinicalDemoResult` et
`Header.locale` passent ; la compilation frontend réussit.

Les nouvelles captures et mesures sont dans le sous-dossier
[`after`](../validation-artifacts/visual-review-20261011/after/).
Le [PDF corrigé](http://localhost:5175/revue-visuelle-staging-corrigee-20261011.pdf)
contient trente pages : synthèse, quatre constats avant correction, quatre
captures après correction et la vérification espagnole ci-dessous, avec vingt-neuf
cases interactives initialement vides.
Les liens ouvrent [les patients](http://localhost:5174/patients) et
[le formulaire clinique](http://localhost:5174/clinical-demo). Rejouer l'exemple
hypertension à 55 ans et ouvrir les alternatives pour vérifier le tableau.
Ces services locaux doivent rester démarrés.

Le compte et les patients fictifs créés pour cette seconde vérification ont
été supprimés : `CLEANUP_OK`, sortie 0. Les audits restent conservés. Les
limites de la première revue et la nécessité d'une revue clinique humaine
restent applicables.

## Complément : questions en espagnol à 375 px

La capture utilisateur montrait « Contextual clinical questions » et
« Additional clinical question » sous une langue espagnole. Les cartes de
questions recevaient l'anglais pour toute langue non française ; le filtre
anglais masquait ensuite certaines questions déjà localisées. Les cartes
reçoivent désormais la langue réellement choisie et les titres internes
utilisent le catalogue de cette langue.

36 tests ciblés passent (`QuestionCard`, `ClinicalDemoResult` et
`clinicalResultStrings`), dont un changement anglais vers espagnol et une
question espagnole contenant un nom de traitement français. Compilation
frontend réussie. Le composant réel a aussi été monté isolément dans Chromium
tactile à 375 × 667 avec un résultat fictif : titre et questions espagnols,
aucun remplacement anglais ni débordement. La
[capture complémentaire](../validation-artifacts/visual-review-20261011/after/questions-espagnol-375.png)
est ajoutée au PDF. Cette vérification ne traduit pas le contenu clinique
libre renvoyé par l'API et n'a pas utilisé de service IA.

Agent-Contribution: frontend | langue sélectionnée transmise aux questions et aux titres internes, régressions espagnoles couvertes
Agent-Review: frontend | contraste, défilement local, en-tête et correspondance des contre-indications corrigés
Validation: 21 tests ciblés, build frontend, parcours Chromium staging, six largeurs patients, CLEANUP_OK

Complément connexion : fond blanc, texte sombre et bordure gris ardoise sur les
champs identifiant et mot de passe. Couleur calculée confirmée dans Chromium
à 375 px ; capture et lien de connexion ajoutés en page 11 du PDF.

Complément réponses espagnoles : traduction locale exacte des réponses
simulées génériques et des résumés hypertension (indapamide, amlodipine,
candesartan). Le contenu clinique inconnu reste intact et aucun service
externe n'est appelé. Les deux réponses signalées ont été dépliées dans le
composant réel en Chromium tactile à 375 px : affichage espagnol confirmé,
sans débordement. 39 tests ciblés et compilation réussis. Capture ajoutée en
page 12 du PDF avec une case interactive.

## Généralisation aux neuf langues

Le catalogue réservé à l'espagnol est remplacé par
`simulatedClinicalContent.ts`. Les trois variantes du résumé générique et les
résumés fictifs indapamide, amlodipine et candesartan sont disponibles dans
chaque langue du sélecteur : français, anglais, espagnol, coréen, vietnamien,
norvégien, japonais, chinois et hébreu. La recherche porte sur des textes
simulés exacts ; les réponses cliniques libres inconnues restent intactes.

59 tests ciblés passent, couvrant les six sources dans les neuf langues,
les réponses affichées quand la traduction distante est indisponible et le
changement immédiat de langue. Compilation réussie. Le composant réel monté
isolément dans Chromium tactile à 375 px a été vérifié successivement dans
les neuf langues, avec les deux réponses ouvertes : textes localisés et
largeur de page de 375 px confirmés. Capture hébraïque vérifiée de droite à
gauche. Neuf captures et `after/all-language-diagnostics.json` constituent
les preuves ; captures ajoutées en pages 13 à 21 du PDF avec une case par page.

Agent-Contribution: frontend | catalogue local des réponses simulées dans les neuf langues et tests de couverture
Validation: 59 tests ciblés, build frontend, neuf langues dans Chromium tactile à 375 px | réussis

## Formulaire : libellés, aides et valeurs d'exemple

Les libellés et aides auparavant déclarés en texte français dans le composant
ont une source dans `UI_LABELS_FR.clinicalFormFields` et des traductions
locales dans les neuf langues. Les diagnostics, antécédents et symptômes des
six exemples sont présentés dans la langue choisie ; les options du sélecteur
d'exemples sont également localisées. Les noms internationaux des médicaments
restent identiques. Les concepts canoniques anglais sont conservés dans l'état
et la requête afin de respecter le catalogue clinique de l'API.

La localisation des valeurs est limitée à l'exemple fictif sélectionné.
L'import JSON, les dossiers chargés et les valeurs manuellement modifiées ne
sont pas traduits automatiquement. Une saisie de concept localisé connu de
l'exemple est reconvertie vers son concept canonique sans altérer les fragments
personnalisés ou leurs espaces.

487 tests ciblés passent (`ClinicalForm`, `clinicalFormFieldLabels`,
`localUiTranslations`). Ils couvrent les neuf langues, les concepts de chacun
des six exemples, la requête canonique et le maintien d'une modification
personnalisée lors du changement de langue. Compilation réussie. Vérification
du composant réel monté isolément dans Chromium tactile à 375 px, dans les
neuf langues : libellés et aides principaux, diagnostic et symptômes localisés,
absence de débordement de page et valeurs canoniques remises au callback
confirmés. Aucun appel d'analyse envoyé à l'API. Les captures
`after/formulaire-*-375.png` et `after/form-language-diagnostics.json` sont
ajoutées ; neuf pages supplémentaires du PDF (22 à 30) contiennent les liens
et cases de revue, dont la page 30 en hébreu de droite à gauche.

Agent-Contribution: frontend | formulaire et valeurs d'exemple localisés dans les neuf langues, requêtes canoniques et saisies conservées
Validation: 487 tests ciblés, compilation, neuf langues à 375 px et requêtes interceptées par callback | réussis
