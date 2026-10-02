import { mulberry32, shuffle, clone } from './utils.js';

// ================================================================
//  游戏核心 (不变)
// ================================================================
export class HashiGame {
    constructor(width, height, seed) {
        this.width = Math.max(4, width | 0);
        this.height = Math.max(4, height | 0);
        this.seed = seed >>> 0;
        this.islands = [];
        this.bridges = [];
        this.selected = null;
        this.solvedState = null;
        this.rng = mulberry32(this.seed);
        this._generate();
    }

    _generate() {
        const w = this.width,
            h = this.height;
        const rng = this.rng;
        const totalCells = w * h;
        let density = 0.22 + rng() * 0.08;
        if (totalCells > 10000) density = 0.18 + rng() * 0.06;
        if (totalCells > 40000) density = 0.14 + rng() * 0.05;
        let targetCount = Math.max(5, Math.floor(totalCells * density));
        targetCount = Math.min(targetCount, Math.floor(totalCells * 0.40));

        const occupied = new Set();
        const key = (x, y) => x + ',' + y;
        const isOccupied = (x, y) => occupied.has(key(x, y));

        const islands = [];
        const answerBridges = [];

        let startX = Math.floor(rng() * w);
        let startY = Math.floor(rng() * h);
        let attempts = 0;
        while (attempts < 200) {
            let hasDir = false;
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            for (const [dx, dy] of dirs) {
                for (let dist = 2; dist < Math.max(w, h); dist++) {
                    const nx = startX + dx * dist, ny = startY + dy * dist;
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
                    let free = true;
                    for (let d = 1; d <= dist; d++) {
                        const cx = startX + dx * d, cy = startY + dy * d;
                        if (isOccupied(cx, cy)) { free = false; break; }
                    }
                    if (free) { hasDir = true; break; }
                }
                if (hasDir) break;
            }
            if (hasDir) break;
            startX = Math.floor(rng() * w);
            startY = Math.floor(rng() * h);
            attempts++;
        }

        const startId = 0;
        islands.push({ x: startX, y: startY, id: startId });
        occupied.add(key(startX, startY));

        const queue = [startId];
        let maxIter = 0;
        while (islands.length < targetCount && queue.length > 0 && maxIter < 2000) {
            maxIter++;
            const idx = queue.shift();
            const cur = islands[idx];
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            let available = [];
            for (const [dx, dy] of dirs) {
                for (let dist = 2; dist < Math.max(w, h); dist++) {
                    const nx = cur.x + dx * dist, ny = cur.y + dy * dist;
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
                    let free = true;
                    for (let d = 1; d <= dist; d++) {
                        const cx = cur.x + dx * d, cy = cur.y + dy * d;
                        if (isOccupied(cx, cy)) { free = false; break; }
                    }
                    if (free) {
                        available.push({ dx, dy, dist, nx, ny });
                    } else {
                        break;
                    }
                }
            }
            shuffle(available, rng);
            const maxExtend = Math.min(available.length, targetCount - islands.length);
            if (maxExtend <= 0) continue;
            let extendCount = 1 + Math.floor(rng() * Math.min(maxExtend, 3));
            extendCount = Math.min(extendCount, maxExtend);
            for (let i = 0; i < extendCount && islands.length < targetCount; i++) {
                const dir = available[i];
                let free = true;
                for (let d = 1; d <= dir.dist; d++) {
                    const cx = cur.x + dir.dx * d, cy = cur.y + dir.dy * d;
                    if (isOccupied(cx, cy)) { free = false; break; }
                }
                if (!free) continue;
                const newId = islands.length;
                islands.push({ x: dir.nx, y: dir.ny, id: newId });
                for (let d = 1; d <= dir.dist; d++) {
                    const cx = cur.x + dir.dx * d, cy = cur.y + dir.dy * d;
                    occupied.add(key(cx, cy));
                }
                answerBridges.push({ from: idx, to: newId, count: 1 });
                queue.push(newId);
            }
        }

        if (islands.length < 4) {
            for (let y = 0; y < h && islands.length < 6; y++) {
                for (let x = 0; x < w && islands.length < 6; x++) {
                    if (!isOccupied(x, y)) {
                        let best = -1, bestDist = Infinity;
                        for (let i = 0; i < islands.length; i++) {
                            const a = islands[i];
                            if (a.x === x || a.y === y) {
                                const dist = a.x === x ? Math.abs(a.y - y) : Math.abs(a.x - x);
                                if (dist >= 2 && dist < bestDist) {
                                    let free = true;
                                    if (a.x === x) {
                                        const x0 = a.x;
                                        const yMin = Math.min(a.y, y), yMax = Math.max(a.y, y);
                                        for (let yy = yMin + 1; yy < yMax; yy++) {
                                            if (isOccupied(x0, yy)) { free = false; break; }
                                        }
                                    } else {
                                        const y0 = a.y;
                                        const xMin = Math.min(a.x, x), xMax = Math.max(a.x, x);
                                        for (let xx = xMin + 1; xx < xMax; xx++) {
                                            if (isOccupied(xx, y0)) { free = false; break; }
                                        }
                                    }
                                    if (free) { bestDist = dist; best = i; }
                                }
                            }
                        }
                        if (best !== -1) {
                            const newId = islands.length;
                            islands.push({ x, y, id: newId });
                            const a = islands[best];
                            if (a.x === x) {
                                const x0 = a.x;
                                const yMin = Math.min(a.y, y), yMax = Math.max(a.y, y);
                                for (let yy = yMin + 1; yy < yMax; yy++) occupied.add(key(x0, yy));
                            } else {
                                const y0 = a.y;
                                const xMin = Math.min(a.x, x), xMax = Math.max(a.x, x);
                                for (let xx = xMin + 1; xx < xMax; xx++) occupied.add(key(xx, y0));
                            }
                            occupied.add(key(x, y));
                            answerBridges.push({ from: best, to: newId, count: 1 });
                        }
                    }
                }
            }
        }

        const n = islands.length;
        const candidates = [];
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const a = islands[i], b = islands[j];
                if (a.x === b.x || a.y === b.y) {
                    const dist = a.x === b.x ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x);
                    if (dist < 2) continue;
                    let blocked = false;
                    if (a.x === b.x) {
                        const x0 = a.x;
                        const yMin = Math.min(a.y, b.y), yMax = Math.max(a.y, b.y);
                        for (let yy = yMin + 1; yy < yMax; yy++) {
                            if (occupied.has(key(x0, yy))) { blocked = true; break; }
                        }
                    } else {
                        const y0 = a.y;
                        const xMin = Math.min(a.x, b.x), xMax = Math.max(a.x, b.x);
                        for (let xx = xMin + 1; xx < xMax; xx++) {
                            if (occupied.has(key(xx, y0))) { blocked = true; break; }
                        }
                    }
                    if (!blocked) candidates.push({ from: i, to: j, dist });
                }
            }
        }
        shuffle(candidates, rng);
        const extraCount = Math.min(candidates.length, Math.floor(rng() * 3) + 1);
        let addedExtra = 0;
        for (const e of candidates) {
            if (addedExtra >= extraCount) break;
            let pathFree = true;
            const a = islands[e.from], b = islands[e.to];
            if (a.x === b.x) {
                const x0 = a.x;
                const yMin = Math.min(a.y, b.y), yMax = Math.max(a.y, b.y);
                for (let yy = yMin + 1; yy < yMax; yy++) {
                    if (occupied.has(key(x0, yy))) { pathFree = false; break; }
                }
            } else {
                const y0 = a.y;
                const xMin = Math.min(a.x, b.x), xMax = Math.max(a.x, b.x);
                for (let xx = xMin + 1; xx < xMax; xx++) {
                    if (occupied.has(key(xx, y0))) { pathFree = false; break; }
                }
            }
            if (pathFree) {
                const count = rng() < 0.5 ? 2 : 1;
                let exists = false;
                for (const br of answerBridges) {
                    if ((br.from === e.from && br.to === e.to) || (br.from === e.to && br.to === e.from)) {
                        exists = true; break;
                    }
                }
                if (!exists) {
                    answerBridges.push({ from: e.from, to: e.to, count });
                    if (a.x === b.x) {
                        const x0 = a.x;
                        const yMin = Math.min(a.y, b.y), yMax = Math.max(a.y, b.y);
                        for (let yy = yMin + 1; yy < yMax; yy++) occupied.add(key(x0, yy));
                    } else {
                        const y0 = a.y;
                        const xMin = Math.min(a.x, b.x), xMax = Math.max(a.x, b.x);
                        for (let xx = xMin + 1; xx < xMax; xx++) occupied.add(key(xx, y0));
                    }
                    addedExtra++;
                }
            }
        }

        const deg = Array(n).fill(0);
        for (const br of answerBridges) {
            deg[br.from] += br.count;
            deg[br.to] += br.count;
        }
        for (let i = 0; i < n; i++) {
            islands[i].number = Math.min(8, Math.max(1, deg[i]));
        }

        this.islands = islands;
        this.bridges = [];
        this.solvedState = {
            islands: clone(islands),
            bridges: clone(answerBridges)
        };
        this.selected = null;
    }

    getDegree(idx) {
        let d = 0;
        for (const b of this.bridges) {
            if (b.from === idx) d += b.count;
            if (b.to === idx) d += b.count;
        }
        return d;
    }

    getBridgeBetween(a, b) {
        for (const br of this.bridges) {
            if ((br.from === a && br.to === b) || (br.from === b && br.to === a)) return br;
        }
        return null;
    }

    canBuildNewBridge(fromIdx, toIdx) {
        if (fromIdx === toIdx) return false;
        const a = this.islands[fromIdx], b = this.islands[toIdx];
        if (a.x !== b.x && a.y !== b.y) return false;
        const dist = a.x === b.x ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x);
        if (dist < 2) return false;
        for (let i = 0; i < this.islands.length; i++) {
            if (i === fromIdx || i === toIdx) continue;
            const c = this.islands[i];
            if (a.x === b.x) {
                if (c.x === a.x && c.y > Math.min(a.y, b.y) && c.y < Math.max(a.y, b.y)) return false;
            } else {
                if (c.y === a.y && c.x > Math.min(a.x, b.x) && c.x < Math.max(a.x, b.x)) return false;
            }
        }
        const occupied = new Set();
        for (const br of this.bridges) {
            const f = this.islands[br.from], t = this.islands[br.to];
            if (f.x === t.x) {
                const x = f.x;
                const yMin = Math.min(f.y, t.y), yMax = Math.max(f.y, t.y);
                for (let y = yMin + 1; y < yMax; y++) occupied.add(x + ',' + y);
            } else {
                const y = f.y;
                const xMin = Math.min(f.x, t.x), xMax = Math.max(f.x, t.x);
                for (let x = xMin + 1; x < xMax; x++) occupied.add(x + ',' + y);
            }
        }
        if (a.x === b.x) {
            const x = a.x;
            const yMin = Math.min(a.y, b.y), yMax = Math.max(a.y, b.y);
            for (let y = yMin + 1; y < yMax; y++) {
                if (occupied.has(x + ',' + y)) return false;
            }
        } else {
            const y = a.y;
            const xMin = Math.min(a.x, b.x), xMax = Math.max(a.x, b.x);
            for (let x = xMin + 1; x < xMax; x++) {
                if (occupied.has(x + ',' + y)) return false;
            }
        }
        if (this.getDegree(fromIdx) >= 8) return false;
        if (this.getDegree(toIdx) >= 8) return false;
        return true;
    }

    addBridge(fromIdx, toIdx) {
        const existing = this.getBridgeBetween(fromIdx, toIdx);
        if (existing) {
            if (existing.count >= 2) return false;
            existing.count++;
        } else {
            if (!this.canBuildNewBridge(fromIdx, toIdx)) return false;
            this.bridges.push({ from: fromIdx, to: toIdx, count: 1 });
        }
        this.selected = null;
        return true;
    }

    removeAllBridges(fromIdx, toIdx) {
        let removed = 0;
        while (this.getBridgeBetween(fromIdx, toIdx)) {
            const existing = this.getBridgeBetween(fromIdx, toIdx);
            if (existing.count > 1) {
                existing.count--;
            } else {
                const idx = this.bridges.indexOf(existing);
                if (idx !== -1) this.bridges.splice(idx, 1);
            }
            removed++;
        }
        return removed;
    }

    removeBridge(fromIdx, toIdx) {
        const existing = this.getBridgeBetween(fromIdx, toIdx);
        if (!existing) return false;
        if (existing.count > 1) {
            existing.count--;
        } else {
            const idx = this.bridges.indexOf(existing);
            if (idx !== -1) this.bridges.splice(idx, 1);
        }
        this.selected = null;
        return true;
    }

    resetBridges() {
        this.bridges = [];
        this.selected = null;
    }

    checkSolved() {
        for (let i = 0; i < this.islands.length; i++) {
            if (this.getDegree(i) !== this.islands[i].number) return false;
        }
        const n = this.islands.length;
        if (n === 0) return false;
        const parent = Array.from({ length: n }, (_, i) => i);
        const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
        for (const b of this.bridges) union(b.from, b.to);
        const root = find(0);
        for (let i = 1; i < n; i++) { if (find(i) !== root) return false; }
        return true;
    }

    toCSV() {
        let lines = ['x,y,number'];
        for (const island of this.islands) {
            lines.push(`${island.x},${island.y},${island.number}`);
        }
        return lines.join('\n');
    }

    static fromCSV(csv, width, height, seed) {
        const lines = csv.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('x,'));
        const islands = [];
        const used = new Set();
        for (const line of lines) {
            const parts = line.split(',').map(s => s.trim());
            if (parts.length < 3) continue;
            const x = parseInt(parts[0]), y = parseInt(parts[1]), num = parseInt(parts[2]);
            if (isNaN(x) || isNaN(y) || isNaN(num)) continue;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const key = x + ',' + y;
            if (used.has(key)) continue;
            used.add(key);
            islands.push({ x, y, number: Math.min(8, Math.max(1, num)) });
        }
        if (islands.length < 2) return null;
        const game = new HashiGame(width, height, seed || 0);
        game.islands = islands.map((p, idx) => ({ ...p, id: idx }));
        game.bridges = [];
        game.selected = null;
        game.solvedState = null;
        return game;
    }

    solve() {
        if (this.solvedState && this.solvedState.bridges) {
            this.bridges = clone(this.solvedState.bridges);
            return this.checkSolved();
        }
        const backup = {
            islands: clone(this.islands),
            bridges: clone(this.bridges),
        };
        let changed = true, iter = 0;
        while (changed && iter < 200) {
            changed = false;
            iter++;
            const n = this.islands.length;
            const degree = Array(n).fill(0);
            for (const b of this.bridges) {
                degree[b.from] += b.count;
                degree[b.to] += b.count;
            }
            const need = Array(n).fill(0);
            for (let i = 0; i < n; i++) need[i] = this.islands[i].number - degree[i];
            for (let i = 0; i < n; i++) {
                if (need[i] <= 0) continue;
                const candidates = [];
                for (let j = 0; j < n; j++) {
                    if (i === j) continue;
                    if (this.canBuildNewBridge(i, j)) {
                        const existing = this.getBridgeBetween(i, j);
                        if (existing) { if (existing.count < 2) candidates.push(j); } else candidates.push(j);
                    }
                }
                if (candidates.length > 0 && candidates.length <= need[i]) {
                    for (const j of candidates) {
                        const existing = this.getBridgeBetween(i, j);
                        if (existing) { if (existing.count < 2) { existing.count++; changed = true; } } else { this.bridges.push({ from: i, to: j, count: 1 }); changed = true; }
                    }
                }
            }
        }
        const solved = this.checkSolved();
        if (!solved) {
            this.islands = backup.islands;
            this.bridges = backup.bridges;
            return false;
        }
        return true;
    }
}
