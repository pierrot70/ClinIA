# Mesure HTTP staging bornee

```bash
node scripts/measure-staging-http-capacity.mjs --run
```

Cible fixe : `http://127.0.0.1:4002/api/health/ready`. Aucun appel distant,
aucun compte ni dossier patient. Cette route lit l'etat de la connexion MongoDB
en memoire : elle n'execute pas de requete MongoDB. Ce test mesure uniquement
une route HTTP legere d'une instance backend, pas une capacite clinique.

Paliers de dix secondes : 25, 100, 250, 500, 1000, 1500, 2000 requetes/seconde,
avec pauses. Maximum 128 requetes en vol, delai maximal de deux secondes.
Surveillance Docker et memoire/CPU de l'hote ; arret sur erreur HTTP, latence
individuelle superieure a une seconde, p95 superieur a 500 ms, manque de memoire
(moins de 2 Gio disponibles), CPU global superieur a 85 %, perte du moniteur
ou incapacité a emettre plus de 95 % de la charge demandee. Ctrl+C arrete
la montee en charge. Ces garde-fous ne garantissent pas l'absence de perturbation
sur les autres services partageant l'hote.

Le debit `actualRps` inclut la fin des requetes et l'attente du dernier
echantillon de ressources ; il est donc inferieur au debit offert pendant
les dix secondes actives. `skipped` indique la charge non emise. Le generateur
et les conteneurs partagent les ressources de la machine : on ne peut pas
attribuer automatiquement toute limite au serveur.

Un rapport JSON minimise est cree sous `/tmp/clinia-http-capacity-*.json`.
Il ne s'agit pas d'un rapport officiel de validation SUPERADMIN. Un plafond
atteint sans degradation signifie **saturation non demontree**, et non une
capacite maximale mesuree. Aucun resultat ne doit etre converti directement
en nombre d'utilisateurs ou extrapole au droplet de production.
