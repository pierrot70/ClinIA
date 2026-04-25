# ClinIA – Multi-Agent Development Guide

Ce projet utilise plusieurs agents spécialisés pour développer
l'application ClinIA.

Les agents doivent collaborer en respectant leur domaine de responsabilité.

L'objectif est de construire une application clinique sécurisée qui aide
les médecins à identifier rapidement des options thérapeutiques validées
scientifiquement après qu’ils aient établi leur diagnostic.

IMPORTANT  
ClinIA doit respecter les principes de protection des données exigés par :

- Loi 25 (Québec)
- PIPEDA (Canada)

Aucune donnée patient identifiable ne doit être envoyée vers un service
cloud ou un modèle d’IA.

---

# Architecture générale

Frontend
React + TypeScript + Tailwind + Vite

Backend
Node.js + Express

Auth
JWT + RBAC

AI
Analyse clinique assistée par IA

Logs
Audit logs obligatoires

---

# Agents disponibles

Les agents suivants peuvent intervenir dans ce projet :

- frontend
- backend
- security
- clinical

Chaque agent doit rester dans son périmètre.

Les modifications doivent être :

- petites
- testables
- auditables

---

# FRONTEND AGENT

Responsabilité : interface utilisateur.

Technologies :

React  
TypeScript  
Tailwind  
Vite

Fonctionnalités principales :

interface médecin

- formulaire de diagnostic
- affichage résultats IA
- tableau clinique structuré

authentification

- page login
- gestion session
- protection routes

gestion rôles utilisateurs

- MEDECIN
- ADMIN
- SUPERADMIN

Interface résultats IA :

Hypothèse clinique  
Options thérapeutiques  
Justification scientifique  
Contre-indications  
Résumé clinique

Contraintes :

- ne jamais exposer de secrets API
- ne jamais afficher données sensibles dans la console
- protéger les routes selon rôle utilisateur
- privilégier une UX simple et rapide pour les médecins
- tous les labels visibles de l'interface doivent avoir leur source
  française dans `frontend/src/i18n/uiLabels.fr.ts` avant d'être
  consommés par les composants
- les traductions éventuelles doivent dériver de cette source française
  versionnée; aucun label UI principal ne doit dépendre uniquement
  d'une traduction dynamique, d'une base de données ou d'un appel IA

Structure recommandée :

frontend/
  auth/
  components/
  pages/
  services/
  hooks/

---

# BACKEND AGENT

Responsabilité : logique serveur et API.

Technologies :

Node.js  
Express  
MongoDB

Fonctionnalités principales :

authentification sécurisée

- bcrypt password hashing
- JWT access token (durée courte)
- refresh token rotation

RBAC (Role Based Access Control)

Rôles supportés :

MEDECIN  
ADMIN  
SUPERADMIN

Endpoints requis :

POST /auth/login  
POST /auth/logout  
POST /auth/refresh  

Middleware requis :

verifyJWT  
requireRole  

Audit logs obligatoires pour :

login  
logout  
analyse IA  
consultation résultat

Structure backend recommandée :

backend/
  auth/
  routes/
  middleware/
  models/
  audit/
  services/

Contraintes :

- ne jamais logguer de données patients
- valider toutes les entrées
- protéger contre injections
- limiter les requêtes
- masquer les stack traces en production

---

# SECURITY AGENT

Responsabilité : sécurité et conformité réglementaire.

Objectif :

garantir la conformité aux principes de protection des données
exigés par :

- Loi 25
- PIPEDA

Principes obligatoires :

Contrôle d'accès strict

RBAC obligatoire

Chiffrement :

HTTPS obligatoire  
JWT sécurisé  

Audit logs obligatoires :

user_id  
timestamp  
action  
ip  

Les logs ne doivent jamais contenir :

- nom patient
- numéro RAMQ
- téléphone
- email
- toute donnée permettant d'identifier un patient

Validation des entrées :

protection contre :

SQL injection  
XSS  
prompt injection  

Rate limiting requis pour :

login  
API analyse  

Principe général :

Privacy by default

Minimisation des données.

---

# CLINICAL AGENT

Responsabilité : logique clinique et validation scientifique.

Objectif :

assurer que les résultats générés par l’IA sont :

- cohérents médicalement
- structurés pour les médecins
- basés sur des preuves scientifiques solides

Structure attendue des résultats :

Hypothèse clinique

Options thérapeutiques

Justification scientifique

Contre-indications

Résumé clinique

Contraintes :

- ne jamais générer d’ordonnance
- ne jamais poser un diagnostic final
- toujours présenter des options thérapeutiques
- la décision médicale finale appartient au médecin

Le rôle de ClinIA est :

assistant clinique  
pas système de décision autonome

---

# Collaboration entre agents

backend

- implémente API
- gère authentification
- gère sécurité

frontend

- consomme API
- présente résultats

security

- vérifie conformité
- contrôle les logs
- applique principes Loi 25 et PIPEDA

clinical

- organise résultats médicaux
- valide cohérence scientifique

Les modifications doivent rester :

simples  
auditables  
maintenables

---

# Objectif produit

ClinIA est un système d’aide à la décision clinique.

Flux principal :

médecin écrit diagnostic  
↓  
IA analyse  
↓  
ClinIA propose options thérapeutiques  
↓  
médecin décide  

Le système :

ne pose pas de diagnostic  
ne prescrit pas  
n’émet pas d’ordonnance  

La responsabilité médicale appartient toujours au médecin.

---

# Principe fondamental

L'IA assiste.  
Le médecin décide.
