import { Mission, MissionType, getLevelMissions } from '../Data/MissionData';
import { TowerType } from '../Data/TowerData';
import { CodexManager } from '../Utils/CodexManager';

const STORE_KEY = 'tower_defense_missions';

/** 持久化结构：{ 关卡key: [已完成的任务id...] } */
type MissionStore = Record<string, string[]>;

/** 塔统计条目（level 为 1-based：1/2/3） */
export interface TowerStatEntry {
    type: TowerType;
    level: number;
}

/** 任务运行态：完成 / 失败 / 进行中 */
export type MissionState = 'completed' | 'failed' | 'active';

/**
 * 隐藏任务（彩星条件）管理器 —— 纯逻辑，不挂节点。
 *
 * 规则：
 * - 任务一旦完成即**永久记录**（写入 localStorage），重玩本关只显示「已完成」，不再重新判定
 * - **未完成**的任务在每次进入关卡时从 0 重新计数
 * - HAVE_TOWER / KILL_BY_TOWER / DESTROY_OBSTACLE / EARN_GOLD 为「累计/进度」型，达标即完成
 * - FORBID_TOWER / FINISH_IN_TIME 为「约束」型：
 *      · 未完成的约束任务一旦违规（建了禁塔 / 超时）即显示「失败」（仅本局）
 *      · 但**已完成**的约束任务在重玩时即使再次违规，也始终保持「完成」，绝不翻成失败
 *
 * 用法：
 *   MissionManager.instance.startLevel(key);            // 进入关卡（载入已完成记录）
 *   MissionManager.instance.onEnemyKilled(type);         // 敌人死亡
 *   MissionManager.instance.onObstacleDestroyed(r,c);    // 障碍摧毁
 *   MissionManager.instance.onGoldEarned(n);             // 获得金币（击杀/障碍奖励，花费不扣减）
 *   MissionManager.instance.refreshTowers(entries);      // 场上塔变化（建/升/卖）
 *   MissionManager.instance.onTowerBuilt(type);          // 实际建造了一座塔（触发禁塔判定）
 *   MissionManager.instance.onWaveStarted();             // 首波开始（启动计时）
 *   MissionManager.instance.tickTime(dt);                // 每帧推进计时（触发超时判定）
 *   MissionManager.instance.onLevelCleared();            // 通关（结算约束任务成败）
 */
export class MissionManager {
    private static _instance: MissionManager | null = null;

    public static get instance(): MissionManager {
        if (!MissionManager._instance) MissionManager._instance = new MissionManager();
        return MissionManager._instance;
    }

    private _levelKey: string = '';
    private _missions: Mission[] = [];
    /** 永久已完成（来自 localStorage），重玩也保留 */
    private _completed: Set<string> = new Set();
    /** 本局失败（仅约束型任务，重玩清零） */
    private _failedThisRun: Set<string> = new Set();

    /** 本关内计数（重玩清零） */
    private _killByTower: Record<string, number> = {};
    private _towerCount: Record<string, number> = {};
    private _destroyedCells: Set<string> = new Set();
    /** 本局累计获得的金币（毛收入：建造/升级的花费不扣减） */
    private _earnedGold: number = 0;

    /** 计时（秒）：仅在首波开始后、通关前累加 */
    private _elapsed: number = 0;
    private _timing: boolean = false;
    private _cleared: boolean = false;

    /** 任务状态变化回调（用于刷新任务面板） */
    public onChange: (() => void) | null = null;

    // ==================== 生命周期 ====================

    /** 进入关卡：读取已完成任务，清空未完成计数与本局失败 */
    public startLevel(levelKey: string): void {
        this._levelKey = levelKey;
        this._missions = getLevelMissions(levelKey);
        this._killByTower = {};
        this._towerCount = {};
        this._destroyedCells = new Set();
        this._earnedGold = 0;
        this._failedThisRun = new Set();
        this._elapsed = 0;
        this._timing = false;
        this._cleared = false;
        this._completed = new Set(this._loadStore()[levelKey] ?? []);
        this._notify();
    }

    public get missions(): Mission[] {
        return this._missions;
    }

    public get hasMissions(): boolean {
        return this._missions.length > 0;
    }

    /** 已完成任务数 / 总任务数 */
    public get completedCount(): number {
        let n = 0;
        for (const m of this._missions) {
            if (this._completed.has(m.id)) n++;
        }
        return n;
    }

    // ==================== 事件上报 ====================

    /** 敌人被消灭：towerType 为最后一击的来源塔（未知来源传 null） */
    public onEnemyKilled(towerType: TowerType | null): void {
        if (!towerType) return;
        this._killByTower[towerType] = (this._killByTower[towerType] ?? 0) + 1;
        this._checkProgress();
    }

