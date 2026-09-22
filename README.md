# Empreinte Numérique

Petite application web pédagogique pour calculer l'empreinte carbone numérique des élèves : smartphone, tablette, ordinateur, objets connectés, console de jeux et TV connectée, streaming vidéo, visioconférence et IA générative, sur la durée de vie de leurs appareils.

Le résultat est situé sur une échelle (jauge faible / moyen / élevé, comparée à un profil de référence — voir « Méthodologie ») et traduit en équivalences concrètes : distance en avion, distance en voiture, nombre de bouteilles plastique, surface de forêt rasée.

## Deux modes d'utilisation

### 1. Calculateur seul (aucune installation)

C'est une page web statique, sans dépendance externe.

- **En classe / localement** : ouvrir `public/index.html` dans un navigateur (double-clic ou `Fichier > Ouvrir`).
- **Hébergement en ligne** : héberger le contenu de `public/` sur n'importe quel hébergeur statique (GitHub Pages, Netlify, serveur de l'école…).
  - Pour GitHub Pages : Settings → Pages → Deploy from branch → choisir la branche et le dossier `/public`.

Tout le calcul s'exécute dans le navigateur. En fin de parcours, l'application essaie automatiquement de transmettre le résultat (voir ci-dessous) ; dans ce mode statique, aucun serveur ne peut le recevoir, donc rien ne part réellement — un petit message discret l'indique, et le reste de l'application fonctionne normalement.

### 2. Calculateur + statistiques de classe (avec le petit serveur Node)

Pour agréger les résultats de plusieurs élèves (empreinte minimale/maximale, moyenne de la classe, poste qui pèse le plus en moyenne), l'application inclut un petit serveur Node.js avec un stockage local en JSON (un seul fichier, aucune donnée identifiante stockée, aucune dépendance native — voir « Déploiement derrière une passerelle » pour le pourquoi).

```bash
npm install
npm start
```

Le serveur démarre sur `http://localhost:3000` (modifiable via la variable d'environnement `PORT`) et sert l'application entière :

- `http://localhost:3000/` — le calculateur, pour les élèves
- `http://localhost:3000/dashboard.html` — le tableau de bord, pour l'enseignant·e

**Usage en classe** : lance le serveur sur ton ordinateur avant le cours, puis donne aux élèves l'adresse IP locale de ta machine sur le réseau de la classe (ex. `http://192.168.1.42:3000`) pour qu'ils y accèdent depuis leur propre appareil. Tu peux aussi déployer tout le dépôt sur n'importe quel hébergeur Node gratuit (Render, Railway…) si tu veux une adresse stable, ou le monter derrière une passerelle mutualisée (voir « Déploiement derrière une passerelle » ci-dessous).

À la fin du calculateur, **le résultat de chaque élève est transmis automatiquement** — ce n'est pas une action optionnelle : dès que le calcul est terminé, le total et la répartition par usage (avec la classe et le pseudo s'ils sont renseignés, mais jamais les réponses détaillées au questionnaire ni un nom) sont envoyés au serveur, sans que l'élève ait à cliquer sur quoi que ce soit. Un petit message discret confirme la transmission (ou explique qu'elle a échoué si le serveur est inaccessible). Le tableau de bord affiche ensuite en temps réel le nombre de réponses, l'empreinte minimale, maximale et moyenne du groupe, ainsi que le poste (smartphone, streaming, IA…) qui pèse le plus en moyenne. Un bouton permet de réinitialiser les données.

#### Plusieurs classes en parallèle

Pour distinguer les classes, ajoute des paramètres à l'URL que tu donnes aux élèves :

```
http://localhost:3000/?classe=5B&eleve=12
```

- `classe` — nom ou code du groupe classe (ex. `5B`, `3eA`…)
- `eleve` (ou `id`) — un identifiant au choix (numéro de rang, pseudo…), utilisé uniquement pour qu'une nouvelle réponse du même élève **remplace** la précédente au lieu de la dupliquer. Ce n'est pas un nom et il n'est affiché nulle part dans les statistiques.

**Sans ces paramètres dans l'URL**, l'élève arrive sur un petit formulaire qui l'invite à indiquer le code de sa classe et à choisir un pseudo (pas son vrai nom) avant de commencer — ces deux champs sont obligatoires pour continuer. L'information est ensuite mémorisée pour la session du navigateur (elle n'est pas redemandée si l'élève recharge la page) et un badge en haut de page confirme le contexte dans lequel il répond.

Le tableau de bord (`dashboard.html`) propose un sélecteur pour :

- afficher une **classe précise** (`dashboard.html?classe=5B`, ou via le menu déroulant) ;
- ou afficher les **statistiques combinées de toutes les classes** ayant répondu (option par défaut « Toutes les classes »).

Une classe apparue une fois dans ce sélecteur n'en disparaît **jamais** d'elle-même (même si tous ses élèves sont exclus, voir ci-dessous, ou en cas de coupure réseau passagère) — seul un reset explicite de cette classe (bouton de réinitialisation) la supprime. Le bouton de réinitialisation n'efface que la classe actuellement affichée (ou tout, si « Toutes les classes » est sélectionné) — la confirmation précise toujours la portée avant suppression.

#### Exclure un·e élève des statistiques

Quand une classe précise est affichée dans le tableau de bord, une carte **« Gérer les élèves de cette classe »** liste chaque réponse par pseudo avec une case à cocher. Décocher un·e élève exclut sa réponse du calcul (compte, min/max/moyenne, répartition) sans la supprimer — utile pour une réponse test ou manifestement erronée. Elle peut être recochée à tout moment. Cette exclusion s'applique aussi à la vue combinée « Toutes les classes ».

