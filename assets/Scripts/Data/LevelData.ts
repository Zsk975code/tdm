import { _decorator, Vec2, JsonAsset, resources } from 'cc';
const { ccclass } = _decorator;

import { EnemyType, ENEMY_CONFIGS } from './EnemyData';
import { TowerType } from './TowerData';

export interface WaveEnemy {
    type: EnemyType;
    count: number;
    interval: number;
    delay: number;
    /** 可选：该组敌人的血量倍率（覆盖关内波次曲线）。用于 Boss 战掩护小怪逐波翻倍等定制需求 */
    hpMult?: number;
    /** 可选：true 时该组敌人不计入「本波是否清空」的判定 —— 同波其它敌人死光即开始下一波倒计时，
     *  它自己继续存活游走也不阻挡。用于「首波即刷、长期在场」的 BOSS。 */
    noBlock?: boolean;
}

export interface WaveData {
    waveIndex: number;
    enemies: WaveEnemy[];
}

export interface TowerSpot {
    row: number;
    col: number;
    x: number;
    y: number;
    /** 遗留字段（已废弃：旧版曾用 bonus 塔位生成粉色砖，现已不再使用；保留以兼容旧关卡文件） */
    bonus?: boolean;
}

/** 障碍物（可被炮塔攻击摧毁，摧毁后该地砖变为可建造） */
export interface Obstacle {
    row: number;
    col: number;
    /** 障碍类型；缺省时按旧 size/pink 兼容推导 */
    type?: ObstacleType;
    /** @deprecated 旧格式：1=小障碍(1×1)，2=大障碍(2×2) */
    size?: 1 | 2;
    /** @deprecated 旧格式粉色砖（已废弃，统一视为普通小石） */
    pink?: boolean;
    /** 堡垒战专用：标记为「堡垒」的障碍，摧毁即触发胜利（仅 mode=fortress 生效） */
    fortress?: boolean;
}

/** 障碍类型（取代旧的 size/pink 二值组合，支持宽×高与宝箱） */
export enum ObstacleType {
    /** 普通岩石 1×1 */
    ROCK_SMALL = 'rock_small',
    /** 普通岩石 宽×高 2×1 */
    ROCK_WIDE = 'rock_wide',
    /** 普通岩石 2×2 */
    ROCK_BIG = 'rock_big',
    /** 宝箱（金袋）1×1：摧毁给大量金币 */
    CHEST_SMALL = 'chest_small',
    /** 宝箱（金袋）2×2：摧毁给大量金币 */
    CHEST_BIG = 'chest_big',
}

export interface ObstacleTypeDef {
    /** 占格宽（列数） */
    w: number;
    /** 占格高（行数） */
    h: number;
    /** 血量 */
    hp: number;
    /** 摧毁时给的金币 */
    reward: number;
    /** 是否为宝箱（金袋）类 */
    isTreasure: boolean;
    /** 精灵 key（对应 SpriteManager.getObstacleFrame） */
    sprite: string;
}

/** 各障碍类型的数值表 */
export const OBSTACLE_DEFS: Record<ObstacleType, ObstacleTypeDef> = {
    [ObstacleType.ROCK_SMALL]: { w: 1, h: 1, hp: 500, reward: 50, isTreasure: false, sprite: 'rock_small' },
    [ObstacleType.ROCK_WIDE]:  { w: 2, h: 1, hp: 1000, reward: 100, isTreasure: false, sprite: 'rock_wide' },
    [ObstacleType.ROCK_BIG]:   { w: 2, h: 2, hp: 2000, reward: 200, isTreasure: false, sprite: 'rock_big' },
    [ObstacleType.CHEST_SMALL]:{ w: 1, h: 1, hp: 2000, reward: 750, isTreasure: true, sprite: 'chest_small' },
    [ObstacleType.CHEST_BIG]:  { w: 2, h: 2, hp: 5000, reward: 2000, isTreasure: true, sprite: 'chest_big' },
};

/** 关卡模式：波次(默认) / Boss战(限时歼灭·无萝卜·环形地图) / 堡垒战(打掉堡垒即胜) */
export enum LevelMode {
    WAVE = 'wave',
    BOSS = 'boss',
    FORTRESS = 'fortress',
}

