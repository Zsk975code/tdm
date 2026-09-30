import { _decorator, Component, EventTarget } from 'cc';
const { ccclass, property } = _decorator;

import { WaveData, WaveEnemy, LevelConfig } from '../Data/LevelData';
import { EnemyType } from '../Data/EnemyData';
import { DeveloperData } from '../Data/DeveloperData';

@ccclass('WaveManager')
export class WaveManager extends Component {
    private static _instance: WaveManager | null = null;

    public static readonly EVENT_WAVE_START = 'wave-start';
    public static readonly EVENT_WAVE_END = 'wave-end';
    public static readonly EVENT_ALL_WAVES_DONE = 'all-waves-done';
    public static readonly EVENT_SPAWN_ENEMY = 'spawn-enemy';
    public static readonly EVENT_MANUAL_NEXT_READY = 'manual-next-ready';
    public static readonly EVENT_AUTO_NEXT_TICK = 'auto-next-tick';

    /** 波清空后自动衔接下一波的间隔（秒），对 boss 波无效 */
    private static readonly AUTO_NEXT_DELAY = 5;

    public static get instance(): WaveManager {
        return this._instance;
    }

    private _eventTarget: EventTarget = new EventTarget();
    private waves: WaveData[] = [];
    private currentWaveIndex: number = -1;

    /** 当前波次索引（0 起；未开始时为 -1）。供分裂子怪等按波次取换皮 */
    public get currentWave(): number {
        return this.currentWaveIndex;
    }
    private isSpawning: boolean = false;
    private spawnQueue: { type: EnemyType; delay: number; hpMult?: number; noBlock?: boolean }[] = [];
    private spawnTimer: number = 0;
    private activeEnemyCount: number = 0;
    /** 计入「本波清空」判定的存活敌人数（排除 noBlock 组，如首波即刷、长期游走的 BOSS） */
    private blockingEnemyCount: number = 0;
    /** 本波是否已结算过（防止 noBlock 敌人在倒计时/结算后死亡时重复触发波次结束） */
    private waveClearSettled: boolean = false;
    private waveEnemyCount: number = 0;
    private autoNextPending: boolean = false;
    private autoNextTimer: number = 0;

    public get eventTarget(): EventTarget {
        return this._eventTarget;
    }

    public get totalWaves(): number {
        return this.waves.length;
    }

    public get isActive(): boolean {
        return this.isSpawning || this.activeEnemyCount > 0;
    }

    public get remainingEnemies(): number {
        return this.spawnQueue.length + this.activeEnemyCount;
    }

    onLoad(): void {
        WaveManager._instance = this;
    }

    onDestroy(): void {
        if (WaveManager._instance === this) {
            WaveManager._instance = null;
        }
    }

    public init(config: LevelConfig): void {
        this.waves = config.waves;
        this.currentWaveIndex = -1;
        this.isSpawning = false;
        this.spawnQueue = [];
        this.activeEnemyCount = 0;
        this.blockingEnemyCount = 0;
        this.waveClearSettled = false;
        this.autoNextPending = false;
        this.autoNextTimer = 0;
    }

    public startNextWave(): boolean {
        this.autoNextPending = false;
        this.autoNextTimer = 0;
        this.waveClearSettled = false;
        this.currentWaveIndex++;
        if (this.currentWaveIndex >= this.waves.length) {
            this._eventTarget.emit(WaveManager.EVENT_ALL_WAVES_DONE);
            return false;
        }

        const wave = this.waves[this.currentWaveIndex];
        this.buildSpawnQueue(wave);
        this.isSpawning = true;
        this.spawnTimer = 0;
        this.waveEnemyCount = this.spawnQueue.length;

        this._eventTarget.emit(WaveManager.EVENT_WAVE_START, this.currentWaveIndex, this.waves.length);
        return true;
    }

    /** 波清空后调度下一波：首波统一 5s 后自动开始（与普通关一致，不弹"下一波"按钮）；
     *  仅"非首波的 boss 波"才提示手动开始（实际 boss 关只有一波，基本不触发手动分支） */
    public scheduleNextWave(): void {
        if (this.currentWaveIndex >= this.waves.length - 1) return;
        const nextWave = this.waves[this.currentWaveIndex + 1];
        const isFirstWave = this.currentWaveIndex < 0;
        if (this.isBossWave(nextWave) && !isFirstWave) {
            this._eventTarget.emit(WaveManager.EVENT_MANUAL_NEXT_READY);
        } else {
            this.autoNextPending = true;
            this.autoNextTimer = WaveManager.AUTO_NEXT_DELAY;
        }
    }

    private isBossWave(wave: WaveData): boolean {
        return wave.enemies.some(e =>
            e.type === EnemyType.BOSS || e.type === EnemyType.SMALL_BOSS || e.type === EnemyType.BOSS_MODE || e.type === EnemyType.BOSS_MODE_FLYING);
    }

