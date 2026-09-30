import { _decorator, Component, Node, Vec2, Vec3, Color, UITransform, Graphics, UIRenderer } from 'cc';
const { ccclass, property } = _decorator;

import { LevelConfig, TowerSpot, Obstacle, ObstacleType, OBSTACLE_DEFS } from '../Data/LevelData';

export enum CellType {
    EMPTY = 0,
    PATH = 1,
    TOWER_SPOT = 2,
    BLOCKED = 3,
    /** 障碍物占格（大小由对应 Obstacle 决定，摧毁后变为可建造格） */
    OBSTACLE = 4,
}

@ccclass('MapManager')
export class MapManager extends Component {
    private static _instance: MapManager | null = null;

    public static get instance(): MapManager {
        return this._instance;
    }

    private grid: CellType[][] = [];
    private levelConfig: LevelConfig | null = null;
    private cellSize: number = 64;
    private offsetX: number = 0;
    private offsetY: number = 0;
    private towerSpotNodes: Map<string, Node> = new Map();
    private towerNodes: Map<string, Node> = new Map();
    private obstacleNodes: Map<string, Node> = new Map();
    private obstacleNodesList: Node[] = [];
    /** 计算后的障碍物集合（显式 + 遗留粉色格 + 空白格默认小障碍） */
    private obstacles: Obstacle[] = [];
    /** 玩家手动点击标记攻击的障碍物 */
    private markedObstacleNode: Node | null = null;
    /** 玩家手动点击标记「优先攻击」的敌人（再点一次同一敌人即恢复默认索敌） */
    private markedEnemyNode: Node | null = null;
    /** 预计算的敌人路径（init 后不可变，避免每生成/分裂一个敌人就重建一次数组） */
    private cachedWorldPath: Vec3[] = [];
    /** 路线连通表：每格相对其「真实行进邻居」的开向（n/s/e/w）。
     *  与网格连通不同——网格里紧邻的两段路径在路线上可能并不相连，
     *  用路线连通绘制道路可消除宽道拐角处出现的假 T/十字（"T 字形拐角"）。 */
    private routeLink: Map<string, { n: boolean; s: boolean; e: boolean; w: boolean }> = new Map();

    onLoad(): void {
        MapManager._instance = this;
    }

    onDestroy(): void {
        if (MapManager._instance === this) {
            MapManager._instance = null;
        }
    }

    public init(config: LevelConfig): void {
        this.levelConfig = config;
        this.cellSize = config.cellSize;
        this.grid = [];
        this.towerSpotNodes.clear();
        this.towerNodes.clear();
        this.obstacleNodes.clear();
        this.obstacleNodesList = [];
        this.obstacles = [];
        this.markedObstacleNode = null;
        this.markedEnemyNode = null;

        for (let r = 0; r < config.rows; r++) {
            this.grid[r] = [];
            for (let c = 0; c < config.cols; c++) {
                this.grid[r][c] = CellType.EMPTY;
            }
        }

        this.markPath(config.path);
        this.buildRouteLinks(config.path);
        // 所有塔位直接标记（旧版 bonus→粉色砖逻辑已废弃）
        const directSpots = config.towerSpots;
        this.markTowerSpots(directSpots);
        this.markObstacles(config);

        // offsetX = 左边界（col 向右递增）；offsetY = 上边界（row 0 在顶部，row 向下递增）
        this.offsetX = -(config.cols * this.cellSize) / 2;
        this.offsetY = (config.rows * this.cellSize) / 2;

        this.updateTowerSpotPositions();
        this.cachedWorldPath = this.buildWorldPath();
    }

    private buildWorldPath(): Vec3[] {
        if (!this.levelConfig) return [];
        return this.levelConfig.path.map(p => {
            const x = this.offsetX + p.x * this.cellSize + this.cellSize / 2;
            const y = this.offsetY - p.y * this.cellSize - this.cellSize / 2;
            return new Vec3(x, y, 0);
        });
    }

