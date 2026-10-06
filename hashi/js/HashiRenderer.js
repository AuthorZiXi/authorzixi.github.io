// ===== 两种主题下 Canvas 内部用的颜色 =====
const RENDER_COLORS = {
    dark: {
        gridLine: 'rgba(255, 255, 255, 0.07)',
        coord: 'rgba(255, 255, 255, 0.40)',
        bridge: '#64d8ff',
        bridgeGlow: 'rgba(100, 216, 255, 0.20)',
        islandBg: '#1f2c44',
        islandBorder: 'rgba(255, 255, 255, 0.15)',
        islandText: '#eef5ff',
        islandTextOn: '#0b0e17',
        halo0: 'rgba(100, 216, 255, 0.08)',
        halo1: 'rgba(100, 216, 255, 0)',
    },
    light: {
        gridLine: 'rgba(0, 0, 0, 0.06)',
        coord: 'rgba(0, 0, 0, 0.35)',
        bridge: '#2a8bcc',
        bridgeGlow: 'rgba(42, 139, 204, 0.18)',
        islandBg: '#ffffff',
        islandBorder: 'rgba(0, 0, 0, 0.16)',
        islandText: '#16202e',
        islandTextOn: '#ffffff',
        halo0: 'rgba(42, 139, 204, 0.10)',
        halo1: 'rgba(42, 139, 204, 0)',
    }
};