/**
 * Boss 战默认限时（秒）。
 * GameManager 用 config.timeLimit 初始化倒计时，若为 0 则开局即判超时，
 * 因此外部关卡声明 boss 模式却未写 timeLimit 时必须兜底。
 */
export const DEFAULT_BOSS_TIME_LIMIT = 90;

export interface LevelConfig {
    levelIndex: number;
    name: string;
    rows: number;
    cols: number;
    cellSize: number;
    path: Vec2[];
    towerSpots: TowerSpot[];
    /** 显式障碍物（大障碍/粉色地砖）。未标记的空白格在运行时自动成为小障碍物 */
    obstacles?: Obstacle[];
    waves: WaveData[];
    startGold: number;
    lives: number;
    availableTowers?: TowerType[];
    /** 自定义关卡唯一标识（用于稳定记录星级），内置关卡无需设置 */
    uid?: string;
    /**
     * 来源地图文件名（仅「地图文件夹」关卡有值，形如 `01_forest.json`）。
     * 用于选关界面标记来源，以及作为星级记录的稳定 key。
     */
    sourceFile?: string;
    /** 关卡模式（默认波次）。boss=限时歼灭战(无萝卜/环形地图)；fortress=堡垒战(打掉堡垒即胜) */
    mode?: LevelMode;
    /** Boss战限时(秒)：通关时按剩余时间结算星级 */
    timeLimit?: number;
}

