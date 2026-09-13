# Dix RECEPTION en connexion/deconnexion

Depuis la racine du projet, avec le staging Docker actif :

```bash
bash scripts/run-staging-reception-auth-load.sh
```

Pour une charge soutenue pendant cinq minutes :

```bash
bash scripts/run-staging-reception-auth-load.sh --five-minutes
```

Ce mode injecte un quota de **1 000 000 demandes / 15 minutes uniquement dans
le routeur du processus de test**. Le backend staging existant et Coolify
conservent leur quota de 100 : aucun changement d'environnement global ni
rebuild n'est necessaire. Bcrypt (cout 12), les deux secondes d'attente et les
autres protections restent actifs. La duree mesuree des boucles est de 300
secondes, hors preparation et nettoyage. Le mode standard reste de 120 secondes.
La verification echoue si le mode cinq minutes recoit des 429 ou n'effectue
pas plus de 100 connexions reussies. Les descriptions du quota de 100 et de
l'attente apres 429 ci-dessous concernent le mode standard seulement.

Le script cree dix comptes RECEPTION synthetiques avec des mots de passe
aleatoires, puis lance dix boucles concurrentes pendant 120 secondes.
Chaque boucle attend la connexion reussie avant de demander la deconnexion.
Les requetes en cours peuvent prendre jusqu'a dix secondes supplementaires
avant le nettoyage. Une progression agregee est affichee toutes les dix secondes.

L'affichage est en texte lisible, sans lignes JSON : temps ecoule, pourcentage,
connexions, deconnexions, sessions encore a fermer, refus 429 et erreurs.
Un ecart temporaire entre connexions et deconnexions est normal lorsque des
deconnexions sont encore en cours. Le bilan final distingue le resultat global,
l'activite, les temps de reponse p95, la correspondance des journaux et le
nettoyage. `N/D` indique une verification qui n'a pas pu etre mesuree ; ce n'est
pas un resultat de zero erreur. Les refus 429 sont inclus dans le p95 des
demandes de connexion lorsqu'ils sont presents.

## Isolation

Le test utilise un processus Node distinct dans le conteneur backend staging,
un serveur HTTP d'authentification sur un port local ephemere, les vraies routes,
middlewares, delais, bcrypt, JWT et le cluster MongoDB de staging. Il ne cible
pas le serveur existant du port 4002, ni Coolify. Le generateur et le serveur
de test partagent ce processus : ce n'est pas une mesure de capacite maximale.

Tous les modeles MongoDB, y compris ceux avec un nom de collection explicite,
sont rediriges vers des collections dont le prefixe unique est affiche au
demarrage (`clinia_auth_load_<identifiant>`). Les schemas et routes applicatifs
ne sont pas modifies. Les comptes ne sont donc pas visibles dans le UI staging.
Les cliniques et dossiers patients existants ne sont pas utilises.

## Limitation attendue

Les dix utilisateurs partagent une IP. Le quota de connexion reste celui de
l'application (actuellement 100 demandes/IP par fenetre de quinze minutes).
Les 429 sont comptees separement ; chaque boucle respecte `Retry-After` au lieu
de marteler le serveur. Il est donc normal que la charge retombe avant la fin
des deux minutes. Un passage de fenetre peut permettre de nouvelles connexions.
Une erreur inattendue arrete les nouvelles tentatives, puis nettoie le test.

## Nettoyage

Le `finally` arrete le serveur et supprime uniquement les collections exactes
du test : comptes, sessions, journaux, compteurs et collections auxiliaires.
Le script refuse d'adopter une collection preexistante. Il verifie leur absence
et affiche `CLEANUP_OK`. Il ne supprime jamais la base staging ni un compteur
partage avec les utilisateurs existants.

Un arret brutal du conteneur, un SIGKILL ou une panne MongoDB peut empecher le
nettoyage. Conserver alors l'identifiant affiche et faire verifier les seules
collections correspondantes ; ne pas supprimer la base complete. L'interruption
du client Docker peut ne pas transmettre un signal au processus interne ; le
test reste borne a deux minutes plus les requetes en cours et le nettoyage.

Le bilan affiche les succes, les refus 429, les erreurs, la latence p95, les
nombres de journaux LOGIN/LOGOUT et les sessions refresh encore actives avant
nettoyage. Une verification echouee donne un code de sortie non nul.
Les 429 attendues ne sont pas un echec. Aucun mot de passe ou token n'est affiche.

Tests locaux sans acces MongoDB :

```bash
npm --prefix backend test -- --run services/__tests__/receptionAuthLoad.test.js
```
