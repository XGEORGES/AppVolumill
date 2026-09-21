const CACHE_NAME = 'cnc-assistant-v5';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icono.png'
];

// 1. INSTALACIÓN RESILIENTE:
// Ningún fallo en un recurso secundario abortará la instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando nueva versión:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Guardar cada recurso individualmente con no-cache para forzar descarga limpia
      const cachePromises = CORE_ASSETS.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response && (response.status === 200 || response.type === 'opaque')) {
            await cache.put(url, response);
            console.log('[Service Worker] Pre-cacheado con éxito:', url);
          }
        } catch (err) {
          console.warn('[Service Worker] Recurso no descargado en install (se usará respaldo previo):', url);
        }
      });
      await Promise.allSettled(cachePromises);
    }).then(() => {
      // Activar inmediatamente esta versión para que esté disponible de inmediato
      return self.skipWaiting();
    })
  );
});

// 2. ACTIVACIÓN LIMPIA:
// Elimina versiones antiguas de caché y toma control de clientes de inmediato
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activado y tomando control:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Purgando caché obsoleta:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. COMUNICACIÓN Y PREVENCIÓN DE BLOQUEOS (ANTI-BUG):
// Permite verificar salud del worker ('ping') o forzar activación ('skipWaiting')
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data.action === 'ping' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ status: 'active', version: CACHE_NAME });
  }
});

// Función auxiliar robusta para recuperar index.html de la caché bajo cualquier ruta o formato
async function getCachedIndex() {
  const cache = await caches.open(CACHE_NAME);
  const candidates = ['./index.html', 'index.html', './', ''];
  for (const key of candidates) {
    const match = await cache.match(key, { ignoreSearch: true });
    if (match) return match;
  }
  // Búsqueda exhaustiva por si la URL registrada incluye la ruta completa del dominio
  const allRequests = await cache.keys();
  for (const req of allRequests) {
    if (req.url.endsWith('index.html') || req.url.endsWith('/')) {
      const match = await cache.match(req);
      if (match) return match;
    }
  }
  return null;
}

// 4. INTERCEPTACIÓN DE PETICIONES (FETCH):
// Prioridad:
// A) Navegación (HTML de inicio): Primero intenta ver si hay actualización con timeout corto (1.5s).
//    Si hay internet y responde -> actualiza la caché y muestra lo nuevo.
//    Si NO hay internet (PC recién encendida sin conexión) o tarda más de 1.5s -> muestra de inmediato la última versión guardada.
// B) Recursos estáticos (CSS, JS, iconos): Caché inmediata con actualización en segundo plano (Stale-While-Revalidate).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // CASO A: Petición de navegación (cuando el usuario abre la app o refresca la página)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Intentar verificar la red con límite de 1500 ms para no congelar la pantalla si el internet está lento o caído
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('NetworkTimeout')), 1500)
          );

          const networkFetch = fetch(event.request, { cache: 'no-cache' }).then(async (response) => {
            if (response && response.status === 200) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(event.request, response.clone());
              await cache.put('./index.html', response.clone());
            }
            return response;
          });

          // Si la red responde a tiempo, entregar la versión actualizada
          return await Promise.race([networkFetch, timeoutPromise]);
        } catch (err) {
          // Si no hay red, si se prendió la PC offline o la conexión falló:
          // RECUPERAR DE INMEDIATO LA ÚLTIMA VERSIÓN GUARDADA EN DISCO
          const cachedIndex = await getCachedIndex();
          if (cachedIndex) {
            return cachedIndex;
          }

          return new Response(
            '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin Conexión</title></head><body style="background:#121212;color:#fff;text-align:center;padding:40px;font-family:sans-serif;"><h2>Sin conexión a internet</h2><p>Conéctate a internet al menos una vez para descargar la aplicación en este equipo.</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // CASO B: Archivos estáticos (styles.css, script.js, icono, manifest)
  event.respondWith(
    (async () => {
      // 1. Buscar en caché local (acceso instantáneo, 0ms)
      const cachedResponse = await caches.match(event.request, { ignoreSearch: true });

      // 2. En paralelo, si hay internet, revalidar en segundo plano para la próxima carga
      const networkUpdate = fetch(event.request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      // Si ya está en la caché local, devolverlo inmediatamente
      if (cachedResponse) {
        return cachedResponse;
      }

      // Si no estaba en caché, esperar a la red
      const netRes = await networkUpdate;
      if (netRes) {
        return netRes;
      }

      return new Response('Recurso no disponible offline.', {
        status: 408,
        headers: { 'Content-Type': 'text/plain' }
      });
    })()
  );
});
