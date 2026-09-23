const CACHE_NAME = 'cnc-assistant-v7';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icono.png'
];

// 1. INSTALACIÓN RESILIENTE:
// Cachea todos los recursos core. Si alguno falla, la instalación continúa.
// COPIA TODOS los recursos de cachés anteriores que no se pudieron descargar.
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
            return true;
          }
        } catch (err) {
          console.warn('[Service Worker] Recurso no descargado en install:', url);
        }
        return false;
      });
      const results = await Promise.allSettled(cachePromises);

      // RESCATE: Para CADA recurso que no se pudo descargar, copiar desde cachés anteriores
      const allCacheNames = await caches.keys();
      const oldCacheNames = allCacheNames.filter(n => n !== CACHE_NAME);

      for (let i = 0; i < CORE_ASSETS.length; i++) {
        const url = CORE_ASSETS[i];
        const succeeded = results[i].status === 'fulfilled' && results[i].value === true;
        if (succeeded) continue;

        // Intentar rescatar este recurso de cachés anteriores
        for (const oldCacheName of oldCacheNames) {
          try {
            const oldCache = await caches.open(oldCacheName);
            // Intentar múltiples variantes de la URL
            const candidates = [url];
            if (url === './index.html') candidates.push('index.html', './');
            if (url === './') candidates.push('index.html', './index.html');

            let found = false;
            for (const candidate of candidates) {
              const oldResponse = await oldCache.match(candidate, { ignoreSearch: true });
              if (oldResponse) {
                await cache.put(url, oldResponse.clone());
                console.log('[Service Worker] Recurso rescatado desde caché anterior:', url, '←', oldCacheName);
                found = true;
                break;
              }
            }
            if (found) break;
          } catch (e) {
            // Continuar con la siguiente caché
          }
        }
      }

      // Asegurar que './' también apunte a index.html si existe
      const indexCached = await cache.match('./index.html');
      if (indexCached) {
        const rootCached = await cache.match('./');
        if (!rootCached) {
          await cache.put('./', indexCached.clone());
        }
      }

      // Verificar estado final
      const finalCheck = await cache.match('./index.html');
      if (finalCheck) {
        console.log('[Service Worker] ✅ Instalación completa: index.html disponible en caché');
      } else {
        console.warn('[Service Worker] ⚠️ index.html NO disponible - primera instalación requiere internet');
      }
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 2. ACTIVACIÓN SEGURA:
// SOLO elimina cachés antiguas si la nueva caché tiene los recursos necesarios.
// Si la nueva caché está vacía (instalación offline sin datos previos), CONSERVA las antiguas.
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activado y tomando control:', CACHE_NAME);
  event.waitUntil(
    (async () => {
      // Habilitar Navigation Preload si está disponible
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
          console.log('[Service Worker] Navigation Preload habilitado');
        } catch (e) {
          console.warn('[Service Worker] Navigation Preload no pudo habilitarse:', e);
        }
      }

      // VERIFICAR que la nueva caché tiene index.html antes de borrar las antiguas
      const newCache = await caches.open(CACHE_NAME);
      const hasIndex = await newCache.match('./index.html') ||
                       await newCache.match('index.html') ||
                       await newCache.match('./');

      const cacheNames = await caches.keys();
      const oldCacheNames = cacheNames.filter(name => name !== CACHE_NAME);

      if (hasIndex) {
        // ✅ La nueva caché tiene contenido → seguro borrar las antiguas
        await Promise.all(
          oldCacheNames.map((name) => {
            console.log('[Service Worker] Purgando caché obsoleta:', name);
            return caches.delete(name);
          })
        );
      } else if (oldCacheNames.length > 0) {
        // ⚠️ La nueva caché NO tiene contenido pero HAY cachés antiguas
        // Rescatar TODO desde la caché antigua más reciente
        console.warn('[Service Worker] Nueva caché vacía. Rescatando recursos de cachés anteriores...');
        for (const oldCacheName of oldCacheNames) {
          try {
            const oldCache = await caches.open(oldCacheName);
            const oldKeys = await oldCache.keys();
            for (const request of oldKeys) {
              const response = await oldCache.match(request);
              if (response) {
                await newCache.put(request, response.clone());
                console.log('[Service Worker] Rescatado en activate:', request.url);
              }
            }
            // Si rescatamos contenido, ahora sí es seguro borrar
            const rescuedIndex = await newCache.match('./index.html') ||
                                 await newCache.match('index.html') ||
                                 await newCache.match('./');
            if (rescuedIndex) {
              console.log('[Service Worker] ✅ Rescate exitoso desde:', oldCacheName);
              // Ahora borrar las cachés antiguas
              await Promise.all(
                oldCacheNames.map(name => caches.delete(name))
              );
              break;
            }
          } catch (e) {
            console.warn('[Service Worker] Error rescatando desde:', oldCacheName, e);
          }
        }
      }

      // Tomar control inmediato de todas las pestañas/clientes
      await self.clients.claim();
    })()
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
  // Buscar en TODAS las cachés, no solo la actual, como último recurso
  const allCacheNames = await caches.keys();

  // Primero buscar en la caché actual
  const prioritizedNames = [CACHE_NAME, ...allCacheNames.filter(n => n !== CACHE_NAME)];

  for (const cacheName of prioritizedNames) {
    try {
      const cache = await caches.open(cacheName);
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
    } catch (e) {
      console.warn('[Service Worker] Error buscando en caché', cacheName, e);
    }
  }
  return null;
}