#### Déploiement derrière une passerelle (hébergement mutualisé)

Sur un hébergement qui n'autorise qu'une seule application Node.js (ex. Infomaniak), le dépôt entier est conçu pour être déposé tel quel dans le dossier `apps/<nom>` d'une passerelle comme [node-gateway](https://github.com/Gatomlo/node-gateway), qui monte alors l'app sur `/<nom>` :

- `server.js` **exporte l'app Express** (`module.exports = app`) plutôt que d'appeler `app.listen()` inconditionnellement — lancé directement (`npm start`), il continue de démarrer son propre serveur normalement (le `app.listen()` est gardé par `if (require.main === module)`), mais une passerelle peut aussi faire `app.use('/mon-outil', require('./server.js'))` sans rien modifier.
- Le code client (`public/script.js`, `public/dashboard.js`) n'utilise que des **chemins relatifs** (`api/submit`, jamais `/api/submit`) : Express retire automatiquement le préfixe de montage côté serveur, et les chemins relatifs se résolvent correctement côté navigateur, que l'app soit servie à la racine ou sous un sous-dossier.
- Le dossier `public/` est le seul servi en statique (`express.static`) — le code serveur, `package.json` et le fichier de données (`empreinte.json`, créé à la racine du dépôt) restent hors de portée du navigateur.
- **Aucune dépendance native** : le stockage des réponses (`db.js`) est un simple fichier JSON lu/écrit avec le module `fs` intégré à Node, pas une base SQLite. Un hébergement mutualisé qui n'a pas de compilateur (ou pas de binaire précompilé pour sa configuration exacte) échouerait à installer un module natif comme `better-sqlite3` — l'app n'en dépend donc plus du tout.

Aucune configuration supplémentaire n'est nécessaire : `npm install` à la racine installe tout (uniquement `express`), et `server.js` (ou le champ `main` de `package.json`, qui pointe déjà dessus) est le point d'entrée que la passerelle trouve par convention.

## Fonctionnement

1. **Questionnaire en 8 étapes** : smartphone, tablette, ordinateur, objets connectés, console de jeux & TV connectée, streaming, visioconférence, IA générative. Pour chaque appareil, l'élève indique la durée de vie estimée du support et son usage habituel.
2. **Calcul** : empreinte de fabrication de chaque appareil (amortie sur sa durée de vie déclarée) + empreinte d'usage annuelle (électricité, réseau, streaming, visio, requêtes IA).
3. **Résultat** : empreinte totale annuelle en kg CO2e/an, jauge de positionnement (repère : profil de référence calculé sur les mêmes catégories), répartition par usage — avec, sur chaque barre, un repère indiquant où se situe ce même profil de référence pour ce poste précis —, et équivalences (km avion, km voiture, bouteilles plastique, m² de forêt rasée).
4. **Transmission automatique** du résultat vers les statistiques de la classe, si le serveur est lancé — sans action de l'élève.

## Méthodologie

Les coefficients utilisés sont des **ordres de grandeur pédagogiques**, construits à partir de données publiques :

- ADEME — Base Carbone et étude *« Évaluation environnementale des impacts du numérique en France »* (2022)
- Arcep
- GreenIT.fr
- The Shift Project
- Institut belge du Numérique Responsable (fabrication d'un ordinateur portable, intensité carbone de l'électricité en Belgique)
- GIEC / FAO — ordres de grandeur d'émissions liées à la déforestation

Ils ne remplacent pas un bilan carbone individuel précis, mais permettent de comparer des ordres de grandeur entre usages numériques et de les situer par rapport à des repères connus. Le détail des facteurs est visible directement dans l'application (section « Méthodologie & sources » sous les résultats) et dans `script.js`.

**Profil de référence** (~229 kg CO2e/an, marqué sur la jauge) : ce repère n'est **pas** une statistique nationale externe. Une première version comparait à un pourcentage du numérique dans les émissions belges (~2&nbsp;%, Digital Wallonia / Bruxelles Environnement) — mais ce périmètre couvre bien plus que ce que le quiz mesure (usages professionnels, stockage cloud, infrastructures…), ce qui rendait la comparaison trompeuse. Le repère est donc désormais **calculé avec le même modèle et les mêmes huit catégories** que le résultat de l'élève (voir `calculate()` dans `script.js`), à partir d'un usage moyen plausible — le détail du calcul est documenté en commentaire dans `shared.js`, à côté de `REFERENCE_MOYENNE_BE`. C'est un point de comparaison cohérent avec ce que l'app mesure, pas une mesure officielle de l'empreinte numérique moyenne en Belgique. Si le quiz évolue (nouvelle catégorie, facteur modifié), ce repère doit être recalculé en conséquence.

## Fichiers

- `public/index.html` — structure du calculateur (accueil, questionnaire, résultats)
- `public/dashboard.html` — tableau de bord des statistiques de classe (enseignant·e)
- `public/style.css` — mise en forme (thèmes clair/sombre automatiques)
- `public/shared.js` — constantes et helpers communs (facteurs de référence, jauge SVG, graphique de répartition, formatage)
- `public/script.js` — logique du calculateur (calcul, jauge, graphiques, transmission automatique du résultat)
- `public/dashboard.js` — logique du tableau de bord (récupération et affichage des statistiques)
- `server.js` — petit serveur Node.js + Express (statique + API des statistiques de classe), exporte l'app Express pour être montable derrière une passerelle
- `db.js` — stockage JSON local (`empreinte.json`, créé à la racine, hors de `public/`), sans dépendance native
- `package.json` — dépendances (`express` uniquement), `npm start` lance `server.js`