export const LEVEL_CONFIGS: LevelConfig[] = [
    {
        // ════════ 内置测试地图：13×7 直线路径，两侧密集建造位，覆盖全塔全敌种 ════════
        levelIndex: 2,
        name: '炮塔测试场',
        rows: 7,
        cols: 13,
        cellSize: 140,
        path: [
            new Vec2(0, 3),   // 入口（左侧第 4 行）
            new Vec2(12, 3),  // 直线横穿到底（右侧出口）
        ],
        towerSpots: [
            // —— 第 0 行（最上整排）——
            { row: 0, col: 0, x: 0, y: 0 }, { row: 0, col: 1, x: 0, y: 0 }, { row: 0, col: 2, x: 0, y: 0 },
            { row: 0, col: 3, x: 0, y: 0 }, { row: 0, col: 4, x: 0, y: 0 }, { row: 0, col: 5, x: 0, y: 0 },
            { row: 0, col: 6, x: 0, y: 0 }, { row: 0, col: 7, x: 0, y: 0 }, { row: 0, col: 8, x: 0, y: 0 },
            { row: 0, col: 9, x: 0, y: 0 }, { row: 0, col: 10, x: 0, y: 0 }, { row: 0, col: 11, x: 0, y: 0 },
            { row: 0, col: 12, x: 0, y: 0 },
            // —— 第 1 行（上整排）——
            { row: 1, col: 0, x: 0, y: 0 }, { row: 1, col: 1, x: 0, y: 0 }, { row: 1, col: 2, x: 0, y: 0 },
            { row: 1, col: 3, x: 0, y: 0 }, { row: 1, col: 4, x: 0, y: 0 }, { row: 1, col: 5, x: 0, y: 0 },
            { row: 1, col: 6, x: 0, y: 0 }, { row: 1, col: 7, x: 0, y: 0 }, { row: 1, col: 8, x: 0, y: 0 },
            { row: 1, col: 9, x: 0, y: 0 }, { row: 1, col: 10, x: 0, y: 0 }, { row: 1, col: 11, x: 0, y: 0 },
            { row: 1, col: 12, x: 0, y: 0 },
            // —— 第 2 行（上，避开障碍列 5、9）——
            { row: 2, col: 0, x: 0, y: 0 }, { row: 2, col: 1, x: 0, y: 0 }, { row: 2, col: 2, x: 0, y: 0 },
            { row: 2, col: 3, x: 0, y: 0 }, { row: 2, col: 4, x: 0, y: 0 },
            { row: 2, col: 6, x: 0, y: 0 }, { row: 2, col: 7, x: 0, y: 0 }, { row: 2, col: 8, x: 0, y: 0 },
            { row: 2, col: 10, x: 0, y: 0 }, { row: 2, col: 11, x: 0, y: 0 }, { row: 2, col: 12, x: 0, y: 0 },
            // —— 第 4 行（下，避开障碍列 5、9；注意路径在第 3 行）——
            { row: 4, col: 0, x: 0, y: 0 }, { row: 4, col: 1, x: 0, y: 0 }, { row: 4, col: 2, x: 0, y: 0 },
            { row: 4, col: 3, x: 0, y: 0 }, { row: 4, col: 4, x: 0, y: 0 },
            { row: 4, col: 6, x: 0, y: 0 }, { row: 4, col: 7, x: 0, y: 0 }, { row: 4, col: 8, x: 0, y: 0 },
            { row: 4, col: 10, x: 0, y: 0 }, { row: 4, col: 11, x: 0, y: 0 }, { row: 4, col: 12, x: 0, y: 0 },
            // —— 第 5 行（下整排）——
            { row: 5, col: 0, x: 0, y: 0 }, { row: 5, col: 1, x: 0, y: 0 }, { row: 5, col: 2, x: 0, y: 0 },
            { row: 5, col: 3, x: 0, y: 0 }, { row: 5, col: 4, x: 0, y: 0 }, { row: 5, col: 5, x: 0, y: 0 },
            { row: 5, col: 6, x: 0, y: 0 }, { row: 5, col: 7, x: 0, y: 0 }, { row: 5, col: 8, x: 0, y: 0 },
            { row: 5, col: 9, x: 0, y: 0 }, { row: 5, col: 10, x: 0, y: 0 }, { row: 5, col: 11, x: 0, y: 0 },
            { row: 5, col: 12, x: 0, y: 0 },
            // —— 第 6 行（最下整排）——
            { row: 6, col: 0, x: 0, y: 0 }, { row: 6, col: 1, x: 0, y: 0 }, { row: 6, col: 2, x: 0, y: 0 },
            { row: 6, col: 3, x: 0, y: 0 }, { row: 6, col: 4, x: 0, y: 0 }, { row: 6, col: 5, x: 0, y: 0 },
            { row: 6, col: 6, x: 0, y: 0 }, { row: 6, col: 7, x: 0, y: 0 }, { row: 6, col: 8, x: 0, y: 0 },
            { row: 6, col: 9, x: 0, y: 0 }, { row: 6, col: 10, x: 0, y: 0 }, { row: 6, col: 11, x: 0, y: 0 },
            { row: 6, col: 12, x: 0, y: 0 },
        ],
        obstacles: [
            // 路径两侧 1×1 岩石（避免 2×2 与路径行冲突），用于测试辐射/特斯拉 AOE 与障碍摧毁
            { row: 2, col: 5, type: ObstacleType.ROCK_SMALL },
            { row: 4, col: 5, type: ObstacleType.ROCK_SMALL },
            { row: 2, col: 9, type: ObstacleType.ROCK_SMALL },
            { row: 4, col: 9, type: ObstacleType.ROCK_SMALL },
        ],
        waves: [
            {
                waveIndex: 0,
                enemies: [{ type: EnemyType.NORMAL, count: 12, interval: 1.2, delay: 0 }],
            },
            {
                waveIndex: 1,
                enemies: [
                    { type: EnemyType.FAST, count: 12, interval: 0.6, delay: 0 },
                    { type: EnemyType.NORMAL, count: 6, interval: 1.0, delay: 4 },
                ],
            },
            {
                waveIndex: 2,
                enemies: [
                    { type: EnemyType.TANK, count: 6, interval: 2.0, delay: 0 },
                    { type: EnemyType.BIG_FAST, count: 6, interval: 0.8, delay: 4 },
                ],
            },
            {
                waveIndex: 3,
                enemies: [{ type: EnemyType.SPLITTER, count: 5, interval: 3.0, delay: 0 }],
            },
            {
                waveIndex: 4,
                enemies: [
                    { type: EnemyType.TANK, count: 6, interval: 1.5, delay: 0 },
                    { type: EnemyType.SMALL_BOSS, count: 2, interval: 4.0, delay: 3 },
                    { type: EnemyType.BOSS, count: 1, interval: 0, delay: 10 },
                ],
            },
            {
                waveIndex: 5,
                enemies: [
                    { type: EnemyType.NORMAL, count: 20, interval: 0.5, delay: 0 },
                    { type: EnemyType.FAST, count: 15, interval: 0.4, delay: 3 },
                    { type: EnemyType.TANK, count: 8, interval: 1.5, delay: 6 },
                    { type: EnemyType.BIG_FAST, count: 8, interval: 0.6, delay: 8 },
                    { type: EnemyType.SPLITTER, count: 4, interval: 2.5, delay: 10 },
                    { type: EnemyType.SMALL_BOSS, count: 3, interval: 3.0, delay: 14 },
                    { type: EnemyType.BOSS, count: 2, interval: 5.0, delay: 18 },
                ],
            },
        ],
        startGold: 9999,
        lives: 30,
        availableTowers: [TowerType.EMITTER, TowerType.PRISM, TowerType.ARTILLERY, TowerType.ROCKET, TowerType.SNOW, TowerType.COAGULATOR, TowerType.RADIATION, TowerType.CONDENSER, TowerType.TESLA, TowerType.ARCHER],
    }
];

