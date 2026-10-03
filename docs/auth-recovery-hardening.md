# Récupération de mot de passe et sessions — 3 octobre 2026

Branche : `maintenance/auth-recovery-hardening`, issue de `coolify` au commit
`a8ceda9`. Cette correction est distincte de l'analyse de caractérisation.

## Comportement corrigé

- Demander un code ne révoque plus les sessions. Une panne SMTP ne supprime
  que la demande concernée, même si une demande plus récente a le même code.
- Un code ne délivre qu'un seul grant ; cinq tentatives erronées simultanées
  épuisent aussi son budget. La consommation est conditionnelle et atomique.
- Un grant ne permet qu'un changement de mot de passe. Une transaction MongoDB
  applique ensemble le mot de passe, la consommation du grant, l'invalidation
  des sessions et la révocation des familles de refresh tokens.
- La génération persistante `authVersion` invalide les JWT, refresh tokens et
  challenges MFA précédents, même après une nouvelle connexion ou une écriture
  tardive restaurant un ancien identifiant de session.
- Les écritures login/refresh/MFA provenant d'un ancien mot de passe sont
  refusées. Le MFA déjà inscrit reste actif ; seuls ses challenges et son
  inscription en cours sont annulés par la récupération.
- L'expiration est réévaluée après les lectures, le calcul bcrypt et à chaque
  tentative transactionnelle. Les courriels et l'audit restent hors transaction
  pour ne pas être répétés lors d'une reprise interne MongoDB.

## Compatibilité et déploiement

L'absence de génération correspond à zéro pour les comptes et jetons existants.
Aucune migration de masse ni nouvel index n'est nécessaire. Le replica set
MongoDB est requis pour la transaction ; une panne bloque la récupération.
Les deux backends doivent exécuter cette version pour appliquer la garantie.
Revenir à un ancien backend supprimerait le contrôle de génération.

Cette branche ne modifie ni la limite quotidienne de 150 courriels, ni la
politique bcrypt, ni les compteurs d'échecs de connexion. Ces deux derniers
points restent des corrections séparées.

## Validation

Le lanceur ci-dessous utilise exclusivement un replica set MongoDB local
jetable, des identités synthétiques et des courriels simulés. Les tests couvrent
les courses, les expirations, le rollback transactionnel, les anciennes
sessions et les écritures MFA tardives. La base et son conteneur sont nettoyés.

```bash
bash scripts/run-urgentologist-walk-in-integration.sh --recovery-security
bash scripts/ci-local.sh
```

Les tests de caractérisation de la branche d'analyse ne sont pas inclus : les
assertions ici exigent le comportement sécurisé. Aucun test d'écriture n'est
réalisé en production.

Résultats locaux du 3 octobre : `CI_LOCAL_PASSED`, 1 221 tests frontend,
778 tests backend, 57 tests auth réexécutés en ordre mélangé (seed 3),
15 intégrations récupération, 3 intégrations quota et 21 intégrations
réservation. Build et audits au seuil high/critical réussis ; nettoyages
confirmés. Journal : `/tmp/clinia-recovery-hardening-ci-final.log`.
Le rapport réservation `4f9d99ea-e367-4c07-8c71-27ebf5c61016` porte
`dirty: true` : validation de l'arbre de travail avant commit, pas une preuve
de déploiement du SHA de base. Aucun code n'a changé après cette validation.

Agent-Contribution: backend | récupération atomique et invalidation persistante des sessions
Agent-Review: security | revue statique récupération, sessions, MFA et courses ; aucune certification réglementaire
Validation: bash scripts/ci-local.sh | CI_LOCAL_PASSED, MongoDB jetable nettoyé
