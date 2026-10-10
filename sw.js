/* Conecta Mantiqueira — trabalha em segundo plano no celular:
   notificações, app instalado, abrir rápido e funcionar sem internet (como o Instagram). */
const VER = 'v23';
const CACHE = 'conecta-' + VER;          /* páginas e arquivos do site */
const LIB = 'conecta-lib-' + VER;        /* biblioteca do Supabase (necessária para abrir) */
const API = 'conecta-api';               /* últimos dados vistos (feed, perfis, conversas) */
const IMG = 'conecta-img';               /* fotos e capas já vistas */
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const IMG_MAX = 400, API_MAX = 300;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try { const c = await caches.open(CACHE); await c.addAll(['./', './manifest.json', './icon-192.png', './fundo-serra.jpg', './cadastro-bg.jpg']); } catch (_) {}
    try { const c = await caches.open(LIB); const r = await fetch(SDK, { mode: 'cors' }); if (r.ok) await c.put(SDK, r); } catch (_) {}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  const keep = [CACHE, LIB, API, IMG];
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* limpa os dados guardados quando a pessoa sai da conta */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'clear-user-cache') { caches.delete(API); caches.delete(IMG); }
});

async function trim(name, max) {
  try { const c = await caches.open(name); const k = await c.keys(); for (let i = 0; i < k.length - max; i++) await c.delete(k[i]); } catch (_) {}
}
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

/* rede primeiro; se a internet estiver fraca ou sem sinal, usa o que já foi visto */
async function networkFirst(req, cacheName, ms, opts) {
  const c = await caches.open(cacheName);
  const saved = ms ? await c.match(req, { ignoreVary: true }) : null;
  try {
    /* só desiste da rede lenta quando já existe uma cópia guardada para mostrar */
    /* a busca continua por trás e guarda a versão nova, mesmo se a guardada for mostrada antes */
    const net = fetch(req, opts).then(res => { if (res && res.ok) c.put(req, res.clone()).catch(() => {}); return res; });
    return await (saved ? Promise.race([net, timeout(ms)]) : net);
  } catch (err) {
    const hit = await c.match(req, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}
/* guardado primeiro (abre na hora) e atualiza por trás */
async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req, { ignoreVary: true });
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()).then(() => trim(cacheName, max)).catch(() => {}); }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* página do site: sempre confere se há versão nova; sem internet abre a guardada */
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    /* abre NA HORA com a versão guardada (igual app instalado) e busca a nova por trás;
       se mudou, avisa a página, que atualiza sozinha sem atrapalhar */
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match('./', { ignoreSearch: true, ignoreVary: true });
      const net = (async () => {
        try {
          const res = await fetch('./', { cache: 'no-cache' });
          if (!res || !res.ok) return null;
          const fresh = await res.clone().text();
          const old = hit ? await hit.clone().text().catch(() => '') : '';
          await c.put('./', res.clone());
          if (hit && old !== fresh) {
            await new Promise(r => setTimeout(r, 2500));
            const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            list.forEach(cl => cl.postMessage({ type: 'sw-updated' }));
          }
          return res;
        } catch (_) { return null; }
      })();
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || (await networkFirst(req, CACHE, 0, { cache: 'no-cache' }).catch(() => null)) || Response.error();
    })());
    return;
  }
  /* arquivos do próprio site */
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, CACHE, 0).catch(() => caches.match(req).then(r => r || Response.error())));
    return;
  }
  /* biblioteca do Supabase: abre na hora, atualiza por trás */
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@supabase/supabase-js')) {
    e.respondWith(staleWhileRevalidate(req, LIB));
    return;
  }
  if (url.hostname.endsWith('.supabase.co')) {
    /* fotos e vídeos públicos: guarda as fotos já vistas (vídeos não, para não lotar o celular) */
    if (url.pathname.includes('/storage/v1/object/public/')) {
      if (/\.(mp4|mov|webm|m4v)$/i.test(url.pathname) || req.headers.get('range')) return;
      e.respondWith(cacheFirst(req, IMG, IMG_MAX));
      return;
    }
    /* dados (feed, perfis, conversas): rede primeiro, sem sinal usa os últimos vistos */
    if (url.pathname.startsWith('/rest/v1/')) {
      e.respondWith(networkFirst(req, API, 7000).then(r => { trim(API, API_MAX); return r; }));
      return;
    }
  }
});

/* Notificação enviada pelo servidor (push), mesmo com o app fechado. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'Conecta';
  const apple = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent || '');
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const onScreen = list.some(c => c.visibilityState === 'visible' && c.focused);
    list.forEach(c => c.postMessage({ type: 'push', data: d }));
    // Com o app aberto na tela, o próprio site já toca o som. No iPhone a Apple exige mostrar sempre.
    if (onScreen && !apple) return;
    try { if (self.navigator.setAppBadge) await (d.count > 0 ? self.navigator.setAppBadge(d.count) : self.navigator.setAppBadge()); } catch (_) {}
    await self.registration.showNotification(title, {
      body: d.body || 'Você tem uma novidade no Conecta.',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: d.tag || 'conecta',
      renotify: true,
      vibrate: d.vibrate || [80, 40, 80],
      requireInteraction: !!d.requireInteraction,
      actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : undefined,
      data: { url: d.url || './', from: d.from || '' }
    });
  })());
});

/* Tocou na notificação: abre o app (ou traz ele para frente). */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'decline') return;               /* recusou a chamada da sala */
  const data = e.notification.data || {};
  /* convite para a Sala ao vivo: abre direto na sala */
  const sala = (String(e.notification.body || '') + ' ' + String(data.url || '')).match(/[?&]sala=([^\s&#]+)/);
  const sala2 = !sala && String(e.notification.body || '').match(/Sala ao vivo de ([^!\n]{2,40})!/);
  if (sala || sala2) {
    let city = sala ? sala[1] : sala2[1].trim(); try { if (sala) city = decodeURIComponent(city); } catch (_) {}
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) { c.postMessage({ type: 'open-room', city }); return c.focus(); } }
      return self.clients.openWindow('./?sala=' + encodeURIComponent(city));
    }));
    return;
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          if (data.from) c.postMessage({ type: 'open-chat', from: data.from });
          else if (data.url) c.postMessage({ type: 'open-url', url: data.url });
          return c.focus();
        }
      }
      return self.clients.openWindow(data.url || './');
    })
  );
});