export function getLevelConfig(levelIndex: number): LevelConfig | null {
    const all = getAllLevelConfigs();
    if (levelIndex < 0 || levelIndex >= all.length) return null;
    return all[levelIndex];
}

/**
 * 关卡总表（顺序即选关界面顺序）：
 *   1. 地图文件夹关卡（assets/resources/levels/*.json，需先 loadLevelFiles()）
 *   2. 内置关卡（LEVEL_CONFIGS，代码写死）
 *   3. 自定义关卡（localStorage）
 *
 * 地图文件夹优先：正式关卡以 levels 文件夹为准，关卡顺序由文件名数字前缀决定。
 */
export function getAllLevelConfigs(): LevelConfig[] {
    return [...FILE_LEVELS, ...LEVEL_CONFIGS, ...getCustomLevels()];
}

/**
 * 解析波次数组，对创作者手写的数据做宽容处理：
 * - 过滤掉类型非法的敌人条目（写错敌人名不会导致整关崩掉）
 * - count/interval/delay 缺失时补默认值
 * - 完全没有波次时补 1 波默认敌人，避免"开局即通关"
 */
function parseWavesFromJson(rawWaves: any): WaveData[] {
    const src: any[] = Array.isArray(rawWaves) ? rawWaves : [];
    const waves: WaveData[] = [];

    src.forEach((w, wi) => {
        const enemies: WaveEnemy[] = Array.isArray(w?.enemies)
            ? w.enemies
                  .filter((e: any) => e && typeof e.type === 'string' && !!ENEMY_CONFIGS[e.type as EnemyType])
                  .map((e: any) => ({
                      type: e.type as EnemyType,
                      count: Math.max(1, Math.floor(Number(e.count) || 1)),
                      interval: Math.max(0.1, Number(e.interval) || 1),
                      delay: Math.max(0, Number(e.delay) || 0),
                      hpMult: e.hpMult != null ? Math.max(0.01, Number(e.hpMult)) : undefined,
                      noBlock: e.noBlock === true,
                  }))
            : [];
        // 空波次允许保留（创作者可能用它做"喘息波"），但整关无波次时会走兜底
        waves.push({ waveIndex: Number(w?.waveIndex) || wi, enemies });
    });

    if (waves.length === 0) {
        waves.push({
            waveIndex: 0,
            enemies: [{ type: EnemyType.NORMAL, count: 5, interval: 1.2, delay: 0 }],
        });
    }
    return waves;
}

/**
 * 将 JSON 文本解析并校验为 LevelConfig。
 * 兼容：地图编辑器 exportLevel() 的导出格式、手写创作的地图 JSON。
 * 返回 null 表示格式非法。
 */
