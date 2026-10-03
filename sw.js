// DIMAX-NEO service worker — кэширует ТОЛЬКО оболочку приложения.
// VERSION меняет update_pwa.sh при каждом выпуске (номер версии + отпечаток index.html). Изменился sw.js →
// браузер ставит новый воркер → новый кэш → старые кэши удаляются в activate. Поэтому новая версия не может
// «застрять» за старым HTML.
const VERSION = 'v26.58-59ebedcd';
const CACHE = 'dimax-neo-shell-' + VERSION;
const SHELL = ['./', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/apple-touch-icon-180.png', 'icons/favicon-32.png', 'icons/favicon-16.png'];
// Статика с CDN (библиотека supabase-js фиксированной версии, шрифты) — тоже оболочка, кэшируется при первом запросе.
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))); // мимо HTTP-кэша — только свежие файлы
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('dimax-neo-shell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // запись данных — никогда не трогаем
  const url = new URL(req.url);
  // Supabase (REST / Auth / Storage / Realtime / Edge Functions): НЕ перехватываем вообще — запрос идёт прямо в сеть,
  // без кэша; без интернета приложение ведёт себя как раньше (свои сообщения об ошибке сети).
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !STATIC_HOSTS.includes(url.hostname)) return;   // всё прочее — тоже мимо воркера

  // Открытие приложения (любой адрес внутри scope) — всегда оболочка './'
  const key = req.mode === 'navigate' ? './' : req;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(key, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;                                   // cache-first
    const res = await fetch(req);                          // fallback на сеть
    // свои файлы оболочки уже лежат в кэше с установки; дополнительно кэшируем только статику с CDN
    if (!sameOrigin && res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {});
    return res;
  })());
});
