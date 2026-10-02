import { HashiGame } from './HashiGame.js';
import { HashiRenderer } from './HashiRenderer.js';
import { DebugPanel } from './DebugPanel.js';
import { hashString } from './utils.js';
import { showToast } from './toast.js';

export const APP_VERSION = '1.7.0';


// ================================================================
//  应用控制器
// ================================================================
export class App {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new HashiRenderer(this.canvas);
        this.renderer.onChange = (game) => this._updateUI(game);

        this.seedInput = document.getElementById('seedInput');
        this.widthInput = document.getElementById('widthInput');
        this.heightInput = document.getElementById('heightInput');
        this.progressText = document.getElementById('progressText');
        this.progressFill = document.getElementById('progressFill');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.seedHash = document.getElementById('seedHash');
        this.canvasWrap = document.getElementById('canvasWrap');
        this.btnKnife = document.getElementById('btnKnife');
        this.btnAux = document.getElementById('btnAux');

        this.debug = false;
        this._bindControls();

        const verEl = document.getElementById('versionText');
        if (verEl) verEl.textContent = 'v' + APP_VERSION;

        this._loadFromHash();
        this._generate();

        window.addEventListener('resize', () => {
            const dpr = window.devicePixelRatio || 1;
            if (dpr !== this.renderer.dpr) {
                this.renderer._resize();
            }
        });

        document.getElementById('logo').addEventListener('dblclick', () => {
            const dp = document.getElementById('debugPanel');
            const willOpen = !dp.classList.contains('show');
            this._closeAllPanels();
            if (willOpen) {
                dp.classList.add('show');
                this.debug = true;
                this.debugPanel.refresh();
            }
        });

        this.btnAux.addEventListener('click', () => {
            this.renderer.auxDisplay = !this.renderer.auxDisplay;
            this.btnAux.classList.toggle('active', this.renderer.auxDisplay);
            if (this.game) this.renderer.render(this.game);
        });