export function parseLevelFromJson(jsonText: string): LevelConfig | null {
    try {
        const raw = JSON.parse(jsonText);
        if (!raw || typeof raw !== 'object') return null;

        // 关卡模式与 Boss 战限时（原先未解析，导致外部关卡 JSON 无法启用 boss/fortress 模式）
        const mode: LevelMode =
            raw.mode === 'boss' ? LevelMode.BOSS :
                raw.mode === 'fortress' ? LevelMode.FORTRESS : LevelMode.WAVE;
        let timeLimit = typeof raw.timeLimit === 'number' && raw.timeLimit > 0
            ? Math.floor(raw.timeLimit) : undefined;
        if (mode === LevelMode.BOSS && timeLimit === undefined) {
            timeLimit = DEFAULT_BOSS_TIME_LIMIT;
        }

        const cfg: LevelConfig = {
            levelIndex: Number(raw.levelIndex ?? 0) | 0,
            name: String(raw.name ?? '未命名关卡'),
            uid: typeof raw.uid === 'string' && raw.uid ? raw.uid : undefined,
            rows: Math.max(1, Math.floor(Number(raw.rows) || 7)),
            cols: Math.max(1, Math.floor(Number(raw.cols) || 13)),
            cellSize: Math.max(1, Math.floor(Number(raw.cellSize) || 140)),
            path: Array.isArray(raw.path)
                ? raw.path
                      .filter((p: any) => p && typeof p.x === 'number' && typeof p.y === 'number')
                      .map((p: any) => new Vec2(p.x, p.y))
                : [],
            towerSpots: Array.isArray(raw.towerSpots)
                ? raw.towerSpots
                      .filter((s: any) => s && typeof s.row === 'number' && typeof s.col === 'number')
                      .map((s: any) => ({
                          row: Math.floor(s.row),
                          col: Math.floor(s.col),
                          x: Number(s.x) || 0,
                          y: Number(s.y) || 0,
                          bonus: s.bonus === true,
                      }))
                : [],
            obstacles: Array.isArray(raw.obstacles)
                ? raw.obstacles
                      .filter((o: any) => o && typeof o.row === 'number' && typeof o.col === 'number')
                      .map((o: any) => {
                          let type: ObstacleType = ObstacleType.ROCK_SMALL;
                          if (o.type && OBSTACLE_DEFS[o.type as ObstacleType]) {
                              type = o.type as ObstacleType;
                          } else if (o.size === 2) {
                              type = ObstacleType.ROCK_BIG;
                          } else if (o.pink === true) {
                              // 旧版粉色砖：统一视为普通小石（粉色砖类型已废弃）
                              type = ObstacleType.ROCK_SMALL;
                          }
                          return { row: Math.floor(o.row), col: Math.floor(o.col), type, fortress: o.fortress === true };
                      })
                : undefined,
            waves: parseWavesFromJson(raw.waves),
            startGold: Math.floor(Number(raw.startGold) || 300),
            lives: Math.max(1, Math.floor(Number(raw.lives) || 10)),
            availableTowers: Array.isArray(raw.availableTowers) ? raw.availableTowers : undefined,
            mode: mode,
            timeLimit: timeLimit,
        };

        // 校验：地图尺寸、路径合法性
        if (cfg.rows <= 0 || cfg.cols <= 0) return null;
        if (cfg.path.length < 2) return null;   // 至少 出生点 + 终点
        for (const p of cfg.path) {
            if (p.x < 0 || p.x >= cfg.cols || p.y < 0 || p.y >= cfg.rows) return null;
        }
        return cfg;
    } catch {
        return null;
    }
}

/**
 * 地图文件创作期体检：只输出告警，不阻止加载。
 * 帮创作者发现三类常见错误：
 * - 路径斜线跳格（怪物会直接穿过去）
 * - 塔位 / 障碍压在路径上
 */
