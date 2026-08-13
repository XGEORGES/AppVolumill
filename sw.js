const CACHE_NAME = 'cnc-assistant-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icono.png'
];

// Evento de instalación: cachear recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cacheando todos los recursos estáticos');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Forzar a activar inmediatamente
  );
});

// Evento de activación: limpiar cachés antiguas si el nombre de la caché cambia
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Limpiando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Tomar control de las pestañas activas de inmediato
  );
});

// Interceptar peticiones y responder desde la caché (Estrategia: Stale-While-Revalidate)
// Permite carga offline instantánea y actualizaciones automáticas en segundo plano si hay internet
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET de nuestro propio origen (HTTP/HTTPS)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Si la respuesta es válida, actualizar la caché en segundo plano
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // En caso de fallo de red (offline), ignoramos y dejamos que use la caché
        });

        // Devolver el recurso cacheado de inmediato (si existe), o esperar a la red
        return cachedResponse || fetchPromise;
      });
    })
  );
});
