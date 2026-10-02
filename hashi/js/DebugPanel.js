import { showToast } from './toast.js';

export class DebugPanel {
    constructor(app) {
        this.app = app;              // 通过 app 访问 game / renderer / debug 标志
        this._bindControls();
    }

    _bindControls() {
        const config = this.app.renderer.config;
        const renderer = this.app.renderer;

        // 格子大小
        const bindCellSize = () => {
            const slider = document.getElementById('cfgCellSize');
            const num = document.getElementById('cfgCellSizeNum');
            if (!slider || !num) return;
            const update = () => {
                const val = parseInt(num.value);
                if (isNaN(val)) return;
                slider.value = val;
                renderer.cellSize = val;
                renderer._resize();
                this.refresh();
            };
            slider.addEventListener('input', () => {
                const val = parseInt(slider.value);
                num.value = val;
                renderer.cellSize = val;
                renderer._resize();
                this.refresh();
            });
            num.addEventListener('input', update);
            slider.value = renderer.cellSize;
            num.value = renderer.cellSize;
        };
        bindCellSize();

        // 其他配置
        const bindSliderNumber = (sliderId, numId, key, formatter = v => parseFloat(v)) => {
            const slider = document.getElementById(sliderId);
            const num = document.getElementById(numId);
            if (!slider || !num) return;
            const update = () => {
                const val = formatter(num.value);
                slider.value = val;
                config[key] = val;
                renderer.updateConfig({ [key]: val });
                this.refresh();
            };
            slider.addEventListener('input', () => {
                const val = parseFloat(slider.value);
                num.value = val;
                config[key] = val;
                renderer.updateConfig({ [key]: val });
                this.refresh();
            });
            num.addEventListener('input', () => {
                let val = parseFloat(num.value);
                if (isNaN(val)) return;
                if (key === 'islandRadiusScale') val = Math.min(0.5, Math.max(0.1, val));
                else if (key === 'bridgeLineWidth') val = Math.min(8, Math.max(1, val));
                else if (key === 'coordFontSize') val = Math.min(28, Math.max(8, val));
                slider.value = val;
                config[key] = val;
                renderer.updateConfig({ [key]: val });
                this.refresh();
            });
            slider.value = config[key];
            num.value = config[key];
        };
        bindSliderNumber('cfgBridgeWidth', 'cfgBridgeWidthNum', 'bridgeLineWidth');
        bindSliderNumber('cfgCoordSize', 'cfgCoordSizeNum', 'coordFontSize');
        bindSliderNumber('cfgIslandSize', 'cfgIslandSizeNum', 'islandRadiusScale');

        const padSlider = document.getElementById('cfgPadding');
        const padNum = document.getElementById('cfgPaddingNum');
        padSlider.addEventListener('input', () => {
            const val = parseInt(padSlider.value);
            padNum.value = val;
            renderer.padding = val;
            renderer._resize();
            this.refresh();
        });
        padNum.addEventListener('input', () => {
            let val = parseInt(padNum.value);
            if (isNaN(val)) return;
            val = Math.min(80, Math.max(20, val));
            padSlider.value = val;
            renderer.padding = val;
            renderer._resize();
            this.refresh();
        });

        document.getElementById('debugResetDefaults').addEventListener('click', () => {
            const defaults = {
                bridgeLineWidth: 4,
                coordFontSize: 16,
                islandRadiusScale: 0.20,
            };
            Object.assign(config, defaults);
            renderer.cellSize = 40;
            renderer.padding = 45;
            document.getElementById('cfgCellSize').value = 40;
            document.getElementById('cfgCellSizeNum').value = 40;
            document.getElementById('cfgBridgeWidth').value = defaults.bridgeLineWidth;
            document.getElementById('cfgBridgeWidthNum').value = defaults.bridgeLineWidth;
            document.getElementById('cfgCoordSize').value = defaults.coordFontSize;
            document.getElementById('cfgCoordSizeNum').value = defaults.coordFontSize;
            document.getElementById('cfgIslandSize').value = defaults.islandRadiusScale;
            document.getElementById('cfgIslandSizeNum').value = defaults.islandRadiusScale;
            document.getElementById('cfgPadding').value = 45;
            document.getElementById('cfgPaddingNum').value = 45;
            renderer.updateConfig(defaults);
            renderer._resize();
            this.refresh();
            showToast('视觉配置已重置为默认', 'success');
        });

        document.getElementById('debugRefreshState').addEventListener('click', () => this.refresh());

        document.getElementById('dbgShowIsolated').addEventListener('click', () => {
            if (!this.app.game) return;
            const isolated = [];
            for (let i = 0; i < this.app.game.islands.length; i++) {
                if (this.app.game.getDegree(i) === 0) isolated.push(i);
            }
            if (isolated.length) {
                showToast(`孤立岛索引: ${isolated.join(', ')}`, 'error');
            } else {
                showToast('没有孤立岛屿', 'success');
            }
        });
        document.getElementById('dbgForceConnect').addEventListener('click', () => {
            if (!this.app.game) return;
            let added = 0;
            for (let i = 0; i < this.app.game.islands.length; i++) {
                if (this.app.game.getDegree(i) === 0) {
                    let best = -1, bestDist = Infinity;
                    for (let j = 0; j < this.app.game.islands.length; j++) {
                        if (i === j) continue;
                        const a = this.app.game.islands[i], b = this.app.game.islands[j];
                        if (a.x === b.x || a.y === b.y) {
                            const dist = a.x === b.x ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x);
                            if (dist < bestDist) { bestDist = dist; best = j; }
                        }
                    }
                    if (best !== -1) {
                        const existing = this.app.game.getBridgeBetween(i, best);
                        if (existing) {
                            if (existing.count < 2) { existing.count++; added++; }
                        } else {
                            this.app.game.bridges.push({ from: i, to: best, count: 1 });
                            added++;
                        }
                    }
                }
            }
            if (added) {
                this.app.renderer.render(this.app.game);
                this.app._updateUI(this.app.game);
                showToast(`强制添加了 ${added} 座桥`, 'success');
            } else {
                showToast('没有需要连接的孤立岛', '');
            }
        });
        document.getElementById('dbgLogState').addEventListener('click', () => {
            if (!this.app.game) return;
            console.log('岛屿:', this.app.game.islands.map((p, i) => ({ idx: i, ...p, degree: this.app.game.getDegree(i) })));
            console.log('桥梁:', this.app.game.bridges);
            console.log('已解决?', this.app.game.checkSolved());
            showToast('状态已输出到控制台', '');
        });
    }

    refresh() {
        const info = document.getElementById('debugStateInfo');
        if (!this.app.game) {
            info.textContent = '无游戏数据';
            return;
        }
        const progress = this.app._getProgress();
        const solved = this.app.game.checkSolved();
        const lines = [
            `岛屿: ${this.app.game.islands.length}`,
            `进度: ${progress.done}/${progress.total}`,
            `状态: ${solved ? '✅ 已解决' : '🔄 进行中'}`,
            `桥数: ${this.app.game.bridges.length}`,
            `格子大小: ${this.app.renderer.cellSize}px`,
            `边距: ${this.app.renderer.padding}px`,
        ];
        info.textContent = lines.join('\n');
    }
}