function validateLevelFile(cfg: LevelConfig, label: string): void {
    const warns: string[] = [];

    // 把路径展开成逐格集合（正交直线段自动补全中间格）
    const cells = new Set<string>();
    const addLine = (a: Vec2, b: Vec2): void => {
        const dx = Math.sign(b.x - a.x);
        const dy = Math.sign(b.y - a.y);
        let cx = a.x;
        let cy = a.y;
        cells.add(`${cx},${cy}`);
        let guard = 0;   // 防御：异常数据导致死循环
        while ((cx !== b.x || cy !== b.y) && guard++ < 4096) {
            cx += dx;
            cy += dy;
            cells.add(`${cx},${cy}`);
        }
    };

    for (let i = 1; i < cfg.path.length; i++) {
        const a = cfg.path[i - 1];
        const b = cfg.path[i];
        if (a.x !== b.x && a.y !== b.y) {
            warns.push(`路径第 ${i} 段 (${a.x},${a.y})→(${b.x},${b.y}) 斜线跳格，怪物会直接穿过去`);
        }
        addLine(a, b);
    }

    for (const s of cfg.towerSpots) {
        if (cells.has(`${s.col},${s.row}`)) warns.push(`塔位 (row ${s.row}, col ${s.col}) 压在路径上`);
    }
    for (const o of cfg.obstacles ?? []) {
        const def = OBSTACLE_DEFS[o.type ?? ObstacleType.ROCK_SMALL];
        for (let r = o.row; r < o.row + def.h; r++) {
            for (let c = o.col; c < o.col + def.w; c++) {
                if (cells.has(`${c},${r}`)) warns.push(`障碍 (row ${r}, col ${c}) 压在路径上`);
            }
        }
    }

    if (warns.length > 0) {
        const shown = warns.slice(0, 8).join('\n  - ');
        const more = warns.length > 8 ? `\n  ... 共 ${warns.length} 条` : '';
        console.warn(`[地图文件夹] 「${label}」体检提示:\n  - ${shown}${more}`);
    }
}

/**
 * 从 assets/resources/ 目录异步加载关卡 JSON（Cocos 标准资源加载方式）。
 * @param path 形如 'levels/level_demo'（不含 .json 后缀）
 */
export function loadLevelFromResources(path: string): Promise<LevelConfig | null> {
    return new Promise((resolve) => {
        resources.load(path, JsonAsset, (err, asset) => {
            if (err || !asset) {
                resolve(null);
                return;
            }
            resolve(parseLevelFromJson(JSON.stringify(asset.json)));
        });
    });
}

// ==================== 地图文件夹（assets/resources/levels） ====================

/** 地图文件夹在 resources 下的路径 */
export const LEVEL_FILES_DIR = 'levels';

/** 已加载的地图文件关卡（按文件名排序） */
export let FILE_LEVELS: LevelConfig[] = [];

/** 获取已加载的地图文件关卡（未加载时为空数组） */
export function getFileLevels(): LevelConfig[] {
    return FILE_LEVELS;
}

let _levelFilesLoaded: boolean = false;
let _levelFilesPromise: Promise<void> | null = null;

/** 地图文件关卡是否已加载完成 */
export function isLevelFilesLoaded(): boolean {
    return _levelFilesLoaded;
}

/**
 * 扫描并加载 `assets/resources/levels/` 下的全部 JSON 地图文件。
 *
 * 特点：
 * - 自动扫描目录，创作者只需把 `.json` 丢进文件夹即可，无需登记
 * - 按文件名排序，推荐用数字前缀控制顺序（`01_xxx.json`、`02_xxx.json`）
 * - 文件名以 `_` 开头、或名为 `index` 的文件视为模板/清单，不会被当作关卡
 * - 单个文件损坏不会拖垮整体（跳过并告警）
 * - 幂等：重复调用只会真正加载一次，后续立即 resolve
 *
 * @returns Promise，resolve 后 FILE_LEVELS / getAllLevelConfigs() 即为最新
 */
