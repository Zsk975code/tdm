import { resources, JsonAsset } from 'cc';
import { TowerType } from './TowerData';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  隐藏任务（彩星条件）管理文件
 * ─────────────────────────────────────────────────────────────────────
 *  任务的"定义/数值"与关卡数据完全分离，统一放在：
 *      assets/resources/hidden_missions.json
 *  该文件玩家不可见、创作者可编辑；每一关各自的任务互不相同，
 *  新增某关任务只需在 missions 下以该关 key 追加一条数组即可。
 *
 *  key 规则（与星级记录一致，见 LevelData.getLevelStarKey）：
 *    - 地图文件 / 自制关卡：c_<uid>（如 c_lv01）
 *    - 内置关卡：b_<levelIndex>（如绿野平原 b_0、沙漠风暴 b_1、炮塔测试场 b_2）
 *
 *  若资源加载失败，本模块内置 FALLBACK_LEVEL_MISSIONS 兜底，保证游戏可正常运行。
 */

/** 隐藏任务（彩星条件）类型 */
export enum MissionType {
    /** 场上同时拥有 N 座「指定类型且不低于指定等级」的塔 */
    HAVE_TOWER = 'have_tower',
    /** 用指定类型的塔累计消灭 N 个敌人 */
    KILL_BY_TOWER = 'kill_by_tower',
    /** 摧毁指定格子上的障碍物 */
    DESTROY_OBSTACLE = 'destroy_obstacle',
    /** 约束型：通关时禁止建造指定塔（建了即本局失败，已完成的任务不受此影响） */
    FORBID_TOWER = 'forbid_tower',
    /** 约束型：在限定时间内通关（超时即本局失败，已完成的任务不受此影响） */
    FINISH_IN_TIME = 'finish_in_time',
    /** 约束型：指定塔的拥有数量不超过 count 座（超过即本局失败，已完成的任务不受此影响） */
    LIMIT_TOWER = 'limit_tower',
    /** 进度+限时型：在 timeLimit 秒内累计获得 count 金币（花掉的钱不减少累计；超时仍未达标即本局失败） */
    EARN_GOLD = 'earn_gold',
}

export interface Mission {
    id: string;
    /** 面板上展示的文案 */
    desc: string;
    type: MissionType;
    /** HAVE_TOWER / KILL_BY_TOWER / FORBID_TOWER：目标塔类型 */
    towerType?: TowerType;
    /** HAVE_TOWER：要求等级（1/2/3，按「不低于该等级」判定） */
    towerLevel?: number;
    /** HAVE_TOWER / KILL_BY_TOWER：目标数量；LIMIT_TOWER：允许的最大数量；EARN_GOLD：目标金币数；DESTROY_OBSTACLE 固定为 1 */
    count?: number;
    /** DESTROY_OBSTACLE：目标障碍所在格（单格，兼容旧格式） */
    row?: number;
    col?: number;
    /** DESTROY_OBSTACLE：目标障碍所在格（多格；优先于 row/col） */
    cells?: { row: number; col: number }[];
    /** FINISH_IN_TIME：限时秒数（从首波开始计时到通关）；EARN_GOLD：累计金币的限时秒数；DESTROY_OBSTACLE：清除障碍的限时秒数（不配则不限时）。均从首波开始计时 */
    timeLimit?: number;
}

/** 资源中的原始任务条目（type/towerType 为字符串，解析时再转枚举） */
interface RawMission {
    id: string;
    desc: string;
    type: string;
    towerType?: string;
    towerLevel?: number;
    count?: number;
    row?: number;
    col?: number;
    cells?: { row: number; col: number }[];
    timeLimit?: number;
}

const RES_MISSIONS_PATH = 'hidden_missions';

/** 运行时加载后的任务表（key -> 任务列表） */
let _missionsData: Record<string, Mission[]> = {};
let _missionsLoaded = false;
let _missionsPromise: Promise<void> | null = null;

/**
 * 资源加载兜底：万一 hidden_missions.json 缺失/损坏，保证 lv01 仍有任务，
 * 游戏不报错、按钮逻辑不受影响。
 */
