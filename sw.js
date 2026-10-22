/* Service worker de LifeAgente AI (v44).
 *
 * Que la app se pueda instalar en el celular (Android) y siga abriendo
 * aunque no haya internet: guardamos en cache el "esqueleto" de la app
 * (los archivos estaticos) y SIEMPRE vamos a la red primero para los
 * datos (la API nunca se cachea: un gasto viejo es peor que no tener).
 */
const CACHE = 'lifeagente-v1'
const ESQUELETO = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png']

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ESQUELETO).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request
  if (peticion.method !== 'GET') return
  const url = new URL(peticion.url)
  // La API y los documentos de usuario NUNCA se guardan en cache.
  if (url.pathname.includes('/api/')) return

  evento.respondWith(
    caches.match(peticion).then((guardada) => {
      const red = fetch(peticion)
        .then((respuesta) => {
          if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
            const copia = respuesta.clone()
            caches.open(CACHE).then((cache) => cache.put(peticion, copia).catch(() => undefined))
          }
          return respuesta
        })
        .catch(() => guardada || caches.match('./index.html'))
      // Red primero (para tener la version nueva), cache como respaldo.
      return red.catch(() => guardada || caches.match('./index.html'))
    }),
  )
})