// Función auxiliar para buscar cualquier recurso en todas las cachés disponibles
async function getFromAnyCache(request) {
  const allCacheNames = await caches.keys();
  const prioritizedNames = [CACHE_NAME, ...allCacheNames.filter(n => n !== CACHE_NAME)];

  for (const cacheName of prioritizedNames) {
    try {
      const cache = await caches.open(cacheName);
      const match = await cache.match(request, { ignoreSearch: true });
      if (match) return match;
    } catch (e) {
      // Continuar buscando en la siguiente caché
    }
  }
  return null;
}

// 4. INTERCEPTACIÓN DE PETICIONES (FETCH):
// Prioridad:
// A) Navegación (HTML de inicio): Cache-first con actualización en background.
//    Si hay caché → servir inmediatamente. Si no → intentar red.
//    Esto GARANTIZA que offline siempre funcione, sin depender de timeouts.
// B) Recursos estáticos (CSS, JS, iconos): Cache-first con Stale-While-Revalidate.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // CASO A: Petición de navegación (cuando el usuario abre la app o refresca la página)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // PASO 1: Buscar en caché PRIMERO (acceso instantáneo, 0ms, funciona siempre offline)
        const cachedIndex = await getCachedIndex();

        // PASO 2: Intentar obtener de la red en paralelo (para actualizar la caché)
        // Usar Navigation Preload si está disponible (el browser ya empezó el fetch
        // mientras el SW se despertaba)
        let networkResponsePromise;
        if (event.preloadResponse) {
          networkResponsePromise = event.preloadResponse.catch(() => null);
        } else {
          networkResponsePromise = Promise.resolve(null);
        }

        // También lanzar un fetch normal con timeout como respaldo
        const networkFetchPromise = fetch(event.request, { cache: 'no-cache' })
          .then(async (response) => {
            if (response && response.status === 200) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(event.request, response.clone());
              await cache.put('./index.html', response.clone());
              await cache.put('./', response.clone());
            }
            return response;
          })
          .catch(() => null);

        // Si tenemos caché, servir inmediatamente y actualizar en background
        if (cachedIndex) {
          // Actualización silenciosa en background (no bloquea la respuesta)
          networkResponsePromise.then(preloadResp => {
            if (preloadResp && preloadResp.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put('./index.html', preloadResp.clone());
                cache.put('./', preloadResp.clone());
              });
            }
          });
          // El fetch normal también actualiza en background (ya lanzado arriba)
          return cachedIndex;
        }

        // Si NO hay caché (primera visita), intentar la red
        // Primero intentar Navigation Preload
        const preloadResp = await networkResponsePromise;
        if (preloadResp && preloadResp.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', preloadResp.clone());
          await cache.put('./', preloadResp.clone());
          return preloadResp;
        }

        // Luego intentar fetch normal con timeout
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve(null), 3000)
        );
        const networkResponse = await Promise.race([networkFetchPromise, timeoutPromise]);
        if (networkResponse && networkResponse.status === 200) {
          return networkResponse;
        }

        // ÚLTIMO RECURSO: página de error (solo si nunca se descargó la app)
        return new Response(
          '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin Conexión</title></head><body style="background:#121212;color:#fff;text-align:center;padding:40px;font-family:sans-serif;"><h2>Sin conexión a internet</h2><p>Conéctate a internet al menos una vez para descargar la aplicación en este equipo.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })()
    );
    return;
  }

  // CASO B: Archivos estáticos (styles.css, script.js, icono, manifest)
  event.respondWith(
    (async () => {
      // 1. Buscar en caché local (acceso instantáneo, 0ms)
      const cachedResponse = await getFromAnyCache(event.request);

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
