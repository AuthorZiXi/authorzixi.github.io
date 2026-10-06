// ============================================================
//  数桥 · Service Worker
// ============================================================

// ---------- 环境判定 ----------
// 本地开发时（localhost / 127.0.0.1 / [::1]）完全禁用缓存，
// 改动即时生效，不用每次改版本号。
const IS_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

// 只有生产环境才需要动这个
const CACHE_NAME = 'hashi-v1.7.1';

const PRECACHE = [
    './',
    './index.html',
    './privacy.html',
    './manifest.json',
    './css/style.css',
    './js/main.js',
    './js/utils.js',
    './js/toast.js',
    './js/HashiGame.js',
    './js/HashiRenderer.js',
    './js/DebugPanel.js',
    './js/App.js',
    './icons/192.png',
    './icons/512.png',
    './icons/512-maskable.png',
];

// ============================================================
//  开发模式：不缓存，全部直连网络
// ============================================================
if (IS_DEV) {
    console.log('🔧 [SW] 开发模式：缓存已禁用，所有请求直接走网络');

    self.addEventListener('install', () => {
        self.skipWaiting();
    });

    self.addEventListener('activate', (event) => {
        // 顺手把之前残留在浏览器里的旧缓存都清掉
        event.waitUntil(
            caches.keys()
                .then(keys => Promise.all(keys.map(k => caches.delete(k))))
                .then(() => self.clients.claim())
        );
    });

    self.addEventListener('fetch', (event) => {
        if (event.request.method !== 'GET') return;

        // cache: 'no-store' 同时绕过 HTTP 缓存和 SW 缓存
        event.respondWith(fetch(event.request, { cache: 'no-store' }));
    });

    self.addEventListener('message', (event) => {
        if (event.data === 'SKIP_WAITING') self.skipWaiting();
    });
}

// ============================================================
//  生产模式：预缓存 + 缓存优先（原逻辑）
// ============================================================
else {

    // ---------- install：预缓存 ----------
    self.addEventListener('install', (event) => {
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(cache => cache.addAll(PRECACHE))
                .then(() => self.skipWaiting())   // 新 SW 立即接管
        );
    });

    // ---------- activate：清理旧版本缓存 ----------
    self.addEventListener('activate', (event) => {
        event.waitUntil(
            caches.keys().then(keys =>
                Promise.all(
                    keys.filter(k => k !== CACHE_NAME)   // 只留当前版本
                        .map(k => caches.delete(k))
                )
            ).then(() => self.clients.claim())
        );
    });

    // ---------- fetch：拦截请求 ----------
    self.addEventListener('fetch', (event) => {
        const { request } = event;

        // 只处理 GET
        if (request.method !== 'GET') return;

        const url = new URL(request.url);

        // 跨域请求放行（footer 里 deepseek / github 的链接）
        if (url.origin !== self.location.origin) return;

        // ---- 导航请求：网络优先，失败回退缓存 ----
        // 数桥会带 ?seed=...&w=...&h=... 打开，所以不能简单 caches.match(request)，
        // 带参数的 URL 跟缓存的 './index.html' 不匹配
        if (request.mode === 'navigate') {
            event.respondWith(
                fetch(request)
                    .then(response => {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                        return response;
                    })
                    .catch(() => caches.match('./index.html'))
            );
            return;
        }

        // ---- 其他静态资源：缓存优先 ----
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;

                return fetch(request).then(response => {
                    // 只缓存成功的响应，避免把 404/500 存进去
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    return response;
                });
            })
        );
    });

    // ---------- message：允许页面主动通知 SW 更新 ----------
    self.addEventListener('message', (event) => {
        if (event.data === 'SKIP_WAITING') self.skipWaiting();
    });
}