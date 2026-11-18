// Mode VR (WebXR) — point d'entrée appelé par main.js.
//
// S1 : vérification précoce. On teste seulement si le navigateur sait ouvrir une session
// « immersive-vr » (vrai casque ou extension Immersive Web Emulator) et on l'indique
// discrètement dans la zone #xr-slot. Le bouton d'entrée en VR arrive en S4.

import { onLangChange, registerStrings, t } from '../ui/i18n.js';
import { isVRSupported } from './support.js';

registerStrings({
  fr: {
    'xr.ok': 'WebXR : disponible',
    'xr.ok.tip': 'Ce navigateur peut ouvrir une session VR (casque ou Immersive Web Emulator).',
    'xr.no': 'WebXR : indisponible',
    'xr.no.tip': 'Aucun casque ni émulateur détecté : l\'application fonctionne en mode classique.',
  },
  en: {
    'xr.ok': 'WebXR: available',
    'xr.ok.tip': 'This browser can open a VR session (headset or Immersive Web Emulator).',
    'xr.no': 'WebXR: unavailable',
    'xr.no.tip': 'No headset or emulator detected: the app runs in classic mode.',
  },
});

export async function initXR(app) {
  const slot = document.getElementById('xr-slot');
  app.xr = { supported: false, session: null };
  // WebXR passe par le moteur WebGL 2 (voir src/render/scene.js). Si WebGPU a été imposé
  // par ?backend=webgpu, la VR est annoncée indisponible plutôt que d'échouer à l'entrée.
  app.xr.supported = (await isVRSupported()) && app.render.backend !== 'webgpu';

  const badge = document.createElement('span');
  badge.className = 'xr-badge';
  const refresh = () => {
    badge.textContent = t(app.xr.supported ? 'xr.ok' : 'xr.no');
    badge.title = t(app.xr.supported ? 'xr.ok.tip' : 'xr.no.tip');
    badge.dataset.supported = String(app.xr.supported);
  };
  onLangChange(refresh);
  refresh();
  slot.replaceChildren(badge);
}
