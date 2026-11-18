// Service Worker de l'application (PWA).
//
// Rôle : garder en cache tous les fichiers de l'application pour qu'elle se recharge
// sans connexion après une première visite.
//
// La liste des fichiers n'est pas écrite à la main : tools/generate-precache.mjs la
// produit dans precache-manifest.js (lancé par « npm start » et par la CI avant chaque
// déploiement). Sa `version` change dès qu'un fichier change : un nouveau cache est
// alors créé et l'ancien supprimé.

let precache = { version: 'dev', files: [] };
try {
  importScripts('precache-manifest.js'); // définit self.__PRECACHE
  if (self.__PRECACHE) precache = self.__PRECACHE;
} catch (error) {
  // Liste absente (serveur local lancé sans « npm start ») : le cache se remplit
  // quand même au fil des requêtes, voir fetch ci-dessous.
  console.warn('[sw] precache-manifest.js introuvable : pas de pré-cache.');
}

const CACHE_PREFIX = '3dnt-';
const CACHE = CACHE_PREFIX + precache.version;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' : on contourne le cache HTTP du navigateur pour stocker la vraie
    // dernière version de chaque fichier.
    await cache.addAll(precache.files.map((file) => new Request(file, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

/** Réseau d'abord ; en cas d'échec (hors ligne), la copie en cache. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // seules nos propres ressources sont gérées
  event.respondWith(networkFirst(request));
});