    private buildSpawnQueue(wave: WaveData): void {
        this.spawnQueue = [];
        const groups: { type: EnemyType; count: number; interval: number; delay: number; hpMult?: number; noBlock?: boolean }[] = [];

        for (const enemy of wave.enemies) {
            // 每个组 count 上限 100，总敌人数上限 500（防止编辑器数值异常导致 OOM）
            const safeCount = Math.min(enemy.count, 100);
            groups.push({
                type: enemy.type,
                count: safeCount,
                interval: enemy.interval,
                delay: enemy.delay,
                hpMult: enemy.hpMult,
                noBlock: enemy.noBlock,
            });
        }

        let maxTime = 0;
        for (const group of groups) {
            const groupEndTime = group.delay + (group.count - 1) * group.interval;
            if (groupEndTime > maxTime) maxTime = groupEndTime;
        }

        const timeSlots: { type: EnemyType; time: number; hpMult?: number; noBlock?: boolean }[] = [];
        for (const group of groups) {
            for (let i = 0; i < group.count; i++) {
                timeSlots.push({
                    type: group.type,
                    time: group.delay + i * group.interval,
                    hpMult: group.hpMult,
                    noBlock: group.noBlock,
                });
            }
        }

        timeSlots.sort((a, b) => a.time - b.time);

        // 单波次总敌人数硬上限，防止异常数据导致 OOM
        const MAX_WAVE_ENEMIES = 500;
        if (timeSlots.length > MAX_WAVE_ENEMIES) {
            timeSlots.length = MAX_WAVE_ENEMIES;
        }

        let prevTime = 0;
        for (const slot of timeSlots) {
            this.spawnQueue.push({
                type: slot.type,
                delay: slot.time - prevTime,
                hpMult: slot.hpMult,
                noBlock: slot.noBlock,
            });
            prevTime = slot.time;
        }
    }

    /** noBlock=true 的敌人不计入「本波清空」判定（详见 WaveEnemy.noBlock） */
    public onEnemySpawned(noBlock?: boolean): void {
        this.activeEnemyCount++;
        if (!noBlock) this.blockingEnemyCount++;
    }

    public onEnemyDied(noBlock?: boolean): void {
        // clamp 到 0：重复/跨关卡的回调会让计数变负，
        // 进而在下一波开始时使 checkWaveComplete 立即误判"本波已清空"
        this.activeEnemyCount = Math.max(0, this.activeEnemyCount - 1);
        if (!noBlock) this.blockingEnemyCount = Math.max(0, this.blockingEnemyCount - 1);
        this.checkWaveComplete();
    }

    public onEnemyReachedEnd(noBlock?: boolean): void {
        this.activeEnemyCount = Math.max(0, this.activeEnemyCount - 1);
        if (!noBlock) this.blockingEnemyCount = Math.max(0, this.blockingEnemyCount - 1);
        this.checkWaveComplete();
    }

    private checkWaveComplete(): void {
        // 已结算 / 正在倒计时：忽略。避免 noBlock 的 BOSS 在此期间死亡时
        // 重复触发 WAVE_END 并把 5s 倒计时重置（表现为波次卡住或重复结算）
        if (this.waveClearSettled || this.autoNextPending) return;
        if (!this.isSpawning && this.blockingEnemyCount <= 0 && this.currentWaveIndex >= 0) {
            this.waveClearSettled = true;
            this._eventTarget.emit(WaveManager.EVENT_WAVE_END, this.currentWaveIndex);

            if (this.currentWaveIndex >= this.waves.length - 1) {
                this._eventTarget.emit(WaveManager.EVENT_ALL_WAVES_DONE);
            } else {
                this.scheduleNextWave();
            }
        }
    }

    update(dt: number): void {
        if (this.autoNextPending) {
            if (!DeveloperData.instance.paused) {
                this.autoNextTimer -= dt;
                this._eventTarget.emit(WaveManager.EVENT_AUTO_NEXT_TICK, Math.max(0, this.autoNextTimer));
                if (this.autoNextTimer <= 0) {
                    this.autoNextPending = false;
                    this.startNextWave();
                }
            }
            return;
        }
        if (!this.isSpawning) return;
        // 空波次（如敌人数为 0 的自定义关卡）必须在此收尾：
        // 原写法直接 return，isSpawning 会永远为 true → isActive 恒真 → 无法开始下一波
        if (this.spawnQueue.length === 0) {
            this.isSpawning = false;
            this.checkWaveComplete();
            return;
        }
        if (DeveloperData.instance.paused) return;

        const scaledDt = dt * DeveloperData.instance.speedMultiplier;
        this.spawnTimer += scaledDt;
        const nextSpawn = this.spawnQueue[0];

        if (this.spawnTimer >= nextSpawn.delay) {
            this.spawnTimer -= nextSpawn.delay;
            this.spawnQueue.shift();
            this._eventTarget.emit(WaveManager.EVENT_SPAWN_ENEMY, nextSpawn.type, this.currentWaveIndex, nextSpawn.hpMult, nextSpawn.noBlock);

            if (this.spawnQueue.length === 0) {
                this.isSpawning = false;
            }
        }
    }

    public reset(): void {
        this.currentWaveIndex = -1;
        this.isSpawning = false;
        this.spawnQueue = [];
        this.activeEnemyCount = 0;
        this.blockingEnemyCount = 0;
        this.waveClearSettled = false;
        this.spawnTimer = 0;
        this.autoNextPending = false;
        this.autoNextTimer = 0;
    }
}