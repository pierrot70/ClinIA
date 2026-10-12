# Rétention S3 des preuves du 19 septembre 2026

Le propriétaire a confirmé le 12 octobre 2026 que ce lot peut expirer le
19 mars 2027 : aucune exception de déploiement actif/précédent ou de gel
d'incident ne doit le protéger. Six mois sont calculés après le test,
en mois calendaires, et non comme 180 jours après l'envoi.

Le script cible uniquement `technical-evidence/2026-09-19/` du bucket
DigitalOcean Spaces `clinia-backups`, région `nyc3`. Il refuse un inventaire
différent des deux objets observés (archive chiffrée et empreinte), une
configuration illisible, un ID de règle conflictuel ou un bucket versionné.
Les règles existantes restent présentes. Il n'ajoute aucune expiration pour
`mongo/`, ni pour les futurs lots de preuves non examinés.

Depuis WSL Ubuntu :

```bash
scp -o BatchMode=yes \
  /home/plasante/DockerVS/ClinIA/scripts/configure-technical-evidence-retention.py \
  root@138.197.142.207:/tmp/
```

Sur le droplet, avec une clé Spaces administrative temporaire disposant de
`All (Buckets and Objects)` ; la clé d'envoi habituelle reste inchangée :

```bash
python3 /tmp/configure-technical-evidence-retention.py --apply
```

Les deux clés sont saisies de manière masquée dans le terminal. Ne jamais les
coller dans une commande, un message ou un fichier du dépôt. Le mode sans
`--apply` effectue seulement les lectures et prépare le plan.

Le script garde un dossier privé `~/clinia-s3-retention-*` (700, fichiers 600)
avec inventaire, configuration avant/proposée/après et rapport minimisé.
Les diagnostics AWS temporaires sont supprimés, sans afficher les secrets.
Il reconnaît explicitement le code S3 `NoSuchLifecycleConfiguration` avec
HTTP 404, y compris lorsque AWS CLI le masque derrière l'erreur `NoneType`.
Une erreur d'accès ne devient jamais une configuration vide.

La règle utilise `Expiration.Date = 2027-03-19T00:00:00Z`. La lecture en
retour doit confirmer l'ensemble des règles et les deux objets toujours
présents. Le succès se termine par `S3_RETENTION_VERIFIED`. Aucun appel
DeleteObject n'est effectué. L'expiration est programmée ; sa suppression
effective future n'est pas attestée par ce test. Si le fournisseur refuse
la date, arrêter et examiner l'erreur ; ne pas substituer 180 jours.

Si un gel d'incident survient avant l'échéance, désactiver cette règle et
vérifier la lecture en retour avant de considérer le lot protégé. Chaque
nouveau lot nécessite sa propre décision et échéance : cette règle ne
constitue pas une purge générale de toutes les preuves.

Validation locale :

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/configure-technical-evidence-retention.test.py
```

Références : [Lifecycle Spaces](https://docs.digitalocean.com/products/spaces/how-to/configure-lifecycle-rules/),
[API et permissions](https://docs.digitalocean.com/reference/api/spaces/),
[compatibilité S3](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/).

Agent-Contribution: backend | Application ciblée et vérification de la rétention calendaire des preuves.
Agent-Review: security | Exceptions confirmées par le propriétaire ; clés masquées, sauvegardes MongoDB exclues de la règle ajoutée ; application et lecture retour confirmées par la sortie du droplet fournie par l'utilisateur.
Validation: exécution distante --apply | LIFECYCLE_APPLIED puis S3_RETENTION_VERIFIED ; deux objets présents, règles existantes préservées, échéance 2027-03-19.