        this.debugPanel = new DebugPanel(this)
    }

    _bindControls() {
        document.getElementById('btnGenerate').addEventListener('click', () => this._generate());
        document.getElementById('btnRandomSeed').addEventListener('click', () => {
            const seed = Math.floor(Math.random() * 2147483647);
            this.seedInput.value = seed;
            this._generate();
        });
        document.getElementById('btnResetBridges').addEventListener('click', () => {
            if (!this.game) return;
            this.game.resetBridges();
            this.renderer.render(this.game);
            this._updateUI(this.game);
            showToast('已清空所有桥梁', 'success');
        });
        document.getElementById('btnCheck').addEventListener('click', () => {
            if (!this.game) return;
            this._runCheck();
        });
        document.getElementById('btnSolve').addEventListener('click', () => {
            if (!this.game) return;
            if (this.game.solve()) {
                this.renderer.render(this.game);
                this._updateUI(this.game);
                showToast('🧩 求解成功！', 'success');
            } else {
                showToast('⚠️ 当前谜题无法用简单规则求解，请手动尝试', 'error');
            }
        });
        document.getElementById('btnImport').addEventListener('click', () => this._importCSV());
        document.getElementById('btnExport').addEventListener('click', () => this._exportCSV());
        document.getElementById('btnExportImage').addEventListener('click', () => this._exportImage());

        this.btnKnife.addEventListener('click', () => {
            const isKnife = this.renderer.mode === 'knife';
            this.renderer.mode = isKnife ? 'select' : 'knife';
            this.btnKnife.classList.toggle('active', !isKnife);
            this.canvasWrap.classList.toggle('knife', !isKnife);
            showToast(this.renderer.mode === 'knife' ? '🔪 美工刀已开启，滑动清除桥梁' : '🔧 已切换回选择模式', '');
        });

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const w = parseInt(btn.dataset.w);
                const h = parseInt(btn.dataset.h);
                this.widthInput.value = w;
                this.heightInput.value = h;
                this._generate();
            });
        });

        this.seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._generate(); });
        this.widthInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._generate(); });
        this.heightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._generate(); });

        // ===== 菜单 & 信息卡片 & 调试面板 =====
        const menuPanel = document.getElementById('menuPanel');
        const infoCard = document.getElementById('infoCard');
        const debugPanel = document.getElementById('debugPanel');
        const btnMenu = document.getElementById('btnMenu');
        const btnInfo = document.getElementById('btnInfo');

        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !menuPanel.classList.contains('show');
            this._closeAllPanels();
            if (willOpen) {
                menuPanel.classList.add('show');
                btnMenu.classList.add('active');
            }
        });

        btnInfo.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !infoCard.classList.contains('show');
            this._closeAllPanels();
            if (willOpen) {
                infoCard.classList.add('show');
                btnInfo.classList.add('active');
            }
        });

        // 点面板内部不冒泡关闭
        menuPanel.addEventListener('click', (e) => e.stopPropagation());
        infoCard.addEventListener('click', (e) => e.stopPropagation());
        debugPanel.addEventListener('click', (e) => e.stopPropagation());

        // 点别处关闭全部
        document.addEventListener('click', () => this._closeAllPanels());

        // ESC 关闭全部
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this._closeAllPanels();
        });
    }

    _closeAllPanels() {
        document.getElementById('menuPanel').classList.remove('show');
        document.getElementById('infoCard').classList.remove('show');
        document.getElementById('debugPanel').classList.remove('show');
        document.getElementById('btnMenu').classList.remove('active');
        document.getElementById('btnInfo').classList.remove('active');
        this.debug = false;
    }

    _runCheck() {
        if (!this.game) return;
        const game = this.game;
        const n = game.islands.length;
        const degree = Array(n).fill(0);
        for (const b of game.bridges) {
            degree[b.from] += b.count;
            degree[b.to] += b.count;
        }
        const mismatched = [];
        const matched = [];
        for (let i = 0; i < n; i++) {
            if (degree[i] === game.islands[i].number) {
                matched.push(i);
            } else {
                mismatched.push(i);
            }
        }

        this.renderer.stopFlash();

        if (mismatched.length > 0) {
            this.renderer.startFlash('red', mismatched);
            showToast(`有 ${mismatched.length} 个岛屿未完成`, 'error');
        } else {
            if (game.checkSolved()) {
                this.renderer.startFlash('blue', Array.from({ length: n }, (_, i) => i));
                showToast('🎉 全部完成！', 'success');
            } else {
                this.renderer.startFlash('green', Array.from({ length: n }, (_, i) => i));
                showToast('所有岛屿数字匹配，但桥梁未连通', '');
            }
        }
        this.debugPanel.refresh();
    }


    _generate() {
        const seedStr = this.seedInput.value.trim() || '20260905';
        const seed = hashString(seedStr);
        const w = parseInt(this.widthInput.value) || 7;
        const h = parseInt(this.heightInput.value) || 7;
        if (w < 4 || h < 4 || w > 256 || h > 256) {
            showToast('尺寸范围 4~256', 'error');
            return;
        }
        this.game = new HashiGame(w, h, seed);
        // 关键：同步游戏对象到渲染器
        this.renderer.game = this.game;
        this.renderer._resize();
        this.renderer.render(this.game);
        this._updateUI(this.game);
        this.seedHash.textContent = '#' + seed.toString(16).padStart(8, '0');
        const params = new URLSearchParams();
        params.set('seed', seedStr);
        params.set('w', w);
        params.set('h', h);
        history.replaceState(null, '', '?' + params.toString());
        showToast(`生成新棋盘 ${w}×${h} · 岛屿 ${this.game.islands.length} 个`, '');
        if (this.debug) this.debugPanel.refresh();
        this.renderer.stopFlash();
    }

    _loadFromHash() {
        const params = new URLSearchParams(window.location.search);
        const seed = params.get('seed');
        const w = params.get('w');
        const h = params.get('h');
        if (seed) this.seedInput.value = seed;
        if (w) this.widthInput.value = w;
        if (h) this.heightInput.value = h;
    }

    _getProgress() {
        if (!this.game) return { done: 0, total: 0 };
        const total = this.game.islands.length;
        let done = 0;
        for (let i = 0; i < total; i++) {
            if (this.game.getDegree(i) === this.game.islands[i].number) done++;
        }
        return { done, total };
    }

    _updateUI(game) {
        if (!game) return;
        const progress = this._getProgress();
        this.progressText.textContent = `${progress.done} / ${progress.total}`;
        const pct = progress.total > 0 ? (progress.done / progress.total * 100) : 0;
        this.progressFill.style.width = Math.min(100, pct) + '%';

        const solved = game.checkSolved();
        if (solved) {
            this.statusDot.className = 'dot green';
            this.statusText.textContent = '已完成 ✅';
        } else if (progress.done === progress.total && progress.total > 0) {
            this.statusDot.className = 'dot amber';
            this.statusText.textContent = '数字匹配，检查连通性';
        } else {
            this.statusDot.className = 'dot';
            this.statusText.textContent = `游戏中 (${progress.done}/${progress.total})`;
        }
        if (this.debug) this.debugPanel.refresh();
    }

    _exportCSV() {
        if (!this.game) return;
        const csv = this.game.toCSV();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const seed = this.seedInput.value.trim() || 'unknown';
        a.download = `hashi_${seed}_${this.game.width}x${this.game.height}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('📥 CSV 导出成功', 'success');
    }

    _exportImage() {
        if (!this.game) return;
        const canvas = this.renderer.canvas;
        const link = document.createElement('a');
        link.download = `hashi_${this.seedInput.value.trim() || 'unknown'}_${this.game.width}x${this.game.height}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('🖼️ 图片导出成功', 'success');
    }

    _importCSV() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const csv = ev.target.result;
                const w = parseInt(this.widthInput.value) || 7;
                const h = parseInt(this.heightInput.value) || 7;
                const seedStr = this.seedInput.value.trim() || '20260905';
                const seed = hashString(seedStr);
                const game = HashiGame.fromCSV(csv, w, h, seed);
                if (!game) {
                    showToast('⚠️ CSV 格式无效，请检查', 'error');
                    return;
                }
                this.game = game;
                this.renderer._resize();
                this.renderer.render(this.game);
                this._updateUI(this.game);
                this.seedHash.textContent = '#' + seed.toString(16).padStart(8, '0');
                showToast('📂 CSV 导入成功！', 'success');
            };
            reader.readAsText(file);
        };
        input.click();
    }
}
