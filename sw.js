/* 서비스 워커: 앱 파일과 Firebase SDK를 캐시해 오프라인에서도 앱이 열리게 한다 (DECISIONS.md D-022).
   ./sw.js로 등록하므로 앱 폴더 범위만 다룬다. 모든 경로는 상대 경로 (호스팅 이식성, D-023). */

// 릴리스할 때마다 올린다. 이름이 바뀌면 activate에서 이전 캐시를 지운다.
const CACHE_NAME = 'jdrbm-v0.6';
// index.html의 FIREBASE_SDK_URL과 같은 버전이어야 한다.
const SDK_BASE = 'https://www.gstatic.com/firebasejs/12.19.0/';
const SDK_FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(file => SDK_BASE + file);
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
// 연결이 불안정할 때 앱이 오래 멈춰 있지 않도록, 이 시간 안에 응답이 없으면 캐시로 연다.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...APP_SHELL, ...SDK_FILES]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('jdrbm-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 버전이 URL에 있어 바뀌지 않는다.
  if (url.href.startsWith('https://www.gstatic.com/firebasejs/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Firestore·Auth 통신과 파비콘은 가로채지 않는다 (SDK가 오프라인을 직접 처리).
  if (url.origin !== self.location.origin) return;

  // 새 버전을 바로 받도록 앱 본체는 네트워크 우선.
  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.includes('/icons/')) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  network.catch(() => {}); // 캐시로 응답한 뒤의 실패는 무시

  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
  } catch {
    // 오프라인: 캐시로 연다
  }
  const cached = await cache.match(request, { ignoreSearch: true }) ||
    (request.mode === 'navigate' ? await cache.match('./') : undefined);
  // 캐시에도 없으면 네트워크 결과(또는 오류)를 그대로 기다린다.
  return cached || network;
}