export function loadLevelFiles(): Promise<void> {
    if (_levelFilesLoaded) return Promise.resolve();
    if (_levelFilesPromise) return _levelFilesPromise;

    _levelFilesPromise = new Promise<void>((resolve) => {
        // getDirWithPath 返回目录下所有资源的寻址信息（path 不含扩展名）
        let infos: any[] = [];
        try {
            infos = (resources.getDirWithPath(LEVEL_FILES_DIR, JsonAsset) as any[]) || [];
        } catch {
            infos = [];
        }

        // 保留完整 path（可能含子目录）用于加载，basename 用于过滤与展示
        const entries = infos
            .map((it) => {
                const url: string = typeof it === 'string' ? it : String(it?.path ?? '');
                return { url, base: url.substring(url.lastIndexOf('/') + 1) };
            })
            .filter((e) => e.base.length > 0 && !e.base.startsWith('_') && !e.base.startsWith('index'))
            .sort((a, b) => a.url.localeCompare(b.url, 'zh-Hans-CN', { numeric: true }));

        if (entries.length === 0) {
            _levelFilesLoaded = true;
            resolve();
            return;
        }

        const loaded: { url: string; cfg: LevelConfig }[] = [];
        let pending = entries.length;
        const settle = (): void => {
            pending--;
            if (pending > 0) return;
            loaded.sort((a, b) => a.url.localeCompare(b.url, 'zh-Hans-CN', { numeric: true }));
            FILE_LEVELS = loaded.map((x) => x.cfg);
            _levelFilesLoaded = true;
            resolve();
        };

        for (const e of entries) {
            resources.load(e.url, JsonAsset, (err, asset) => {
                if (err || !asset) {
                    console.warn(`[地图文件夹] 跳过无法加载的文件: ${e.url}`);
                    settle();
                    return;
                }
                try {
                    const cfg = parseLevelFromJson(JSON.stringify(asset.json));
                    if (!cfg) {
                        console.warn(`[地图文件夹] 跳过格式非法的文件: ${e.url}`);
                        settle();
                        return;
                    }
                    // 未显式写 uid 时用文件名兜底（不含目录）。
                    // 建议正式关卡在 JSON 里显式声明 uid，这样重命名文件也不会丢星级/任务记录。
                    if (!cfg.uid) cfg.uid = `f_${e.base}`;
                    cfg.sourceFile = e.base;
                    // 关卡名缺失时用文件名（去掉数字前缀）
                    if (!cfg.name || cfg.name === '未命名关卡') {
                        cfg.name = e.base.replace(/^\d+_/, '');
                    }
                    validateLevelFile(cfg, e.base);
                    loaded.push({ url: e.url, cfg });
                } catch {
                    console.warn(`[地图文件夹] 跳过解析异常的文件: ${e.url}`);
                }
                settle();
            });
        }
    });

    return _levelFilesPromise;
}

/**
 * 重新扫描地图文件夹（新增了地图文件后调用，会重新读取目录）。
 * 注意：修改已存在的 json 需由 Cocos 编辑器重新导入资源后才会生效。
 */
export function reloadLevelFiles(): Promise<void> {
    FILE_LEVELS = [];
    _levelFilesLoaded = false;
    _levelFilesPromise = null;
    return loadLevelFiles();
}

const CUSTOM_LEVELS_KEY = 'tower_defense_custom_levels';

export function getCustomLevels(): LevelConfig[] {
    try {
        const raw = localStorage.getItem(CUSTOM_LEVELS_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw) as LevelConfig[];
        return data.map((cfg) => ({
            ...cfg,
            path: cfg.path.map((p: any) => new Vec2(p.x, p.y)),
        }));
    } catch {
        return [];
    }
}

export function saveCustomLevel(config: LevelConfig): void {
    const cfg: LevelConfig = { ...config };
    // 为自定义关卡生成稳定 uid，用于星级记录（不随列表增删/索引变化而错位）
    if (!cfg.uid) cfg.uid = `u_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffff).toString(36)}`;
    const existing = getCustomLevels();
    existing.push(cfg);
    const data = existing.map((c) => ({
        ...c,
        path: c.path.map((p) => ({ x: p.x, y: p.y })),
    }));
    localStorage.setItem(CUSTOM_LEVELS_KEY, JSON.stringify(data));
}

/** 更新已存在的自定义关卡（编辑器二次保存用），index 越界时忽略 */
export function updateCustomLevel(index: number, config: LevelConfig): void {
    const existing = getCustomLevels();
    if (index < 0 || index >= existing.length) return;
    const cfg: LevelConfig = { ...config };
    // 保留原 uid，保证覆盖保存后星级记录不丢失
    if (!cfg.uid) cfg.uid = existing[index].uid;
    existing[index] = cfg;
    const data = existing.map((c) => ({
        ...c,
        path: c.path.map((p) => ({ x: p.x, y: p.y })),
    }));
    localStorage.setItem(CUSTOM_LEVELS_KEY, JSON.stringify(data));
}

