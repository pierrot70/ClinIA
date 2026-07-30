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

Apres chaque `--apply`, le runner execute automatiquement les garde-fous de schema sur les metadonnees Mongo reelles. Par exemple, une fois la migration de portee des identifiants patients appliquee, il confirme les index uniques par proprietaire et refuse un index unique global obsolete sur le telephone ou le numero d'assurance. Le resultat attendu est:

```text
SCHEMA_GUARD_OK guard=patient_owner_scoped_indexes
```

Un echec n'affiche que le nom et la structure de l'index en cause, jamais de dossier patient. Corriger l'index par une migration dediee avant tout deploiement applicatif.

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

Le preflight bloque si aucun backend principal n'est en cours, si aucune archive n'est trouvee, si l'archive est trop ancienne, ou si sa verification echoue. Pour imposer une archive precise, fournir `MIGRATION_BACKUP_ARCHIVE=/var/backups/clinia/mongo/<archive>.archive.gz`.