    /** 障碍被摧毁 */
    public onObstacleDestroyed(row: number, col: number): void {
        this._destroyedCells.add(`${row}_${col}`);
        this._checkProgress();
    }

    /**
     * 获得金币（毛收入）：击杀奖励 / 摧毁障碍奖励。
     * 只累加收入，建造与升级的花费不扣减 —— 即"花掉的钱不从这个减少"。
     */
    public onGoldEarned(amount: number): void {
        if (!amount || amount <= 0) return;
        this._earnedGold += amount;
        this._checkProgress();
    }

    /**
     * 场上塔发生变化（建造 / 升级 / 出售）后重新统计。
     * 统计的是「当前存在」的数量，而不是累计建造次数。
     */
    public refreshTowers(entries: TowerStatEntry[]): void {
        this._towerCount = {};
        for (const e of entries) {
            const key = `${e.type}_${e.level}`;
            this._towerCount[key] = (this._towerCount[key] ?? 0) + 1;
        }
        this._checkProgress();
    }

    /** 实际建造了一座塔：触发「禁止建造」/「数量上限」约束判定（已完成的任务跳过，不会翻失败） */
    public onTowerBuilt(type: TowerType): void {
        let changed = false;
        for (const m of this._missions) {
            if (m.type === MissionType.FORBID_TOWER) {
                if (this._completed.has(m.id) || this._failedThisRun.has(m.id)) continue;
                if (m.towerType === type) {
                    this._failedThisRun.add(m.id);
                    changed = true;
                }
            } else if (m.type === MissionType.LIMIT_TOWER) {
                if (this._completed.has(m.id) || this._failedThisRun.has(m.id)) continue;
                if (m.towerType === type && this._countTowerOfType(type) > (m.count ?? Infinity)) {
                    this._failedThisRun.add(m.id);
                    changed = true;
                }
            }
        }
        if (changed) this._notify();
    }

    /** 首波开始：启动限时计时 */
    public onWaveStarted(): void {
        if (!this._timing) this._timing = true;
    }

    /** 冻结计时（所有波次结束即调用，避免通关延迟期间误判超时） */
    public stopTiming(): void {
        this._timing = false;
    }

    /**
     * 该任务是否受时间约束（到点未达标即本局失败）。
     * - FINISH_IN_TIME：限时内通关
     * - EARN_GOLD：限时内攒够金币
     * - DESTROY_OBSTACLE：仅在显式配置了 timeLimit 时（限时清除障碍），否则不受时间约束
     */
    private _isTimed(m: Mission): boolean {
        if (m.type === MissionType.FINISH_IN_TIME || m.type === MissionType.EARN_GOLD) return true;
        return m.type === MissionType.DESTROY_OBSTACLE && typeof m.timeLimit === 'number';
    }

    /** 每帧推进计时（秒）。GameManager.update 中调用。 */
    public tickTime(dt: number): void {
        if (!this._timing || this._cleared) return;
        this._elapsed += dt;
        let changed = false;
        for (const m of this._missions) {
            if (!this._isTimed(m)) continue;
            if (this._completed.has(m.id) || this._failedThisRun.has(m.id)) continue;
            if (this._elapsed > (m.timeLimit ?? Infinity)) {
                this._failedThisRun.add(m.id);
                changed = true;
            }
        }
        if (changed) this._notify();
    }

    /** 通关：结算约束型任务（未失败即视为完成并永久记录） */
    public onLevelCleared(): void {
        this._cleared = true;
        this._timing = false;
        let changed = false;
        for (const m of this._missions) {
            if (m.type === MissionType.EARN_GOLD ||
                (m.type === MissionType.DESTROY_OBSTACLE && typeof m.timeLimit === 'number')) {
                // 限时型进度任务：关卡结束仍未达标 → 判失败（此后没有收入 / 没有时间了）
                if (this._completed.has(m.id) || this._failedThisRun.has(m.id)) continue;
                this._failedThisRun.add(m.id);
                changed = true;
                continue;
            }
            if (m.type !== MissionType.FORBID_TOWER && m.type !== MissionType.FINISH_IN_TIME && m.type !== MissionType.LIMIT_TOWER) continue;
            if (this._completed.has(m.id)) continue;       // 已完成则保持
            if (this._failedThisRun.has(m.id)) continue;    // 本局已失败则不补完成
            this._completed.add(m.id);
            CodexManager.discover('missions', m.type);
            changed = true;
        }
        if (changed) {
            this._saveStore();
            this._notify();
        }
    }

    // ==================== 查询 ====================

    /** 任务运行态 */
    public getState(m: Mission): MissionState {
        if (this._completed.has(m.id)) return 'completed';
        if (this._failedThisRun.has(m.id)) return 'failed';
        return 'active';
    }

