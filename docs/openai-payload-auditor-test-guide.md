# Guide de test auditeur - payload OpenAI ClinIA

Ce document explique comment un auditeur peut challenger le mecanisme de
minimisation du payload envoye a OpenAI par ClinIA.

L'objectif n'est pas de prouver une securite absolue.

L'objectif est de verifier de facon reproductible que des champs non permis ne
fuient pas vers le payload cloud final.

## Ce que ClinIA veut verifier

ClinIA veut demontrer que:

- le backend ne transmet pas le JSON clinique brut a OpenAI
- certains champs non permis sont exclus avant transmission cloud
- cette regle est verifiee par un test backend automatisable

## Fichier de fixture de reference

Le test s'appuie sur une fixture JSON de reference:

- `backend/services/__tests__/fixtures/openai-cloud-unsafe-patient.json`

Cette fixture represente un cas volontairement "unsafe".

Elle contient des champs qui ne doivent pas etre transmis au cloud.

## Exemples de champs actuellement consideres non permis

Les champs suivants ne doivent pas se retrouver dans le payload final envoye a
OpenAI:

- `age`
- `country`
- `ethnicity`
- `height`
- `blood_pressure`
- `forceReal`
- `openaiModel`
- `incidentAckId`
- `reverifyRequested`

Cette liste peut evoluer selon l'evaluation de risque et les besoins de
conformite.

## Ce que l'auditeur peut faire

L'auditeur peut:

1. reprendre la structure de la fixture existante
2. ajouter des champs juges sensibles ou non permis
3. ajouter des combinaisons de quasi-identifiants
4. retourner le JSON propose pour execution du test

Exemples de variations utiles:

- age exact plus rare
- combinaison age + ethnicite + comorbidites distinctives
- champs techniques ou metadonnees internes
- historique clinique particulierement distinctif

## Comment ClinIA execute le test

Depuis le dossier `backend`:

```bash
npm test -- --run services/__tests__/aiAnalyzeOpenAIService.test.js -t "rejects any forbidden cloud fields"
```

Ou depuis la racine du projet:

```bash
cd backend && npm test -- --run services/__tests__/aiAnalyzeOpenAIService.test.js -t "rejects any forbidden cloud fields"
```

## Ce que verifie le test

Le test:

1. charge la fixture JSON
2. construit le payload cloud minimise
3. verifie que les champs interdits n'apparaissent pas dans ce payload
4. verifie que les champs interdits n'apparaissent pas non plus dans le prompt
   final envoye a OpenAI

## Resultat attendu

Le test doit passer si:

- les champs non permis ont ete exclus
- seuls les champs minimises et autorises sont conserves

Le test doit echouer si un champ interdit fuit vers OpenAI.

## Message d'echec attendu

En cas de fuite, le test doit produire un message explicite semblable a:

```txt
Des champs invalides ne peuvent etre envoyes a OpenAI: age, country, ethnicity
```

Ce message permet:

- d'identifier rapidement la fuite
- de corriger le code
- de rejouer le test apres correction

## Ce que ClinIA peut retourner a l'auditeur

Apres execution, ClinIA peut retourner:

- la fixture testee
- la commande executee
- le resultat du test
- le ou les champs qui ont fait echouer le test, s'il y en a

## Limite importante

Ce test backend ne suffit pas a lui seul a demontrer une conformite complete.

Il s'agit d'un controle technique utile parmi d'autres, notamment:

- minimisation des donnees
- revue du code
- auditabilite
- evaluation des risques
- gouvernance de la vie privee

## Fichiers relies

- `docs/openai-payload-privacy-note.md`
- `backend/utils/requestSafety.js`
- `backend/routes/aiAnalyze.js`
- `backend/services/aiAnalyzeOpenAIService.js`
- `backend/services/__tests__/aiAnalyzeOpenAIService.test.js`
- `backend/services/__tests__/fixtures/openai-cloud-unsafe-patient.json`
