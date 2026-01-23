# RSVP Speed Reader - Extension Chrome

Extension Chrome permettant de lire rapidement du texte sur n'importe quelle page web en utilisant la méthode RSVP (Rapid Serial Visual Presentation).

## Fonctionnalités

- **Extraction automatique d'articles** avec Readability.js (même technologie que Firefox Reader Mode)
- **Lecture RSVP** avec alignement sur le point de reconnaissance optimal (ORP)
- **Traitement intelligent du texte** :
  - Ralentissement sur les noms propres et les nombres (années, dates)
  - Gestion de la typographie française (« », !, ?, :, ;)
  - Filtrage des légendes de photos et crédits
- **Accélération progressive** au démarrage pour un confort optimal
- **Contrôles clavier** complets

## Installation

1. Clonez ce repository
2. Ouvrez Chrome et allez à `chrome://extensions/`
3. Activez le "Mode développeur"
4. Cliquez sur "Charger l'extension non empaquetée"
5. Sélectionnez le dossier de l'extension

## Utilisation

1. Naviguez vers un article (site d'actualités, Wikipedia, blog)
2. Cliquez sur l'icône de l'extension
3. L'article est automatiquement extrait et la lecture commence

**Ou** sélectionnez du texte manuellement, puis cliquez sur l'extension pour lire uniquement cette sélection.

## Raccourcis clavier

| Touche | Action |
|--------|--------|
| `Espace` | Pause / Reprendre |
| `←` | Reculer de 5 mots |
| `→` | Avancer de 5 mots |
| `↑` | Augmenter la vitesse (+25 MPM) |
| `↓` | Diminuer la vitesse (-25 MPM) |
| `Échap` | Arrêter |

## Paramètres

- **Vitesse de lecture** : 100-1000 mots par minute (défaut : 550)
- **Compte à rebours** : 0-3 secondes avant le démarrage
- **Pause sur ponctuation** : Délai supplémentaire après les virgules et points
- **Temps supplémentaire pour mots longs** : Affiche les mots longs plus longtemps

## Structure du projet

```
Fast_reader/
├── manifest.json          # Configuration de l'extension
├── background.js          # Service worker
├── content/
│   ├── content.js         # Script principal
│   ├── content.css        # Styles pour l'overlay
│   └── rsvp-engine.js     # Moteur RSVP
├── popup/
│   ├── popup.html         # Interface du popup
│   ├── popup.js           # Logique du popup
│   └── popup.css          # Styles du popup
├── icons/                 # Icônes de l'extension
└── lib/
    └── Readability.js     # Mozilla Readability
```

## Crédits

- [Readability.js](https://github.com/mozilla/readability) par Mozilla (Licence Apache 2.0)

## Licence

MIT