// ================================================================
//  渲染器 (固定格子尺寸，滚动条)
// ================================================================
export class HashiRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;
        this.game = null;
        this.onChange = null;
        this.mode = 'select';
        this._size = { width: 0, height: 0 };
        this._isPointerDown = false;
        this._lastRemoveTarget = null;
        // 拖拽平移
        this._downPos = { x: 0, y: 0 };
        this._lastPan = { x: 0, y: 0 };
        this._panMoved = false;
        // 高 DPI
        this.cssW = 400;
        this.cssH = 400;
        // 网格固定参数
        this.cellSize = 62;
        this.padding = 62;
        // 视觉配置
        this.config = {
            bridgeLineWidth: 4.5,
            coordFontSize: 16,
            islandRadiusScale: 0.30,
        };
        this.auxDisplay = false;
        this.theme = 'dark';
        this.flashState = null;
        this._resize();
        this._bindEvents();
    }

    _resize() {
        const MIN_SIZE = 100;

        if (!this.game) {
            const dpr = this.dpr = window.devicePixelRatio || 1;
            this.cssW = this.cssH = 400;
            this.canvas.width = Math.round(400 * dpr);
            this.canvas.height = Math.round(400 * dpr);
            this.canvas.style.width = '400px';
            this.canvas.style.height = '400px';
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return;
        }

        const cell = this.cellSize;
        const pad = this.padding;
        const cssW = Math.max(MIN_SIZE, (this.game.width - 1) * cell + pad * 2);
        const cssH = Math.max(MIN_SIZE, (this.game.height - 1) * cell + pad * 2);

        // 按屏幕 DPR 渲染，避免高分屏发虚；同时不超浏览器画布上限
        let dpr = window.devicePixelRatio || 1;
        const MAX_SIDE = 16384;
        const MAX_AREA = 16777216;
        while (dpr > 1 && (
            cssW * dpr > MAX_SIDE || cssH * dpr > MAX_SIDE ||
            (cssW * dpr) * (cssH * dpr) > MAX_AREA
        )) {
            dpr -= 0.5;
            if (dpr < 1) { dpr = 1; break; }
        }
        this.dpr = dpr;

        this.cssW = cssW;
        this.cssH = cssH;

        this.canvas.width = Math.round(cssW * dpr);
        this.canvas.height = Math.round(cssH * dpr);
        this.canvas.style.width = cssW + 'px';
        this.canvas.style.height = cssH + 'px';

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.render();
    }

    fitToScreen() {
        // 仅重新计算尺寸并重绘
        this._resize();
    }

    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this._resize();
        if (this.game) this.render();
        if (this.onConfigChange) this.onConfigChange(this.config);
    }

    setTheme(theme) {
        this.theme = theme === 'light' ? 'light' : 'dark';
        if (this.game) this.render();
    }

    // --- 闪烁控制 ---
    startFlash(type, islandIndices) {
        this.stopFlash();
        const islands = new Set(islandIndices);
        this.flashState = { type, islands, timer: null, phase: 0 };
        let count = 0;
        const maxCount = 6;
        const interval = 300;
        const flashFn = () => {
            count++;
            if (count > maxCount) {
                this.stopFlash();
                this.render();
                return;
            }
            this.flashState.phase = count % 2;
            this.render();
        };
        this.flashState.timer = setInterval(flashFn, interval);
        flashFn();
    }

    stopFlash() {
        if (this.flashState && this.flashState.timer) {
            clearInterval(this.flashState.timer);
        }
        this.flashState = null;
        if (this.game) this.render();
    }

    _bindEvents() {
        const c = this.canvas;
        const toPos = (touch) => {
            const rect = c.getBoundingClientRect();
            return {
                x: (touch.clientX - rect.left) * (this.cssW / rect.width),
                y: (touch.clientY - rect.top) * (this.cssH / rect.height)
            };
        };

        c.addEventListener('mousedown', (e) => this._onPointerDown(e));
        c.addEventListener('mousemove', (e) => this._onPointerMove(e));
        c.addEventListener('mouseup', (e) => this._onPointerUp(e));
        c.addEventListener('mouseleave', () => {
            // 鼠标移出画布：取消当前操作，不触发点击
            this._isPointerDown = false;
            this._panMoved = false;
            this._lastRemoveTarget = null;
            const wrap = this.canvas.parentElement;
            if (wrap) wrap.classList.remove('panning');
        });

        c.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            const p = toPos(t);
            this._onPointerDown({ clientX: t.clientX, clientY: t.clientY, _x: p.x, _y: p.y, touches: e.touches });
        }, { passive: false });

        c.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            const p = toPos(t);
            this._onPointerMove({ clientX: t.clientX, clientY: t.clientY, _x: p.x, _y: p.y, touches: e.touches });
        }, { passive: false });

        c.addEventListener('touchend', (e) => {
            e.preventDefault();
            this._onPointerUp(e);
        }, { passive: false });

        c.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _getPos(e) {
        if (e._x !== undefined) return { x: e._x, y: e._y };
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.cssW / rect.width),
            y: (e.clientY - rect.top) * (this.cssH / rect.height)
        };
    }

    _onPointerDown(e) {
        if (e.touches && e.touches.length >= 2) {
            this._isPointerDown = false;
            this._panMoved = false;
            return;
        }

        this._isPointerDown = true;
        this._downPos = { x: e.clientX, y: e.clientY };
        this._downCanvasPos = this._getPos(e);   // 记住按下时的画布坐标
        this._panMoved = false;
        this._lastRemoveTarget = null;

        if (this.mode === 'knife') {
            this._tryRemoveBridgeAt(this._downCanvasPos.x, this._downCanvasPos.y);
        }
    }

    _onPointerMove(e) {
        if (!this._isPointerDown) return;

        if (this.mode === 'knife') {
            const pos = this._getPos(e);
            this._tryRemoveBridgeAt(pos.x, pos.y);
            return;
        }

        // 用「屏幕坐标」算增量，和滚动彻底解耦
        const sx = e.clientX, sy = e.clientY;

        if (!this._panMoved) {
            const dx0 = sx - this._downPos.x;
            const dy0 = sy - this._downPos.y;
            if (Math.hypot(dx0, dy0) < 6) return;
            this._panMoved = true;
            this._lastScreen = { x: sx, y: sy };
            const wrap = this.canvas.parentElement;
            if (wrap) wrap.classList.add('panning');
            return;   // 触发那一帧不平移，避免一次跳两格
        }

        const dx = sx - this._lastScreen.x;
        const dy = sy - this._lastScreen.y;
        this._lastScreen = { x: sx, y: sy };

        const wrap = this.canvas.parentElement;
        if (wrap) {
            wrap.scrollLeft -= dx;
            wrap.scrollTop -= dy;
        }
    }

    _onPointerUp(e) {
        if (!this._isPointerDown) return;
        this._isPointerDown = false;

        const wrap = this.canvas.parentElement;
        if (wrap) wrap.classList.remove('panning');

        const wasPan = this._panMoved;
        this._panMoved = false;
        this._lastRemoveTarget = null;

        if (this.mode === 'knife') return;
        if (wasPan) return;

        // 用按下时缓存的画布坐标做点击判定（touchend 里没有触摸点）
        this._handleClickAt(this._downCanvasPos.x, this._downCanvasPos.y);
    }

    _pixelToGrid(px, py) {
        return {
            x: (px - this.padding) / this.cellSize,
            y: (py - this.padding) / this.cellSize
        };
    }

    _gridToPixel(gx, gy) {
        return {
            x: gx * this.cellSize + this.padding,
            y: gy * this.cellSize + this.padding
        };
    }

    _tryRemoveBridgeAt(px, py) {
        if (!this.game) return;
        const threshold = 10;
        let bestBridge = null, bestDist = Infinity;
        for (const br of this.game.bridges) {
            const f = this.game.islands[br.from];
            const t = this.game.islands[br.to];
            const p1 = this._gridToPixel(f.x, f.y);
            const p2 = this._gridToPixel(t.x, t.y);
            const dist = this._distToSegment(px, py, p1.x, p1.y, p2.x, p2.y);
            if (dist < threshold && dist < bestDist) {
                bestDist = dist;
                bestBridge = br;
            }
        }
        if (bestBridge) {
            const key = Math.min(bestBridge.from, bestBridge.to) + ',' + Math.max(bestBridge.from, bestBridge.to);
            if (this._lastRemoveTarget === key) return;
            this._lastRemoveTarget = key;
            const from = bestBridge.from, to = bestBridge.to;
            if (this.game.removeBridge(from, to)) {
                this.render();
                this._onChange();
            }
        }
    }

    _distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + t * dx, cy = y1 + t * dy;
        return Math.hypot(px - cx, py - cy);
    }

    _handleClickAt(px, py) {
        if (!this.game) return;
        const idx = this._hitTest(px, py);
        if (idx === null) {
            this.game.selected = null;
            this.render();
            return;
        }
        if (this.game.selected === null) {
            this.game.selected = idx;
            this.render();
            return;
        }
        if (this.game.selected === idx) {
            this.game.selected = null;
            this.render();
            return;
        }
        const from = this.game.selected, to = idx;
        const existing = this.game.getBridgeBetween(from, to);
        const degFrom = this.game.getDegree(from);
        const degTo = this.game.getDegree(to);
        const targetFrom = this.game.islands[from].number;
        const targetTo = this.game.islands[to].number;

        if (existing) {
            if (degFrom >= targetFrom || degTo >= targetTo) {
                this.game.removeAllBridges(from, to);
                this.game.selected = null;
                this.render();
                this._onChange();
                showToast('已拆除该路径所有桥梁', '');
                return;
            }
            if (existing.count < 2) {
                if (this.game.addBridge(from, to)) {
                    this.game.selected = null;
                    this.render();
                    this._onChange();
                } else {
                    showToast('无法增加桥梁', 'error');
                    this.game.selected = null;
                    this.render();
                }
            } else {
                this.game.removeAllBridges(from, to);
                this.game.selected = null;
                this.render();
                this._onChange();
                showToast('已拆除该路径所有桥梁', '');
            }
        } else {
            if (degFrom >= targetFrom) {
                showToast('选中的岛屿已达到上限', 'error');
                this.game.selected = null;
                this.render();
                return;
            }
            if (degTo >= targetTo) {
                showToast('目标岛屿已达到上限', 'error');
                this.game.selected = null;
                this.render();
                return;
            }
            if (this.game.addBridge(from, to)) {
                this.game.selected = null;
                this.render();
                this._onChange();
            } else {
                this.game.selected = null;
                this.render();
                showToast('无法建桥：路径被阻挡或已达岛屿上限', 'error');
            }
        }
    }

    _hitTest(px, py) {
        if (!this.game || !this.game.islands.length) return null;
        const hitRadius = 12;
        for (let i = this.game.islands.length - 1; i >= 0; i--) {
            const p = this.game.islands[i];
            const pos = this._gridToPixel(p.x, p.y);
            const dx = px - pos.x, dy = py - pos.y;
            if (dx * dx + dy * dy < hitRadius * hitRadius) return i;
        }
        return null;
    }

    _onChange() {
        if (this.onChange) this.onChange(this.game);
    }

    render(game) {
        if (game) this.game = game;
        if (!this.game) return;
        const ctx = this.ctx;
        const w = this.cssW, h = this.cssH;
        ctx.clearRect(0, 0, w, h);

        const { islands, bridges, width, height, selected } = this.game;
        const cell = this.cellSize;
        const pad = this.padding;
        const cfg = this.config;
        const flash = this.flashState;
        const aux = this.auxDisplay;
        const C = RENDER_COLORS[this.theme] || RENDER_COLORS.dark;

        // 绘制网格
        ctx.strokeStyle = ctx.strokeStyle = C.gridLine;;
        ctx.lineWidth = 0.5;
        for (let x = 0; x < width; x++) {
            const px = x * cell + pad;
            ctx.beginPath();
            ctx.moveTo(px, pad);
            ctx.lineTo(px, (height - 1) * cell + pad);
            ctx.stroke();
        }
        for (let y = 0; y < height; y++) {
            const py = y * cell + pad;
            ctx.beginPath();
            ctx.moveTo(pad, py);
            ctx.lineTo((width - 1) * cell + pad, py);
            ctx.stroke();
        }

        // 计算岛屿半径
        const r = Math.max(4, cell * cfg.islandRadiusScale);
        const coordOffset = r + 12;

        // 坐标
        const fontSize = Math.max(8, Math.min(18, cell * cfg.islandRadiusScale * 1.2));
        ctx.fillStyle = ctx.fillStyle = C.coord;
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let x = 0; x < width; x++) {
            const px = x * cell + pad;
            if (px > 0 && px < w) {
                ctx.fillText(x, px, pad - coordOffset);
            }
        }
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let y = 0; y < height; y++) {
            const py = y * cell + pad;
            if (py > 0 && py < h) {
                ctx.fillText(y, pad - coordOffset, py);
            }
        }

        // 桥梁
        const lineWidth = cfg.bridgeLineWidth;
        const bridgeColor = C.bridge;
        const bridgeGlow = C.bridgeGlow;
        for (const b of bridges) {
            const from = islands[b.from], to = islands[b.to];
            const p1 = this._gridToPixel(from.x, from.y);
            const p2 = this._gridToPixel(to.x, to.y);
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.01) continue;
            const nx = -dy / len, ny = dx / len;
            const off = Math.min(4, cell * 0.12);
            const drawBridge = (off2) => {
                const ox = p1.x + nx * off2, oy = p1.y + ny * off2;
                const ox2 = p2.x + nx * off2, oy2 = p2.y + ny * off2;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(ox2, oy2);
                ctx.strokeStyle = bridgeColor;
                ctx.lineWidth = lineWidth;
                ctx.shadowColor = bridgeGlow;
                ctx.shadowBlur = 6;
                ctx.stroke();
                ctx.shadowBlur = 0;
            };
            if (b.count === 1) drawBridge(0);
            else { drawBridge(-off); drawBridge(off); }
        }

        // 辅助状态 (黄绿)
        const status = [];
        if (aux) {
            for (let i = 0; i < islands.length; i++) {
                const deg = this.game.getDegree(i);
                const target = islands[i].number;
                if (deg < target) status[i] = 'yellow';
                else if (deg === target) status[i] = 'green';
            }
        }

        // 岛屿
        for (let i = 0; i < islands.length; i++) {
            const p = islands[i];
            const pos = this._gridToPixel(p.x, p.y);
            const isSelected = (selected === i);

            let flashColor = null;
            if (flash && flash.islands.has(i)) {
                if (flash.type === 'red') flashColor = '#ff4444';
                else if (flash.type === 'green') flashColor = '#44ff88';
                else if (flash.type === 'blue') flashColor = '#44aaff';
                if (flash.phase === 0) flashColor = null;
            }

            let borderColor = null;
            if (aux && !flashColor) {
                if (status[i] === 'yellow') borderColor = '#f5c542';
                else if (status[i] === 'green') borderColor = '#4cd9a0';
            }

            const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * 1.8);
            if (isSelected) {
                grad.addColorStop(0, 'rgba(245,197,66,0.25)');
                grad.addColorStop(1, 'rgba(245,197,66,0)');
            } else if (flashColor) {
                const col = flashColor;
                grad.addColorStop(0, col + '40');
                grad.addColorStop(1, col + '00');
            } else {
                grad.addColorStop(0, C.halo0);
                grad.addColorStop(1, C.halo1);
            }
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r * 1.8, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            let bg = isSelected ? '#f5c542' : C.islandBg;
            let border = isSelected ? '#f5c542' : C.islandBorder;
            if (flashColor) {
                bg = flashColor;
                border = flashColor;
            } else if (borderColor) {
                border = borderColor;
                ctx.lineWidth = 2.5;
            }
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.strokeStyle = border;
            ctx.lineWidth = (borderColor || flashColor) ? 2.5 : (isSelected ? 1.5 : 1);
            ctx.stroke();

            if (flashColor) {
                ctx.shadowColor = flashColor;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
                ctx.fillStyle = bg;
                ctx.fill();
                ctx.strokeStyle = border;
                ctx.lineWidth = 2.5;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            let textColor = C.islandText;
            if (isSelected || flashColor) {
                textColor = C.islandTextOn;
            }
            const textSize = fontSize * 0.9;
            ctx.fillStyle = textColor;
            ctx.font = `600 ${textSize}px "Inter", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.number, pos.x, pos.y + 1);

            if (isSelected) {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, r + 2, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(245,197,66,0.40)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
}