    public isCompleted(m: Mission): boolean {
        return this._completed.has(m.id);
    }

    public isFailed(m: Mission): boolean {
        return this._failedThisRun.has(m.id);
    }

    /**
     * 查询某关隐藏任务是否全部完成（不依赖当前关状态，直接读持久化存储）。
     * 用于选关界面显示第 4 颗粉色彩星。无配置任务返回 false。
     */
    public static isAllHiddenCompleted(levelKey: string): boolean {
        const missions = getLevelMissions(levelKey);
        if (!missions.length) return false;
        let store: MissionStore = {};
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (data && typeof data === 'object') store = data as MissionStore;
            }
        } catch { /* 忽略 */ }
        const done = new Set(store[levelKey] ?? []);
        return missions.every(m => done.has(m.id));
    }

    /** 当前进度（已完成任务直接返回目标值） */
    public getProgress(m: Mission): number {
        if (this.isCompleted(m)) return this.getTarget(m);

        switch (m.type) {
            case MissionType.HAVE_TOWER: {
                let n = 0;
                const minLv = m.towerLevel ?? 1;
                for (let lv = minLv; lv <= 3; lv++) {
                    n += this._towerCount[`${m.towerType}_${lv}`] ?? 0;
                }
                return n;
            }
            case MissionType.KILL_BY_TOWER:
                return this._killByTower[m.towerType ?? ''] ?? 0;
            case MissionType.EARN_GOLD:
                return this._earnedGold;
            case MissionType.DESTROY_OBSTACLE: {
                let n = 0;
                for (const c of this._destroyTargets(m)) {
                    if (this._destroyedCells.has(`${c.row}_${c.col}`)) n++;
                }
                return n;
            }
            case MissionType.FINISH_IN_TIME:
                return Math.min(this._elapsed, m.timeLimit ?? Infinity);
            case MissionType.LIMIT_TOWER:
                return this._countTowerOfType(m.towerType ?? ('' as TowerType));
            case MissionType.FORBID_TOWER:
            default:
                return 0;
        }
    }

    /** 任务目标值 */
    public getTarget(m: Mission): number {
        if (m.type === MissionType.FINISH_IN_TIME) return m.timeLimit ?? 1;
        if (m.type === MissionType.FORBID_TOWER) return 1;
        if (m.type === MissionType.LIMIT_TOWER) return m.count ?? 1;
        if (m.type === MissionType.DESTROY_OBSTACLE) return this._destroyTargets(m).length || 1;
        return m.count ?? 1;
    }

    /** 摧毁类任务的目标格（多格优先，回退单格） */
    private _destroyTargets(m: Mission): { row: number; col: number }[] {
        if (Array.isArray(m.cells) && m.cells.length > 0) return m.cells;
        if (typeof m.row === 'number' && typeof m.col === 'number') return [{ row: m.row, col: m.col }];
        return [];
    }

    /** 统计当前场上某类型塔的总数量（跨等级） */
    private _countTowerOfType(type: TowerType): number {
        let n = 0;
        for (let lv = 1; lv <= 3; lv++) {
            n += this._towerCount[`${type}_${lv}`] ?? 0;
        }
        return n;
    }

    /** 限时任务已用秒数（供 UI 展示） */
    public getElapsedSeconds(): number {
        return this._elapsed;
    }

    // ==================== 内部 ====================

    /** 进度型任务达标即完成（约束型任务不在此处理） */
    private _checkProgress(): void {
        let changed = false;
        for (const m of this._missions) {
            if (m.type === MissionType.FORBID_TOWER || m.type === MissionType.FINISH_IN_TIME || m.type === MissionType.LIMIT_TOWER) continue;
            if (this._completed.has(m.id)) continue;
            if (this.getProgress(m) >= this.getTarget(m)) {
                this._completed.add(m.id);
                CodexManager.discover('missions', m.type);
                changed = true;
            }
        }
        if (changed) {
            this._saveStore();
            this._notify();
        }
    }

    private _notify(): void {
        if (this.onChange) this.onChange();
    }

    private _loadStore(): MissionStore {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return {};
            const data = JSON.parse(raw);
            return (data && typeof data === 'object') ? (data as MissionStore) : {};
        } catch {
            return {};
        }
    }

    private _saveStore(): void {
        try {
            const store = this._loadStore();
            store[this._levelKey] = Array.from(this._completed);
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
        } catch { /* localStorage 不可用时静默降级 */ }
    }

    /** 清空某关的任务完成记录（调试 / 想重新挑战时用） */
    public resetLevel(levelKey: string): void {
        const store = this._loadStore();
        delete store[levelKey];
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
        } catch { /* 忽略 */ }
        if (levelKey === this._levelKey) {
            this._completed = new Set();
            this._failedThisRun = new Set();
            this._notify();
        }
    }
}
