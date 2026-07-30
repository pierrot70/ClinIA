# Migrations Mongo

Les migrations Mongo ClinIA sont explicites, ordonnees et tracees dans la collection `schemamigrations`.

## Principes

- Le mode par defaut est `--dry-run`; aucune ecriture n'est faite.
- Une migration appliquee conserve son identifiant et son checksum. Une modification retroactive est refusee.
- Une migration est executee dans une transaction Mongo avec `w=majority` et journalisation.
- Une seule execution est autorisee par verrou temporaire dans `schemamigrationlocks`.
- Les migrations irreversibles exigent `--allow-irreversible` et ne doivent jamais reduire ou tronquer une donnee clinique sans migration de remplacement verifiee.
- Les journaux de migration ne contiennent aucune donnee patient ni contenu clinique.
- Toute modification de schema est enregistree dans une migration. Une extension compatible sans transformation de donnees, comme l'ajout d'une valeur autorisee a un enum, utilise une migration de registre reversible et sans backfill.

## Local STAGING

Depuis la racine du depot:

```bash
./scripts/run-mongo-migrations.sh --dry-run
./scripts/run-mongo-migrations.sh --apply
./scripts/run-mongo-migrations.sh --dry-run
```

Le premier `dry-run` annonce la migration de registre. L'execution `--apply` cree son entree dans `schemamigrations`. Le dernier `dry-run` doit indiquer `already_applied` et `pending=0`.

Chaque `--apply` suit automatiquement ce protocole d'integrite des index, execute sous le verrou de migration:

1. Pre-audit des metadonnees des index, avec mesure de duree (seuil d'alerte: 5 secondes par defaut).
2. Application des migrations selectionnees.
3. Audit final strict: aucun index attendu absent, different, ou supplementaire n'est accepte.
4. Garde-fous de schema critiques.

Le pre-audit est informatif: une migration selectionnee peut justement corriger un index absent, obsolete ou configure incorrectement. Il ne bloque donc jamais le debut d'une migration corrective, y compris en production. Le post-audit ne s'execute qu'apres toutes les migrations selectionnees et bloque la fin de l'execution seulement si un ecart subsiste. Les messages ne contiennent que des metadonnees d'index, jamais de dossier patient.

Le seuil peut etre ajuste uniquement au besoin avec `MONGO_INDEX_AUDIT_MAX_DURATION_MS` (entre 100 et 60000, `5000` par defaut). Un depassement produit un avertissement mais ne bloque jamais la migration; seul un ecart d'index residuel au post-audit bloque la fin de l'execution. Le resultat nominal est:

```text
INDEX_AUDIT_PRECHECK_COMPLETE status=OK duration_ms=42 checked_collections=<n> errors=0 extras=0
INDEX_AUDIT_POSTCHECK_COMPLETE status=OK duration_ms=42 checked_collections=<n> errors=0 extras=0
```

Apres l'audit final, le runner execute automatiquement les garde-fous de schema sur les metadonnees Mongo reelles. Par exemple, une fois la migration de portee des identifiants patients appliquee, il confirme les index uniques par proprietaire et refuse un index unique global obsolete sur le telephone ou le numero d'assurance. Le resultat attendu est:

```text
SCHEMA_GUARD_OK guard=patient_owner_scoped_indexes
```

Un echec n'affiche que le nom et la structure de l'index en cause, jamais de dossier patient. Corriger l'index par une migration dediee avant tout deploiement applicatif.

Si un ancien environnement a applique des migrations dans un ordre different, ne jamais modifier retroactivement une migration deja enregistree. Ajouter une migration corrective nouvelle et idempotente, puis laisser le garde-fou confirmer le schema final.

## Audit global des index

Avant une nouvelle migration importante, verifier les index reels de toutes les collections gerees par les modeles ClinIA. Cette commande est strictement en lecture seule: elle ne cree, ne supprime et ne reconstruit aucun index.

```bash
./scripts/audit-mongo-indexes.sh
```

Le resultat attendu est `INDEX_AUDIT_COMPLETE status=OK`. Un `ERROR` indique un index attendu absent ou avec une configuration differente du modele. Un `WARNING index_audit_extra` signale un index supplementaire, possiblement herite; il doit etre examine puis retire seulement par une migration dediee si son retrait est approprie.

Sur le droplet, apres le deploiement du code, executer l'audit dans le backend principal:

```bash
BACKEND_CONTAINER="$(
  docker ps --format '{{.Names}}' |
  grep '^backend-' |
  grep -v '^backend-replica-' |
  head -n1
)"

docker exec "$BACKEND_CONTAINER" \
  node /app/scripts/migrations/auditMongoIndexes.js
```

Ne jamais supprimer manuellement un index signale. Ajouter une migration corrective idempotente, l'appliquer avec le protocole habituel, puis relancer l'audit pour confirmer `extras=0`.

## Drill de transformation reversible

Le drill suivant n'utilise qu'une collection de test et la nettoie a la fin:

```bash
./scripts/run-staging-mongo-migration-drill.sh
```

Il ajoute un entier echelle a partir de valeurs `float`, conserve la valeur source et demontre les ecarts d'arrondi possibles. Le drill reussit seulement si les valeurs source sont preservees et si la perte de precision est detectee sans ecrasement de donnees.

## Transformations de donnees

Pour une transformation comme `float` vers `int`, ne jamais ecraser la valeur source directement. La migration doit suivre ce modele:

1. Ajouter un nouveau champ, par exemple `doseInt`.
2. Copier et valider les valeurs par lots dans le nouveau champ.
3. Garder le champ `float` original lisible pendant une periode de compatibilite.
4. Verifier les comptes, les bornes, les ecarts d'arrondi et les echantillons cliniques autorises.
5. Faire basculer le code applicatif vers le nouveau champ.
6. Ne supprimer l'ancien champ qu'apres sauvegarde validee, periode d'observation et migration distincte explicitement irreverssible.

En production, utiliser le lanceur dedie du droplet, jamais le script Compose local. Il exige une archive locale recente, son checksum, son test `gzip`, puis deux confirmations explicites.

Installer le script apres le deploiement du code qui contient le runner backend:

```bash
sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/run-production-mongo-migrations.sh \
  -o /opt/clinia/scripts/run-production-mongo-migrations.sh
sudo chmod 755 /opt/clinia/scripts/run-production-mongo-migrations.sh
```

Faire d'abord une lecture sans ecriture:

```bash
sudo /opt/clinia/scripts/run-production-mongo-migrations.sh --dry-run
```

Appliquer seulement apres avoir confirme l'archive affichee par le preflight:

```bash
sudo CONFIRM_PRODUCTION_MONGO_MIGRATIONS=RUN_CLINIA_MONGO_MIGRATIONS \
MIGRATION_BACKUP_CONFIRMED=YES \
MAX_BACKUP_AGE_HOURS=24 \
/opt/clinia/scripts/run-production-mongo-migrations.sh --apply
```

Le preflight bloque si aucun backend principal n'est en cours, si aucune archive n'est trouvee, si l'archive est trop ancienne, ou si sa verification echoue. Les nouvelles archives de production sont chiffrees et portent l'extension `.archive.gz.age`; aucune cle privee n'est necessaire pour leur verification de disponibilite et de checksum. Pour imposer une archive precise, fournir `MIGRATION_BACKUP_ARCHIVE=/var/backups/clinia/mongo/<archive>.archive.gz.age`.
