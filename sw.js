const CACHE_NAME = 'cnc-assistant-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icono.png'
];

// Evento de instalación: cachear recursos estáticos pre-caching
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando nueva versión...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-cacheando todos los recursos');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Activar de inmediato
  );
});

// Evento de activación: limpiar versiones antiguas de caché
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activado.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Tomar control de clientes inmediatamente
  );
});

// Mensajes desde la aplicación principal
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Interceptar peticiones (Fetch)
// Estrategia: Cache-First con fallback a red y actualización de caché en segundo plano
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  // Comprobar si la petición pertenece a nuestra aplicación (mismo origen)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Intento de red en segundo plano para mantener la caché actualizada si hay internet
      const networkFetch = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        // Sin conexión: no pasa nada, ya usamos la caché si existía
        return null;
      });

      // Si existe en caché (offline o carga rápida), devolverlo inmediatamente
      if (cachedResponse) {
        return cachedResponse;
      }

      // Si no estaba en caché, esperar a la red
      return networkFetch.then((res) => {
        if (res) return res;
        // Si falló y es navegación (HTML), devolver index.html de la caché
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html') || caches.match('./');
        }
        return new Response('Sin conexión a internet y recurso no disponible en caché.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      });
    })
  );
});
