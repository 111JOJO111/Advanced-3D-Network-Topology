// Service Worker de l'application (PWA).
//
// Version minimale (S1) : le Service Worker s'installe et prend le contrôle de la page,
// ce qui permet déjà de vérifier l'enregistrement sur GitHub Pages (HTTPS). Il ne met
// encore rien en cache : les requêtes passent normalement par le réseau.

self.addEventListener('install', () => {
  self.skipWaiting(); // la nouvelle version s'active sans attendre la fermeture des onglets
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
