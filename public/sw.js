/* Public, immutable fallback only. No sessions, APIs, RSC payloads or operational HTML are cached. */
const CACHE_NAME = 'meupedido-public-v1';
const PUBLIC_FILES = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)));
  // Updates wait for an explicit user action. Never reload an in-progress checkout automatically.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('meupedido-public-') && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || event.request.headers.has('RSC') || url.searchParams.has('_rsc')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      const fallback = await caches.match('/offline.html');
      return fallback || new Response('Sem conexão. Reconecte para continuar.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }));
  } else if (PUBLIC_FILES.includes(url.pathname) && !url.search) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Always show a visible, generic message. */ }
  const title = typeof data.title === 'string' ? data.title.slice(0,100) : 'Atualização · MeuPedido';
  const body = typeof data.body === 'string' ? data.body.slice(0,180) : 'Abra o MeuPedido para acompanhar a operação.';
  const tag = typeof data.tag === 'string' && /^meupedido-[0-9a-f-]{36}$/.test(data.tag) ? data.tag : 'meupedido-operation';
  // A stable tag replaces repeated delivery, without repeatedly sounding an existing notification.
  event.waitUntil(self.registration.showNotification(title, {
    body,tag,renotify:false,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
    data:{url:'/notificacoes'},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('/notificacoes', self.location.origin).href;
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(url); await existing.focus(); }
    else await self.clients.openWindow(url);
  })());
});
// Subscription renewal requires a new authenticated, explicit activation in the app.
// Never cache a session token or attempt an unattended subscription mutation.
