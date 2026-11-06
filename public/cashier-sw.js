// الكاشير من غير نت: الصفحة وملفاتها بتتحفظ على الجهاز، والداتا بتعدّي على طول
const CACHE = "byraslan-cashier-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/cashier", "/logo.png", "/icon.png", "/cashier.webmanifest"]).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("byraslan-cashier-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) {
    // خطوط جوجل بتتحفظ، والداتا (Supabase) بتعدّي من غير حفظ
    if (u.host.includes("fonts.g")) e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(r)) || fetch(r).then((x) => { c.put(r, x.clone()); return x; })));
    return;
  }
  if (r.mode === "navigate") {
    // الصفحة: من النت الأول، ولو مفيش نت من النسخة المحفوظة
    e.respondWith(fetch(r).then((x) => { if (x.ok && !x.redirected) caches.open(CACHE).then((c) => c.put("/cashier", x.clone())); return x; }).catch(() => caches.match("/cashier")));
    return;
  }
  if (u.pathname.startsWith("/_next/static/") || /\.(png|jpg|svg|woff2?|webmanifest)$/.test(u.pathname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(r)) || fetch(r).then((x) => { if (x.ok) c.put(r, x.clone()); return x; })));
  }
});
