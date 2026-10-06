# Rebuild staging depuis WSL ou DockerVS

Dans le checkout à utiliser :

```bash
./rebuild-local.sh staging --check
./rebuild-local.sh staging
```

`--check` vérifie les outils, Docker, Compose et, dans un conteneur, les
montages et le réseau avec un petit conteneur temporaire automatiquement supprimé.
L'image `node:24-bookworm` peut être téléchargée. Il ne lance ni CI ni rebuild.
Le rebuild normal conserve la CI complète, y compris l'audit des dépendances.
Un audit en échec empêche toujours l'arrêt de la pile staging.

## Préparer DockerVS une seule fois

Dans `/home/plasante/DockerVS/.devcontainer/devcontainer.json`, conserver les
réglages existants et utiliser les valeurs suivantes :

```json
{
  "workspaceMount": "source=${localWorkspaceFolder},target=${localWorkspaceFolder},type=bind",
  "workspaceFolder": "${localWorkspaceFolder}",
  "runArgs": ["--network=host"],
  "features": {
    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {}
  }
}
```

Ajouter `lsof` et `procps` aux paquets du Dockerfile. Node 24, npm, curl et Git
sont également nécessaires. Le socket donne accès au moteur Docker Desktop et
aux conteneurs existants ; ce n'est pas un moteur isolé.

Le montage au même chemin est nécessaire : les bind mounts Compose sont résolus
par le moteur hôte. Après reconstruction, le checkout sera donc
`/home/plasante/DockerVS/ClinIA` **dans le conteneur aussi**.

Activer **Enable host networking** dans Docker Desktop si nécessaire. Les tests
Mongo publient des ports aléatoires sur `127.0.0.1` ; le mode réseau hôte permet
de les atteindre sans exposer Mongo sur toutes les interfaces.

Dans VS Code : **Dev Containers: Rebuild Container**. Préserver avant cela les
extensions et réglages installés manuellement que l'on souhaite retrouver.
Le checkout doit disposer de son propre `.env` local valide, jamais commité.

## Pile partagée

Les deux clones Git sont indépendants, mais le projet Compose par défaut reste
`clinia_mongo_rs` sur le même moteur : les deux commandes reconstruisent la même
pile et réutilisent ses volumes. Ne pas lancer deux rebuilds simultanément.
`WIPE_VOLUMES=1` reste une demande explicite de suppression des données locales.

Avant de changer d'environnement, arrêter le Vite lancé dans l'autre terminal
(port 5174). Un processus WSL n'est pas visible depuis le DevContainer.
`--strictPort` évite de démarrer silencieusement Vite sur un autre port.

Références : [Docker depuis un DevContainer](https://code.visualstudio.com/remote/advancedcontainers/use-docker-kubernetes),
[réseau hôte Docker Desktop](https://docs.docker.com/engine/network/drivers/host/).
