const CACHE_NAME = 'gidapark-v2.5';
const assets = [
    'index.html',
    'manifest.json',
    'js/shared/config.js',
    'js/shared/i18n.js',
    'js/shared/utils.js',
    'js/shared/router.js',
    'js/shared/app.js',
    'js/flexible/api.js',
    'js/flexible/ui.js',
    'js/fixed/config.js',
    'js/fixed/utils.js',
    'js/fixed/groups.js',
    'js/fixed/calendar.js',
    'js/fixed/trips.js',
    'js/fixed/debts.js',
    'js/fixed/modals.js',
    'js/fixed/profile.js',
    'js/parking/logic.js',
    'js/parking/groups.js',
    'js/parking/ui.js'
];

// INSTALACIÓN: Descarga los nuevos archivos
self.addEventListener('install', e => {
    self.skipWaiting(); // <--- IMPORTANTE: Fuerza al nuevo SW a activarse ya
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Cacheando nuevos archivos');
            return cache.addAll(assets);
        })
    );
});

// ACTIVACIÓN: Limpia las cachés viejas para liberar espacio
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('Borrando caché antigua:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    // Toma el control de las pestañas abiertas inmediatamente
    self.clients.claim();
});

// FETCH: Estrategia híbrida
self.addEventListener('fetch', e => {
    // Si es el index.html (navegación), intentamos RED primero para ver cambios
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Para el resto (imágenes, css, js), usamos la CACHÉ para velocidad
    e.respondWith(
        caches.match(e.request).then(res => res || fetch(e.request))
    );
});













