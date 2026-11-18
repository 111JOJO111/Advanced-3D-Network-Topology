# 3D Network Topology

Application pédagogique : comprendre les protocoles réseau en regardant leurs messages
circuler dans une topologie 3D. Projet WebXR & Spatial Computing — SUP'COM, département SIA.

**Site (GitHub Pages, HTTPS)** : `https://<compte>.github.io/<depot>/` *(à compléter après la création du dépôt)*

## Lancer en local

Il faut [Node.js](https://nodejs.org) 20 ou plus récent. Aucune dépendance à installer.

```bash
npm start        # puis ouvrir http://localhost:8080
npm test         # tests automatiques
```

## Organisation du dépôt

| Dossier ou fichier | Rôle | Propriétaire |
| --- | --- | --- |
| `index.html`, `styles.css`, `src/ui/` | page et interface | Ramy |
| `src/render/`, `vendor/three/`, `assets/models/` | rendu 3D | Aziz |
| `simulation.js`, `src/sim/`, `tests/` | moteur de simulation et contrats | Khalil |
| `main.js`, `manifest.json`, `sw.js`, `.github/`, `tools/`, `src/xr/` | démarrage, PWA, CI, VR | Ayoub |
| `scenarios/` | scénarios JSON | selon le protocole |
| `docs/` | documentation | selon le sujet |

Le détail est dans `.github/CODEOWNERS`. Règles d'équipe :

- chacun ne modifie que ses fichiers ; un bug chez un autre = une issue assignée à son propriétaire ;
- les contrats communs (`src/sim/events.js`, le format des scénarios, `index.html`) ne changent que par une pull request approuvée par les quatre ;
- push quotidien sur sa branche `feature/<membre>-<sujet>`, fusion dans `main` le mercredi et le dimanche après `git pull --rebase origin main`.

## Équipe

Mohamed Aziz Saoudi · Ayoub Ben Sabbeh · Khalil Krifa · Rami Driouech — supervisés par Dr. Eng. Mohamed Becha Kaaniche.
