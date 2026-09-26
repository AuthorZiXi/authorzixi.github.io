// ============================================================
//  数桥 · Service Worker
// ============================================================

const CACHE_NAME = 'hashi-v1';   // 改版时把 v1 往上加，比如 v2

// 预缓存清单：首次安装时就把这些拉进缓存
const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './icons/192.png',
    './icons/512.png',
    './icons/512-maskable.png',
];

// ---------- install：预缓存 ----------
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())   // 新 SW 立即接管，不等旧页面关闭
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
        ).then(() => self.clients.claim())       // 立即控制所有页面
    );
});

// ---------- fetch：拦截请求 ----------
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // 只处理 GET，其他（POST 等）直接放行
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 跨域请求放行（比如你 footer 里跳 deepseek / github 的链接）
    if (url.origin !== self.location.origin) return;

    // ---- 导航请求：网络优先，失败回退缓存 ----
    // 数桥会带 ?seed=...&w=...&h=... 打开，所以不能简单 caches.match(request)
    // 因为带参数的 URL 跟缓存的 './index.html' 不匹配
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // 网络成功，顺手更新一份缓存（存的是不带参数的版本）
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => {
                    // 断网了，回退到缓存的 index.html
                    // 参数丢失没关系，_loadFromHash() 会从 URL 重新读
                    return caches.match('./index.html');
                })
        );
        return;
    }

    // ---- 其他静态资源：缓存优先 ----
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;   // 命中缓存，直接用

            // 没命中，走网络，同时存一份
            return fetch(request).then(response => {
                // 只缓存成功的响应（避免把 404/500 也存进去）
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
// 可选，但配合下面的注册代码能让"新版本生效"更顺滑
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});