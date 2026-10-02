import { App } from './App.js';

const app = new App();
window.__app = app;   // 保留调试入口
console.log('💡 双击标题栏 "🌉 数桥" 开启调试面板');

// Service Worker 注册
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('✅ SW 注册成功，scope:', reg.scope);
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    nw.addEventListener('statechange', () => {
                        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('🔄 检测到新版本，刷新后生效');
                        }
                    });
                });
            })
            .catch(err => console.error('❌ SW 注册失败:', err));
    });
}