# Empreinte Numérique

Petite application web pédagogique pour calculer l'empreinte carbone numérique des élèves : smartphone, tablette, ordinateur, objets connectés, streaming vidéo et IA générative, sur la durée de vie de leurs appareils.

Le résultat est situé sur une échelle (jauge faible / moyen / élevé, comparée à la moyenne numérique d'un habitant en France) et traduit en équivalences concrètes : distance en avion, distance en voiture, nombre de bouteilles plastique.

## Deux modes d'utilisation

### 1. Calculateur seul (aucune installation)

C'est une page web statique, sans dépendance externe.

- **En classe / localement** : ouvrir `index.html` dans un navigateur (double-clic ou `Fichier > Ouvrir`).
- **Hébergement en ligne** : héberger `index.html`, `style.css`, `shared.js` et `script.js` sur n'importe quel hébergeur statique (GitHub Pages, Netlify, serveur de l'école…).
  - Pour GitHub Pages : Settings → Pages → Deploy from branch → choisir la branche et le dossier racine.

Dans ce mode, rien n'est jamais envoyé nulle part : tout le calcul s'exécute dans le navigateur. Le bouton « Partager mon résultat » (voir ci-dessous) affiche un message d'erreur puisqu'aucun serveur n'est disponible pour le recevoir — le reste de l'application fonctionne normalement.

### 2. Calculateur + statistiques de classe (avec le petit serveur Node)

Pour agréger les résultats de plusieurs élèves (empreinte minimale/maximale, moyenne de la classe, poste qui pèse le plus en moyenne), l'application inclut un petit serveur Node.js avec une base SQLite locale (un seul fichier, aucune donnée identifiante stockée).

```bash
cd server
npm install
npm start
```

Le serveur démarre sur `http://localhost:3000` (modifiable via la variable d'environnement `PORT`) et sert l'application entière :

- `http://localhost:3000/` — le calculateur, pour les élèves
- `http://localhost:3000/dashboard.html` — le tableau de bord, pour l'enseignant·e

**Usage en classe** : lance le serveur sur ton ordinateur avant le cours, puis donne aux élèves l'adresse IP locale de ta machine sur le réseau de la classe (ex. `http://192.168.1.42:3000`) pour qu'ils y accèdent depuis leur propre appareil. Tu peux aussi déployer le dossier `server/` sur n'importe quel hébergeur Node gratuit (Render, Railway…) si tu veux une adresse stable.

À la fin du calculateur, chaque élève peut cliquer sur **« Partager mon résultat (anonyme) »** : seuls le total et la répartition par usage sont envoyés — aucun nom. Le tableau de bord affiche ensuite en temps réel le nombre de réponses, l'empreinte minimale, maximale et moyenne du groupe, ainsi que le poste (smartphone, streaming, IA…) qui pèse le plus en moyenne. Un bouton permet de réinitialiser les données.

#### Plusieurs classes en parallèle

Pour distinguer les classes, ajoute des paramètres à l'URL que tu donnes aux élèves :

```
http://localhost:3000/?classe=5B&eleve=12
```

- `classe` — nom ou code du groupe classe (ex. `5B`, `3eA`…)
- `eleve` (ou `id`) — un identifiant au choix (numéro de rang, pseudo…), utilisé uniquement pour qu'une nouvelle réponse du même élève **remplace** la précédente au lieu de la dupliquer. Ce n'est pas un nom et il n'est affiché nulle part dans les statistiques.

Ces deux paramètres sont optionnels : sans eux, l'application fonctionne comme avant (partage anonyme, sans classe). Chaque élève voit un petit badge en haut de page confirmant le contexte dans lequel il répond.

Le tableau de bord (`dashboard.html`) propose un sélecteur pour :

- afficher une **classe précise** (`dashboard.html?classe=5B`, ou via le menu déroulant) ;
- ou afficher les **statistiques combinées de toutes les classes** ayant répondu (option par défaut « Toutes les classes »).

Le bouton de réinitialisation n'efface que la classe actuellement affichée (ou tout, si « Toutes les classes » est sélectionné) — la confirmation précise toujours la portée avant suppression.

## Fonctionnement

1. **Questionnaire en 6 étapes** : smartphone, tablette, ordinateur, objets connectés, streaming, IA générative. Pour chaque appareil, l'élève indique la durée de vie estimée du support et son usage habituel.
2. **Calcul** : empreinte de fabrication de chaque appareil (amortie sur sa durée de vie déclarée) + empreinte d'usage annuelle (électricité, réseau, streaming, requêtes IA).
3. **Résultat** : empreinte totale annuelle en kg CO2e/an, jauge de positionnement, répartition par usage, et équivalences (km avion/voiture, bouteilles plastique).
4. **Partage optionnel et anonyme** vers les statistiques de la classe, si le serveur est lancé.

## Méthodologie

Les coefficients utilisés sont des **ordres de grandeur pédagogiques**, construits à partir de données publiques :

- ADEME — Base Carbone et étude *« Évaluation environnementale des impacts du numérique en France »* (2022)
- Arcep
- GreenIT.fr
- The Shift Project

Ils ne remplacent pas un bilan carbone individuel précis, mais permettent de comparer des ordres de grandeur entre usages numériques et de les situer par rapport à des repères connus. Le détail des facteurs est visible directement dans l'application (section « Méthodologie & sources » sous les résultats) et dans `script.js`.

## Fichiers

- `index.html` — structure du calculateur (accueil, questionnaire, résultats)
- `dashboard.html` — tableau de bord des statistiques de classe (enseignant·e)
- `style.css` — mise en forme (thèmes clair/sombre automatiques)
- `shared.js` — constantes et helpers communs (facteurs de référence, jauge SVG, formatage)
- `script.js` — logique du calculateur (calcul, jauge, graphiques, partage anonyme)
- `dashboard.js` — logique du tableau de bord (récupération et affichage des statistiques)
- `server/` — petit serveur Node.js + Express + SQLite, requis uniquement pour les statistiques de classe