    private markPath(path: Vec2[]): void {
        if (!this.levelConfig) return;
        for (let i = 0; i < path.length - 1; i++) {
            const start = path[i];
            const end = path[i + 1];
            const r0 = Math.round(start.y);
            const c0 = Math.round(start.x);
            const r1 = Math.round(end.y);
            const c1 = Math.round(end.x);

            if (r0 === r1) {
                const minC = Math.max(0, Math.min(c0, c1));
                const maxC = Math.min(this.levelConfig.cols - 1, Math.max(c0, c1));
                for (let c = minC; c <= maxC; c++) {
                    if (r0 >= 0 && r0 < this.levelConfig.rows) {
                        this.grid[r0][c] = CellType.PATH;
                    }
                }
            } else if (c0 === c1) {
                const minR = Math.max(0, Math.min(r0, r1));
                const maxR = Math.min(this.levelConfig.rows - 1, Math.max(r0, r1));
                for (let r = minR; r <= maxR; r++) {
                    if (c0 >= 0 && c0 < this.levelConfig.cols) {
                        this.grid[r][c0] = CellType.PATH;
                    }
                }
            }
        }
    }

    /**
     * 根据航点折线预计算「路线连通表」：每个 PATH 格仅标记其真实行进方向上的邻居。
     * 这样道路瓦片只画怪物真正会走的连接，避免网格上相邻、但路线上并不相连处
     * 出现假 T/十字（宽道拐角的 "T 字形拐角"）。
     */
    private buildRouteLinks(path: Vec2[]): void {
        this.routeLink = new Map();
        if (!path || path.length < 2) return;
        const set = (r: number, c: number, dir: 'n' | 's' | 'e' | 'w') => {
            const k = `${r}_${c}`;
            const o = this.routeLink.get(k) ?? { n: false, s: false, e: false, w: false };
            o[dir] = true;
            this.routeLink.set(k, o);
        };
        // 1) 按 markPath 同样的轴对齐逻辑展开为有序格序列。
        //    必须沿「行进方向」逐格填充，而不是按坐标升序——否则向西/向北的
        //    航点段会被反向填充，导致 clean 序列里出现对角步，进而使相邻连接
        //    错乱、产生假 T/十字与断裂（2-wide 回折关卡尤其明显）。
        const ordered: { r: number; c: number }[] = [];
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const r0 = Math.round(a.y), c0 = Math.round(a.x);
            const r1 = Math.round(b.y), c1 = Math.round(b.x);
            if (r0 === r1) {
                const step = c1 >= c0 ? 1 : -1;
                for (let c = c0; ; c += step) {
                    ordered.push({ r: r0, c });
                    if (c === c1) break;
                }
            } else if (c0 === c1) {
                const step = r1 >= r0 ? 1 : -1;
                for (let r = r0; ; r += step) {
                    ordered.push({ r, c: c0 });
                    if (r === r1) break;
                }
            }
        }
        // 2) 去掉相邻重复格（共享航点），得到严格连续序列
        const clean = ordered.filter(
            (p, idx) => idx === 0 || p.r !== ordered[idx - 1].r || p.c !== ordered[idx - 1].c
        );
        // 3) 连续两格之间即为路线连通（带互易）。重访格（环岛/折叠处路径
        //    真实多次穿行）会自然得到 T/十字——那是真实岔口，属正常、保留。
        for (let i = 0; i < clean.length - 1; i++) {
            const a = clean[i], b = clean[i + 1];
            if (b.r === a.r - 1) { set(a.r, a.c, 'n'); set(b.r, b.c, 's'); }
            else if (b.r === a.r + 1) { set(a.r, a.c, 's'); set(b.r, b.c, 'n'); }
            else if (b.c === a.c + 1) { set(a.r, a.c, 'e'); set(b.r, b.c, 'w'); }
            else if (b.c === a.c - 1) { set(a.r, a.c, 'w'); set(b.r, b.c, 'e'); }
        }
    }

    private markTowerSpots(spots: TowerSpot[]): void {
        for (const spot of spots) {
            if (spot.row >= 0 && spot.row < this.grid.length &&
                spot.col >= 0 && spot.col < this.grid[0].length) {
                this.grid[spot.row][spot.col] = CellType.TOWER_SPOT;
            }
        }
    }

    /** 标记障碍物占格，并返回该障碍覆盖的格子列表 */
    private coveredCellsOf(ob: Obstacle): { row: number; col: number }[] {
        const def = OBSTACLE_DEFS[ob.type ?? ObstacleType.ROCK_SMALL];
        const cells: { row: number; col: number }[] = [];
        for (let r = 0; r < def.h; r++) {
            for (let c = 0; c < def.w; c++) {
                cells.push({ row: ob.row + r, col: ob.col + c });
            }
        }
        return cells;
    }

    /**
     * 布置障碍物：
     * 1) 显式障碍（config.obstacles）——覆盖到路径/塔位/越界/重叠时整块跳过；
     * 2) 剩余空白格（EMPTY）自动成为 1×1 小岩石障碍（"把不可建造地砖设置为障碍物"，摧毁给 75 金币）。
     */
    private markObstacles(config: LevelConfig): void {
        const explicit: Obstacle[] = [];
        for (const o of config.obstacles ?? []) {
            explicit.push({ row: o.row, col: o.col, type: o.type ?? ObstacleType.ROCK_SMALL, fortress: o.fortress === true });
        }
        // 注：旧的 bonus 塔位→粉色砖逻辑已废弃，bonus 塔位现在等同普通塔位

        for (const ob of explicit) {
            const cells = this.coveredCellsOf(ob);
            let valid = true;
            for (const cell of cells) {
                if (!this.grid[cell.row] || this.grid[cell.row][cell.col] === undefined) { valid = false; break; }
                const t = this.grid[cell.row][cell.col];
                if (t === CellType.PATH || t === CellType.TOWER_SPOT || t === CellType.OBSTACLE) { valid = false; break; }
            }
            if (!valid) continue;
            for (const cell of cells) {
                this.grid[cell.row][cell.col] = CellType.OBSTACLE;
            }
            this.obstacles.push(ob);
        }

        // 空白格默认 1×1 小岩石障碍
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[r].length; c++) {
                if (this.grid[r][c] === CellType.EMPTY) {
                    this.grid[r][c] = CellType.OBSTACLE;
                    this.obstacles.push({ row: r, col: c, type: ObstacleType.ROCK_SMALL });
                }
            }
        }
    }

    private updateTowerSpotPositions(): void {
        if (!this.levelConfig) return;
        for (const spot of this.levelConfig.towerSpots) {
            spot.x = this.offsetX + spot.col * this.cellSize + this.cellSize / 2;
            spot.y = this.offsetY - spot.row * this.cellSize - this.cellSize / 2;
        }
    }

    /**
     * 网格 → 世界坐标。
     * row 0 在**顶部**（与创作者画网格图的顺序一致），col 0 在左侧。
     */
    public gridToWorld(row: number, col: number): Vec3 {
        const x = this.offsetX + col * this.cellSize + this.cellSize / 2;
        const y = this.offsetY - row * this.cellSize - this.cellSize / 2;
        return new Vec3(x, y, 0);
    }

    /** 世界坐标 → 网格（gridToWorld 的逆运算） */
    public worldToGrid(worldPos: Vec3): { row: number; col: number } {
        const col = Math.floor((worldPos.x - this.offsetX) / this.cellSize);
        const row = Math.floor((this.offsetY - worldPos.y) / this.cellSize);
        return { row, col };
    }

    public getCellType(row: number, col: number): CellType {
        if (!this.grid || !this.grid[row]) return CellType.BLOCKED;
        if (col < 0 || col >= this.grid[0].length) return CellType.BLOCKED;
        return this.grid[row][col];
    }

    /**
     * 根据相邻 PATH 格的连接方向，返回对应的道路瓦片 key（覆盖全部 16 种连接组合）。
     * 直行×2、拐角×4、T 字岔×4、十字×1、端点×4、孤立×1。
     * 优先读「真实行进路线」连通表：网格紧邻的两段路径在路线上未必相连，
     * 用路线连通可消除宽道拐角处出现的假 T/十字（"T 字形拐角"），道路只画怪真正会走的连接。
     */
    public getRoadTileKey(row: number, col: number): string {
        const link = this.routeLink.get(`${row}_${col}`);
        let n = false, s = false, e = false, w = false;
        if (link) {
            n = link.n; s = link.s; e = link.e; w = link.w;
        } else {
            const isPath = (r: number, c: number) => this.getCellType(r, c) === CellType.PATH;
            n = isPath(row - 1, col); s = isPath(row + 1, col);
            e = isPath(row, col + 1); w = isPath(row, col - 1);
        }
        // 端点（仅 1 个邻格）
        if (n && !s && !e && !w) return 'road_end_N';
        if (s && !n && !e && !w) return 'road_end_S';
        if (e && !n && !s && !w) return 'road_end_E';
        if (w && !n && !s && !e) return 'road_end_W';
        if (!n && !s && !e && !w) return 'road_single';
        // 直行（2 个对向邻格）
        if (n && s && !e && !w) return 'road_straight_v';
        if (e && w && !n && !s) return 'road_straight_h';
        // 拐角（2 个相邻邻格）
        if (n && e && !s && !w) return 'road_corner_NE';
        if (n && w && !s && !e) return 'road_corner_NW';
        if (s && e && !n && !w) return 'road_corner_SE';
        if (s && w && !n && !e) return 'road_corner_SW';
        // T 字岔（3 个邻格，缺一个方向）
        if (!n && s && e && w) return 'road_T_N';
        if (n && !s && e && w) return 'road_T_S';
        if (n && s && !e && w) return 'road_T_E';
        if (n && s && e && !w) return 'road_T_W';
        // 十字（4 个邻格）
        if (n && s && e && w) return 'road_cross';
        // 兜底（理论上不会到达）
        if (n || s) return 'road_straight_v';
        return 'road_straight_h';
    }

    public setCellType(row: number, col: number, type: CellType): void {
        if (this.grid && this.grid[row]) {
            this.grid[row][col] = type;
        }
    }

    public getTowerSpotKey(row: number, col: number): string {
        return `${row}_${col}`;
    }

    public registerTowerSpotNode(row: number, col: number, node: Node): void {
        this.towerSpotNodes.set(this.getTowerSpotKey(row, col), node);
    }

    public registerTowerNode(row: number, col: number, node: Node): void {
        this.towerNodes.set(this.getTowerSpotKey(row, col), node);
    }

    public unregisterTowerNode(row: number, col: number): void {
        this.towerNodes.delete(this.getTowerSpotKey(row, col));
    }

    public getTowerSpotNode(row: number, col: number): Node | undefined {
        return this.towerSpotNodes.get(this.getTowerSpotKey(row, col));
    }

    public getTowerNode(row: number, col: number): Node | undefined {
        return this.towerNodes.get(this.getTowerSpotKey(row, col));
    }

    /** 当前场上所有塔节点（供隐藏任务统计塔数量等批量查询） */
    public getAllTowerNodes(): Node[] {
        return Array.from(this.towerNodes.values());
    }

    public getObstacles(): Obstacle[] {
        return this.obstacles;
    }

    public registerObstacleCell(row: number, col: number, node: Node): void {
        const key = this.getTowerSpotKey(row, col);
        if (this.obstacleNodes.has(key)) return;
        this.obstacleNodes.set(key, node);
        // 同一障碍节点可覆盖多格，但只登记一次到列表
        if (this.obstacleNodesList.indexOf(node) < 0) {
            this.obstacleNodesList.push(node);
        }
    }

    public unregisterObstacleCell(row: number, col: number): void {
        const removed = this.obstacleNodes.get(this.getTowerSpotKey(row, col));
        this.obstacleNodes.delete(this.getTowerSpotKey(row, col));
        if (!removed) return;

        // 同步清理列表：原实现只删 Map，导致 obstacleNodesList 无限增长，
        // getObstacleNodes() 里已销毁的节点越来越多（全靠 isValid 过滤），
        // 塔的 AOE 每帧遍历列表也越来越慢。
        // 多格障碍会逐个格调用本方法，故需确认该节点已不覆盖任何格再移除。
        let stillUsed = false;
        this.obstacleNodes.forEach((n) => { if (n === removed) stillUsed = true; });
        if (!stillUsed) {
            const idx = this.obstacleNodesList.indexOf(removed);
            if (idx >= 0) this.obstacleNodesList.splice(idx, 1);
        }
    }

    public getObstacleNode(row: number, col: number): Node | undefined {
        return this.obstacleNodes.get(this.getTowerSpotKey(row, col));
    }

    public getObstacleNodes(): Node[] {
        return this.obstacleNodesList;
    }

    public setMarkedObstacleNode(node: Node | null): void {
        this.markedObstacleNode = node;
    }

    public getMarkedObstacleNode(): Node | null {
        return this.markedObstacleNode;
    }

    public setMarkedEnemyNode(node: Node | null): void {
        this.markedEnemyNode = node;
    }

    public getMarkedEnemyNode(): Node | null {
        return this.markedEnemyNode;
    }

    public getWorldPath(): Vec3[] {
        return this.cachedWorldPath;
    }

    public getLevelConfig(): LevelConfig | null {
        return this.levelConfig;
    }

    public getCellSize(): number {
        return this.cellSize;
    }

    public getOffset(): { x: number; y: number } {
        return { x: this.offsetX, y: this.offsetY };
    }

    public getRows(): number {
        return this.levelConfig ? this.levelConfig.rows : 0;
    }

    public getCols(): number {
        return this.levelConfig ? this.levelConfig.cols : 0;
    }
}