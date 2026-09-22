# Empreinte Numérique

Petite application web pédagogique pour calculer l'empreinte carbone numérique des élèves : smartphone, tablette, ordinateur, objets connectés, streaming vidéo et IA générative, sur la durée de vie de leurs appareils.

Le résultat est situé sur une échelle (jauge faible / moyen / élevé, comparée à la moyenne numérique d'un habitant en France) et traduit en équivalences concrètes : distance en avion, distance en voiture, nombre de bouteilles plastique.

## Utilisation

Aucune installation n'est nécessaire : c'est une page web statique, sans dépendance externe.

- **En classe / localement** : ouvrir `index.html` dans un navigateur (double-clic ou `Fichier > Ouvrir`).
- **Hébergement en ligne** : héberger les 3 fichiers (`index.html`, `style.css`, `script.js`) sur n'importe quel hébergeur statique (GitHub Pages, Netlify, serveur de l'école…).
  - Pour GitHub Pages : Settings → Pages → Deploy from branch → choisir la branche et le dossier racine.

Aucune donnée saisie par les élèves n'est enregistrée ni transmise à un serveur : tout le calcul s'exécute dans le navigateur (aucune requête réseau, aucun cookie, aucun tracking). L'outil peut donc être utilisé librement avec des mineurs.

## Fonctionnement

1. **Questionnaire en 6 étapes** : smartphone, tablette, ordinateur, objets connectés, streaming, IA générative. Pour chaque appareil, l'élève indique la durée de vie estimée du support et son usage habituel.
2. **Calcul** : empreinte de fabrication de chaque appareil (amortie sur sa durée de vie déclarée) + empreinte d'usage annuelle (électricité, réseau, streaming, requêtes IA).
3. **Résultat** : empreinte totale annuelle en kg CO2e/an, jauge de positionnement, répartition par usage, et équivalences (km avion/voiture, bouteilles plastique).

## Méthodologie

Les coefficients utilisés sont des **ordres de grandeur pédagogiques**, construits à partir de données publiques :

- ADEME — Base Carbone et étude *« Évaluation environnementale des impacts du numérique en France »* (2022)
- Arcep
- GreenIT.fr
- The Shift Project

Ils ne remplacent pas un bilan carbone individuel précis, mais permettent de comparer des ordres de grandeur entre usages numériques et de les situer par rapport à des repères connus. Le détail des facteurs est visible directement dans l'application (section « Méthodologie & sources » sous les résultats) et dans `script.js`.

## Fichiers

- `index.html` — structure de la page (accueil, questionnaire, résultats)
- `style.css` — mise en forme (thèmes clair/sombre automatiques)
- `script.js` — logique de calcul, jauge et graphiques (aucune dépendance externe)