export function deleteCustomLevel(index: number): void {
    const existing = getCustomLevels();
    if (index < 0 || index >= existing.length) return;
    existing.splice(index, 1);
    const data = existing.map((cfg) => ({
        ...cfg,
        path: cfg.path.map((p) => ({ x: p.x, y: p.y })),
    }));
    localStorage.setItem(CUSTOM_LEVELS_KEY, JSON.stringify(data));
}

// ==================== 波次血量曲线 ====================

/**
 * 计算指定波次的敌人血量倍率（波次难度曲线）：
 * - 曲线随“章节等级”分段，每 5 关为一个等级（按 0-based levelIndex /5 划分）
 *     · 等级1（关卡 1-5）：首波 0.5x → 末波 1.5x
 *     · 等级2（关卡 6-10）：首波 1.0x → 末波 2.0x
 *     · 等级3（关卡 11-15）：首波 1.5x → 末波 2.5x
 * - 在波次内做线性插值：首波取下限，末波取上限，中间线性过渡
 * 例：等级1、5 波时倍率为 [0.5, 0.75, 1.0, 1.25, 1.5]
 */
export function calcWaveHpMult(waveIndex: number, totalWaves: number, levelIndex: number = 0): number {
    if (totalWaves <= 1) return 1;
    const t = Math.max(0, Math.min(1, waveIndex / (totalWaves - 1)));
    const grade = Math.min(3, Math.floor(levelIndex / 5) + 1);
    const ranges: Record<number, [number, number]> = {
        1: [0.5, 1.5],
        2: [1.0, 2.0],
        3: [1.5, 2.5],
    };
    const [lo, hi] = ranges[grade];
    return lo + (hi - lo) * t;
}

// ==================== 星级测评 ====================

const LEVEL_STAR_KEY = 'tower_defense_level_stars';

/**
 * 根据通关时剩余生命计算星级：
 * - 剩余 10 血（满血）→ 3 星
 * - 剩余 4 ~ 9 血 → 2 星
 * - 剩余 1 ~ 3 血 → 1 星
 */
export function calcLevelStars(hp: number): number {
    if (hp >= 10) return 3;
    if (hp > 3) return 2;
    if (hp >= 1) return 1;
    return 0;
}

/**
 * Boss战星级：按通关时剩余时间结算（越快越多星）。
 * - 剩余 ≥ 30s → 3 星
 * - 剩余 ≥ 20s → 2 星
 * - 剩余 ≥ 10s → 1 星
 * - 其余 → 0 星
 */
export function calcBossStars(remainingTime: number): number {
    if (remainingTime >= 30) return 3;
    if (remainingTime >= 20) return 2;
    if (remainingTime >= 10) return 1;
    return 0;
}

/** 生成关卡在星级记录表中的 key：自定义关卡用 uid，内置关卡用 levelIndex */
export function getLevelStarKey(config: LevelConfig): string {
    return config.uid ? `c_${config.uid}` : `b_${config.levelIndex}`;
}

export function getLevelStarRecord(): Record<string, number> {
    try {
        const raw = localStorage.getItem(LEVEL_STAR_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw);
        return (data && typeof data === 'object') ? data : {};
    } catch {
        return {};
    }
}

/** 读取某关卡的星级记录（未通关为 0） */
export function getLevelStars(key: string): number {
    return getLevelStarRecord()[key] || 0;
}

/** 保存星级（只增不减），返回最终生效的星级 */
export function saveLevelStars(key: string, stars: number): number {
    const rec = getLevelStarRecord();
    const cur = rec[key] || 0;
    if (stars > cur) {
        rec[key] = stars;
        localStorage.setItem(LEVEL_STAR_KEY, JSON.stringify(rec));
        return stars;
    }
    return cur;
}

/** 删除某关卡的星级记录（自定义关卡被删除时清理） */
export function deleteLevelStar(key: string): void {
    const rec = getLevelStarRecord();
    if (key in rec) {
        delete rec[key];
        localStorage.setItem(LEVEL_STAR_KEY, JSON.stringify(rec));
    }
}