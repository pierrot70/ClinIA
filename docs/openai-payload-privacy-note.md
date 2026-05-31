# Pourquoi le payload OpenAI de ClinIA est minimise

Ce document ne pretend pas prouver une securite absolue.

Son objectif est plus modeste et plus honnete:

- expliquer ce que ClinIA envoie a OpenAI
- expliquer ce que ClinIA n'envoie pas
- montrer quels garde-fous techniques reduisent le risque
- fournir une base simple de verification interne

## Principe

ClinIA n'envoie pas le JSON clinique brut a OpenAI.

Avant la transmission cloud, le backend construit un payload clinique minimise.

L'objectif est de reduire le risque de re-identification tout en conservant
assez de contexte clinique pour produire une analyse utile.

## Ce que ClinIA envoie a OpenAI

Le payload cloud peut contenir seulement des elements cliniques utiles et
minimises, par exemple:

- `diagnosis`
- `sex`
- `age_band` plutot que l'age exact
- `symptoms` limites
- `medical_history` limite
- `current_medications` limites
- `diabetes_context` reduit aux champs utiles
- `weight_band` plutot que le poids exact

## Ce que ClinIA n'envoie pas a OpenAI

Le payload cloud ne doit pas contenir notamment:

- age exact
- country
- ethnicity
- height
- blood pressure exact
- `forceReal`
- `openaiModel`
- `incidentAckId`
- `reverifyRequested`
- nom
- telephone
- courriel
- numero RAMQ
- date de naissance

## Garde-fous techniques actuellement en place

ClinIA applique plusieurs controles techniques:

1. sanitization du payload entrant
2. detection de prompt injection
3. detection de donnees identifiables avant transmission cloud
4. neutralisation ou blocage si du contenu non securitaire est detecte
5. construction d'un payload cloud minimise
6. test automatique qui echoue si un champ interdit fuit vers OpenAI
7. audit MongoDB des requetes OpenAI

## Ce que prouve le test backend

Un test backend utilise un fichier JSON volontairement "unsafe".

Ce fichier contient des champs qui ne doivent pas etre envoyes au cloud, comme:

- age exact
- country
- ethnicity
- height
- blood pressure
- flags techniques internes

Le test verifie ensuite que:

- ces champs sont absents du payload cloud minimise
- ces champs sont absents du prompt final envoye a OpenAI

Si un champ interdit reapparait plus tard dans le code, le test doit echouer
avec un message explicite.

## Auditabilite

Chaque requete OpenAI est journalisee dans MongoDB avec notamment:

- auteur de la requete
- role
- horodatage
- modele utilise
- hash du payload
- resultat de la requete

Cela ne prouve pas une securite absolue, mais cela renforce:

- la tracabilite
- l'auditabilite
- la capacite de verification interne

## Limite importante

ClinIA ne peut pas prouver mathematiquement que le risque est nul.

Une garantie de 100 % n'est pas realiste.

La position la plus honnete est donc la suivante:

ClinIA applique une minimisation stricte, des tests automatiques, des controles
de securite et des audits afin de reduire de facon documentee le risque de
re-identification raisonnablement previsible.

## Formulation recommandee

Si une phrase courte doit etre utilisee a l'interne ou dans une discussion:

`ClinIA envoie a OpenAI un payload clinique minimise et controle par des tests automatiques, afin de reduire le risque de re-identification et de conserver une trace auditable des requetes.`

## Fichiers relies

- `backend/utils/requestSafety.js`
- `backend/routes/aiAnalyze.js`
- `backend/services/aiAnalyzeOpenAIService.js`
- `backend/services/__tests__/aiAnalyzeOpenAIService.test.js`
- `backend/services/__tests__/fixtures/openai-cloud-unsafe-patient.json`