const FALLBACK_LEVEL_MISSIONS: Record<string, Mission[]> = {
    'c_lv01': [
        { id: 'lv01_m1', desc: '建造 5 座 3 级发射器', type: MissionType.HAVE_TOWER, towerType: TowerType.EMITTER, towerLevel: 3, count: 5 },
        { id: 'lv01_m2', desc: '用发射器消灭 50 个敌人', type: MissionType.KILL_BY_TOWER, towerType: TowerType.EMITTER, count: 50 },
        { id: 'lv01_m3', desc: '清除 (4,4) 处的障碍', type: MissionType.DESTROY_OBSTACLE, row: 4, col: 4 },
    ],
    'c_lv02': [
        { id: 'lv02_m1', desc: '建造 1 座 3 级凝滞器', type: MissionType.HAVE_TOWER, towerType: TowerType.COAGULATOR, towerLevel: 3, count: 1 },
        { id: 'lv02_m2', desc: '用发射器消灭 50 个敌人', type: MissionType.KILL_BY_TOWER, towerType: TowerType.EMITTER, count: 50 },
        { id: 'lv02_m3', desc: '清除 (4,5) 与 (10,3) 处的障碍', type: MissionType.DESTROY_OBSTACLE, cells: [ { row: 5, col: 4 }, { row: 3, col: 10 } ] },
    ],
};

const VALID_MISSION_TYPES = new Set<string>([
    MissionType.HAVE_TOWER,
    MissionType.KILL_BY_TOWER,
    MissionType.DESTROY_OBSTACLE,
    MissionType.FORBID_TOWER,
    MissionType.FINISH_IN_TIME,
    MissionType.LIMIT_TOWER,
    MissionType.EARN_GOLD,
]);

function parseRawMission(m: RawMission): Mission | null {
    if (!m || !m.id || !m.type) return null;
    const type = m.type as MissionType;
    if (!VALID_MISSION_TYPES.has(type)) {
        console.warn(`[隐藏任务] 未知任务类型: ${m.type} (id=${m.id})，已跳过`);
        return null;
    }
    return {
        id: m.id,
        desc: m.desc ?? '',
        type,
        towerType: (m.towerType as TowerType) ?? undefined,
        towerLevel: m.towerLevel,
        count: m.count,
        row: m.row,
        col: m.col,
        cells: Array.isArray(m.cells)
            ? m.cells.filter((c: any) => c && typeof c.row === 'number' && typeof c.col === 'number')
                          .map((c: any) => ({ row: Math.floor(c.row), col: Math.floor(c.col) }))
            : undefined,
        timeLimit: typeof m.timeLimit === 'number' && m.timeLimit > 0 ? m.timeLimit : undefined,
    };
}

/**
 * 预载隐藏任务管理文件（异步、幂等）。
 * 在 UIManager 启动时与 loadLevelFiles() 一起调用即可，
 * 进入关卡前必定已完成，不影响后续的同步取数。
 */
export function loadHiddenMissions(): Promise<void> {
    if (_missionsLoaded) return Promise.resolve();
    if (_missionsPromise) return _missionsPromise;

    _missionsPromise = new Promise<void>((resolve) => {
        resources.load(RES_MISSIONS_PATH, JsonAsset, (err, asset) => {
            if (err || !asset || !asset.json || !(asset.json as any).missions) {
                console.warn('[隐藏任务] 加载 hidden_missions.json 失败，使用内置兜底任务', err);
            } else {
                try {
                    const raw = (asset.json as any).missions as Record<string, RawMission[]>;
                    const parsed: Record<string, Mission[]> = {};
                    for (const key of Object.keys(raw)) {
                        const list = (raw[key] || [])
                            .map(parseRawMission)
                            .filter((x: Mission | null): x is Mission => x !== null);
                        if (list.length > 0) parsed[key] = list.slice(0, 3); // 每关最多 3 个
                    }
                    _missionsData = parsed;
                } catch (e) {
                    console.warn('[隐藏任务] 解析 hidden_missions.json 出错，使用内置兜底任务', e);
                }
            }
            _missionsLoaded = true;
            resolve();
        });
    });
    return _missionsPromise;
}

/** 取某关的隐藏任务（无配置时返回空数组；资源未加载时回退内置兜底） */
export function getLevelMissions(levelKey: string): Mission[] {
    const fromFile = _missionsData[levelKey];
    if (fromFile) return fromFile;
    if (!_missionsLoaded) {
        // 资源尚未就绪：先用兜底，待资源加载完成后下一关生效
        return FALLBACK_LEVEL_MISSIONS[levelKey] ?? [];
    }
    return FALLBACK_LEVEL_MISSIONS[levelKey] ?? [];
}
