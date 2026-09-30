import { AudioClip, AudioSource, Component, Node, resources } from 'cc';

/**
 * 音频管理器 —— 统一管理 BGM 与音效。
 *
 * 素材来源：项目自绘 / 已授权音频，共 21 个，导入到 `assets/resources/Art/Audio/`。
 * 使用：在持久组件（GameManager）里调用一次 `AudioManager.init(this)`。
 *
 * 设计原则：
 * - 所有接口对「未加载 / 素材缺失」静默降级，绝不抛错影响游戏。
 * - 高频事件（如敌人死亡）用 `playSfxThrottled` 限流，避免音效叠加刺耳。
 * - BGM 支持「切关卡/回菜单」时切换与同一首不重播。
 */
export class AudioManager {
    private static _bgm: AudioSource | null = null;
    private static _sfx: AudioSource | null = null;
    private static _clips: Map<string, AudioClip> = new Map();
    private static _ready: boolean = false;

    private static _bgmVolume: number = 0.35;
    private static _sfxVolume: number = 0.7;
    /** 当前应播放的 BGM 名（即使素材尚未加载完也会记住，加载完自动补播） */
    private static _currentBgm: string = '';
    /** 音效限流：name → 上次播放时间（秒，performance.now 基准） */
    private static _lastPlayed: Map<string, number> = new Map();

    // ── 音效名（对应 Art/Audio/{name}.mp3） ──
    public static readonly SFX = {
        TOWER_BUILD: 'tower_build',
        TOWER_UPGRADE: 'tower_upgrade',
        TOWER_SELL: 'tower_sell',
        TOWER_SELECT: 'tower_select',
        UI_CLICK: 'ui_click',
        UI_BUY: 'ui_buy',
        GAME_START: 'game_start',
        WAVE_GO: 'wave_go',
        FINAL_WAVE: 'final_wave',
        COUNTDOWN: 'countdown',
        EXPLOSION: 'explosion',
        ROCK_BREAK: 'rock_break',
        CHEST_OPEN: 'chest_open',
        COIN: 'coin',
        VICTORY: 'victory',
        DEFEAT: 'defeat',
        BOSS_SPAWN: 'boss_spawn',
        ENEMY_HIT: 'enemy_hit',
    } as const;

    public static readonly BGM_MAIN = 'bgm_main';
    public static readonly BGM_GAME = 'bgm_game';

    /** 预载的音频清单 */
    private static readonly ALL_CLIPS: string[] = [
        AudioManager.BGM_MAIN, AudioManager.BGM_GAME,
        'tower_build', 'tower_upgrade', 'tower_sell', 'tower_select',
        'ui_click', 'ui_buy', 'game_start', 'wave_go', 'final_wave', 'countdown',
        'explosion', 'rock_break', 'chest_open', 'coin',
        'victory', 'defeat', 'boss_spawn', 'enemy_hit',
    ];

    public static get isReady(): boolean {
        return this._ready;
    }

    /** 初始化：在持久组件（GameManager）上挂两个 AudioSource 并预载素材 */
    public static init(host: Component): void {
        if (this._ready || !host || !host.node || !host.node.isValid) return;

        const bgmNode = new Node('BgmSource');
        host.node.addChild(bgmNode);
        this._bgm = bgmNode.addComponent(AudioSource);
        this._bgm.loop = true;
        this._bgm.volume = this._bgmVolume;

        const sfxNode = new Node('SfxSource');
        host.node.addChild(sfxNode);
        this._sfx = sfxNode.addComponent(AudioSource);
        this._sfx.loop = false;
        this._sfx.volume = this._sfxVolume;

        this._ready = true;
        for (const n of this.ALL_CLIPS) this.loadClip(n);
    }

    private static loadClip(name: string): void {
        if (this._clips.has(name)) return;
        resources.load(`Art/Audio/${name}`, AudioClip, (err, clip) => {
            if (err || !clip) return;   // 素材缺失：静默忽略
            this._clips.set(name, clip);
            // 若等待的正是当前 BGM，加载完立即补播（避免开局 BGM 丢失）
            if (name === this._currentBgm && this._bgm && !this._bgm.playing) {
                this._bgm.clip = clip;
                this._bgm.volume = this._bgmVolume;
                this._bgm.play();
            }
        });
    }

    // ── BGM ──

    public static playBgm(name: string): void {
        if (this._currentBgm === name && this._bgm?.playing) return;
        this._currentBgm = name;
        const clip = this._clips.get(name);
        if (!clip || !this._bgm) return;   // 未加载完 → 由 loadClip 回调补播
        this._bgm.stop();
        this._bgm.clip = clip;
        this._bgm.volume = this._bgmVolume;
        this._bgm.play();
    }

    public static stopBgm(): void {
        this._currentBgm = '';
        this._bgm?.stop();
    }

    // ── 音效 ──

    public static playSfx(name: string): void {
        const clip = this._clips.get(name);
        if (!clip || !this._sfx) return;
        this._sfx.playOneShot(clip, this._sfxVolume);
    }

    /** 限流播放：同一音效在 minIntervalSec 秒内最多播一次（用于高频事件，如击杀） */
    public static playSfxThrottled(name: string, minIntervalSec: number = 0.08): void {
        const now = Date.now() / 1000;
        const last = this._lastPlayed.get(name) ?? -Infinity;
        if (now - last < minIntervalSec) return;
        this._lastPlayed.set(name, now);
        this.playSfx(name);
    }

    // ── 音量 ──

    public static setBgmVolume(v: number): void {
        this._bgmVolume = Math.max(0, Math.min(1, v));
        if (this._bgm) this._bgm.volume = this._bgmVolume;
    }

    public static setSfxVolume(v: number): void {
        this._sfxVolume = Math.max(0, Math.min(1, v));
    }

    public static getBgmVolume(): number { return this._bgmVolume; }
    public static getSfxVolume(): number { return this._sfxVolume; }
}
