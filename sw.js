/* Conecta Mantiqueira — trabalha em segundo plano no celular:
   notificações, app instalado e abrir mesmo com internet fraca. */
const CACHE = 'conecta-v12';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './manifest.json', './icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Sempre busca a versão nova do site primeiro; só usa a cópia guardada se estiver sem internet. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./')))
  );
});

/* Notificação enviada pelo servidor (push), mesmo com o app fechado. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'Conecta Mantiqueira';
  const apple = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent || '');
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const onScreen = list.some(c => c.visibilityState === 'visible' && c.focused);
    list.forEach(c => c.postMessage({ type: 'push', data: d }));
    // Com o app aberto na tela, o próprio site já toca o som. No iPhone a Apple exige mostrar sempre.
    if (onScreen && !apple) return;
    try { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(); } catch (_) {}
    await self.registration.showNotification(title, {
      body: d.body || 'Você tem uma novidade no Conecta Mantiqueira.',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: d.tag || 'conecta',
      renotify: true,
      vibrate: [80, 40, 80],
      data: { url: d.url || './', from: d.from || '' }
    });
  })());
});

/* Tocou na notificação: abre o app (ou traz ele para frente). */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          if (data.from) c.postMessage({ type: 'open-chat', from: data.from });
          return c.focus();
        }
      }
      return self.clients.openWindow(data.url || './');
    })
  );
});
