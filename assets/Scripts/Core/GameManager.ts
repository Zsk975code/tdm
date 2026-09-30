import { _decorator, Component, Node, Vec3, Color, UITransform, Graphics, Label, EventTouch, Overflow, HorizontalTextAlignment, VerticalTextAlignment, Layers, view, Sprite, Camera, game, tween, UIOpacity, Tween, input, Input, KeyCode, EventMouse, EventKeyboard } from 'cc';
const { ccclass } = _decorator;

import { LevelConfig, getLevelConfig, getAllLevelConfigs, calcLevelStars, saveLevelStars, getLevelStarKey, calcWaveHpMult, ObstacleType, OBSTACLE_DEFS, LevelMode, calcBossStars } from '../Data/LevelData';
import { TowerType, ALL_TOWER_TYPES, TOWER_COLORS, TOWER_CONFIGS, getTowerConfig } from '../Data/TowerData';
import { EnemyType, ALL_ENEMY_TYPES } from '../Data/EnemyData';
import { DeveloperData } from '../Data/DeveloperData';
import { MissionType } from '../Data/MissionData';
import { MapManager, CellType } from './MapManager';
import { WaveManager } from './WaveManager';
import { CurrencyManager } from './CurrencyManager';
import { GoldPopup } from './GoldPopup';
import { MissionManager, TowerStatEntry } from './MissionManager';
import { Tower } from '../Entity/Tower';
import { Enemy } from '../Entity/Enemy';
import { Bullet } from '../Entity/Bullet';
import { Radish } from '../Entity/Radish';
import { Obstacle } from '../Entity/Obstacle';
import { SpriteManager } from '../Utils/SpriteManager';
import { EffectManager } from '../Utils/EffectManager';
import { applyTextOutline } from '../Utils/UIText';
import { destroyChildren } from '../Utils/NodeUtil';
import { AudioManager } from '../Utils/AudioManager';

export enum GameState {
    MENU = 'menu',
    PLAYING = 'playing',
    GAME_OVER = 'game_over',
    VICTORY = 'victory',
}

@ccclass('GameManager')
export class GameManager extends Component {
    private mapNode: Node = null!;
    private enemyNode: Node = null!;
    private towerNode: Node = null!;
    private bulletNode: Node = null!;
    private uiNode: Node = null!;
    // 游戏内 UI 专用容器：与 UIManager 创建的主菜单/选关/编辑器屏幕平级地挂在 uiNode 下。
    // 重建 UI 时只销毁本容器，绝不波及 UIManager 持有的屏幕节点（否则其组件 node 变 null → 崩溃）。
    private _inGameRoot: Node = null!;

    private goldLabel: Label = null!;
    private livesLabel: Label = null!;
    private waveLabel: Label = null!;
    private nextWaveBtn: Node = null!;

    /** 隐藏任务（彩星条件）面板与行标签 */
    private _missionPanel: Node = null!;
    private _missionRows: Label[] = [];
    private _missionBtnLabel: Label = null!;
    private _missionBtnNode: Node = null!;

    private buildPopupNode: Node = null!;
    private towerPanelNode: Node = null!;
    private _spotHighlightNode: Node = null!;   // 地图塔位「待建」选中高亮
    private _rangePreviewNode: Node = null!;    // 地图攻击范围预览圈
    private gameOverPanelNode: Node = null!;

    private tpNameLabel: Label = null!;
    private tpLevelLabel: Label = null!;
    private tpDamageLabel: Label = null!;
    private tpRangeLabel: Label = null!;
    private tpFireRateLabel: Label = null!;
    private tpAuraLabel: Label = null!;
    private tpUpgradeBtn: Node = null!;
    private tpUpgradeCostLabel: Label = null!;
    private tpSellBtn: Node = null!;
    private tpSellValueLabel: Label = null!;
    private currentTower: Tower | null = null;
    /** 玩家手动点击标记的障碍物（附近塔会集中攻击它） */
    private markedObstacle: Obstacle | null = null;

    private goTitleLabel: Label = null!;
    private goMsgLabel: Label = null!;
    private goRestartBtn: Node = null!;
    private goNextBtn: Node = null!;
    private goMenuBtn: Node = null!;
    private goStarLabels: Label[] = [];

    public static onBackToMenu: (() => void) | null = null;

    private _gameState: GameState = GameState.MENU;
    private _currentLevel: number = 0;
    private _currentLevelConfig: LevelConfig | null = null;
    private _currentMode: LevelMode = LevelMode.WAVE;
    private _bossTimeLimit: number = 0;
    private _bossTimeRemaining: number = 0;
    private _bossTimedOut: boolean = false;
    /** Boss战开局准备宽限（秒）：此期间不扣倒计时，与普通关首波 5s 后开始一致 */
    private _bossGrace: number = 0;
    /** Boss战剩余时间 HUD 标签 */
    private _bossTimeLabel: Label = null!;
    private _selectedSpotRow: number = -1;
    private _selectedSpotCol: number = -1;
    private _isConfirmOpen: boolean = false;
    private _devPanelNode: Node = null!;
    private _confirmNode: Node = null!;
    private _speedBtnLabel: Label = null!;
    private _pauseBtnLabel: Label = null!;
    private _devBtnNode: Node = null!;
    /** 开发者技能按钮节点（用于"永久技能已生效"打勾/置灰） */
    private _devSkillBtns: Node[] = [];
    /** 开发者技能按钮的原始文案 */
    private _devSkillLabels: string[] = [];
    /** 各开发者技能本关是否已生效（永久类不可重复使用，进关重置） */
    private _devSkillUsed: boolean[] = [];
    private _confirmCallback: (() => void) | null = null;
    /** 防止最后一波结束后重复点击"下一波"导致 ALL_WAVES_DONE 二次触发 */
    private _allWavesHandled: boolean = false;
    /** 波次自动衔接倒计时提示（"下一波 5s"） */
    private autoNextLabel: Label = null!;
    /** 暂停时显示的全屏遮罩（仅视觉提示，不拦截输入） */
    private _pauseOverlay: Node = null!;
    /** 轻量提示气泡（金币不足等） */
    private _toastLabel: Label = null!;
    private _toastTimer: number = 0;
    /** 进关引导提示横幅 */
    private _hintNode: Node = null!;
    private _hintLabel: Label = null!;

    onLoad(): void {
        // 确保层节点存在（自建，不依赖 UIManager 时序）
        this.mapNode = this.ensureLayerNode('MapLayer');
        this.enemyNode = this.ensureLayerNode('EnemyLayer');
        this.towerNode = this.ensureLayerNode('TowerLayer');
        this.bulletNode = this.ensureLayerNode('BulletLayer');
        this.uiNode = this.ensureLayerNode('UILayer');

        // 音频系统：在持久组件上挂 AudioSource 并预载素材
        AudioManager.init(this);

        // 游戏内 UI 独立容器：所有 HUD/面板都挂在它下面，避免重建时误删 UIManager 的屏幕节点
        this._inGameRoot = this.ensureLayerNode('InGameUI');

        this.node.addComponent(MapManager);
        this.node.addComponent(WaveManager);
        this.node.addComponent(CurrencyManager);

        this.buildInGameUI();
        this.setupListeners();

        // 初始处于主菜单：游戏内 UI 应隐藏，由 startGame 进入关卡时再显示
        this.setGameUIActive(false);

        // 预先启动素材加载（不阻塞 UI 初始化）
        SpriteManager.preloadAll();

        // 统一主相机兜底背景色（避免不同分辨率露出默认浅色边框 / 透明区域透出异色）
        this.setCameraBackground();
    }

    /** 统一主相机背景色：与 level_bg / UI 暗色主题保持一致 */
    private setCameraBackground(): void {
        const scene = this.node.scene;
        if (!scene) return;
        const camera = scene.getComponentInChildren(Camera);
        if (camera) {
            camera.backgroundColor = new Color(44, 76, 48, 255);
            camera.clearFlags = Camera.ClearFlag.COLOR | Camera.ClearFlag.DEPTH;
        }
    }

    /** 确保层节点存在，若不存在则创建 */
    private ensureLayerNode(name: string): Node {
        let node = this.node.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.addComponent(UITransform).setContentSize(1920, 1080);
            node.layer = Layers.Enum.UI_2D;
            this.node.addChild(node);
        }
        return node;
    }

    onDestroy(): void {
        this.removeListeners();
    }

    /** 预加载所有美术素材（等待完成后再进入游戏） */
    async start(): Promise<void> {
        console.log('[GameManager] start() 触发，开始预加载素材');
        EffectManager.init(this);
        await SpriteManager.preloadAll();
        console.log('[GameManager] 素材预加载完成');
        // onLoad 阶段构建 UI 时素材尚未就绪，所有精灵都走了兜底绘制（彩块/emoji），
        // 且后续不会自动刷新。素材就绪后重建一次，让 UI 真正用上美术资源。
        this.rebuildInGameUI();
    }

    private makeNode(name: string, parent: Node, w: number, h: number, x = 0, y = 0): Node {
        const n = new Node(name);
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform).setContentSize(w, h);
        n.setPosition(x, y, 0);
        parent.addChild(n);
        return n;
    }

    private makeRect(name: string, parent: Node, w: number, h: number, color: Color, x = 0, y = 0): Node {
        const n = this.makeNode(name, parent, w, h, x, y);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        return n;
    }

    /** Overlay a panel sprite as decoration on a panel parent node */
    private addPanelDecor(spriteName: string, parent: Node, w: number, h: number): void {
        if (!SpriteManager.isReady()) return;
        const sf = SpriteManager.getUIFrame(spriteName);
        if (!sf) return;
        const decor = new Node('PanelSprite');
        decor.layer = Layers.Enum.UI_2D;
        (decor.getComponent(UITransform) || decor.addComponent(UITransform)).setContentSize(w, h);
        const sp = decor.addComponent(Sprite);
        sp.spriteFrame = sf;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        parent.addChild(decor);
        decor.setPosition(0, 0, 0);
    }

    private makeLabel(name: string, parent: Node, w: number, h: number, text: string, fontSize: number, color: Color, x = 0, y = 0): Label {
        const n = this.makeNode(name, parent, w, h, x, y);
        const lb = n.addComponent(Label);
        lb.string = text;
        lb.fontSize = fontSize;
        lb.lineHeight = fontSize + 4;
        lb.color = color;
        applyTextOutline(lb, Math.max(2, Math.round(fontSize / 8)), color);
        lb.overflow = Overflow.NONE;
        lb.horizontalAlign = HorizontalTextAlignment.CENTER;
        lb.verticalAlign = VerticalTextAlignment.CENTER;
        return lb;
    }

    private makeButton(name: string, parent: Node, w: number, h: number, bgColor: Color, text: string, fontSize: number, fontColor: Color, x = 0, y = 0, callback?: (event: EventTouch) => void): Node {
        const btn = this.makeNode(name, parent, w, h, x, y);

        // A10: 优先使用 btn_normal 精灵背景
        const btnNormalSf = SpriteManager.getUIFrame('btn_normal');
        if (btnNormalSf) {
            SpriteManager.setNodeSprite(btn, btnNormalSf, w, h);
        } else {
            this.makeRect('Bg', btn, w, h, bgColor, 0, 0);
        }

        this.makeLabel('Txt', btn, w, h, text, fontSize, fontColor);
        if (callback) {
            btn.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                AudioManager.playSfx(AudioManager.SFX.UI_CLICK);
                callback(e);
            }, this);
        }

        // A10: hover 按钮交互（鼠标/触摸悬停时切换素材）
        const btnHoverSf = SpriteManager.getUIFrame('btn_hover');
        if (btnNormalSf && btnHoverSf) {
            btn.on(Node.EventType.TOUCH_START, () => {
                const s = btn.getComponent(Sprite);
                if (s) { s.spriteFrame = btnHoverSf; }
            });
            btn.on(Node.EventType.TOUCH_END, () => {
                const s = btn.getComponent(Sprite);
                if (s) { s.spriteFrame = btnNormalSf; }
            });
            btn.on(Node.EventType.TOUCH_CANCEL, () => {
                const s = btn.getComponent(Sprite);
                if (s) { s.spriteFrame = btnNormalSf; }
            });
            btn.on(Node.EventType.MOUSE_ENTER, () => {
                const s = btn.getComponent(Sprite);
                if (s) { s.spriteFrame = btnHoverSf; }
            });
            btn.on(Node.EventType.MOUSE_LEAVE, () => {
                const s = btn.getComponent(Sprite);
                if (s) { s.spriteFrame = btnNormalSf; }
            });
        }

        return btn;
    }

    private buildInGameUI(): void {
        this.buildHUD();
        this.buildBuildPopup();
        this.buildTowerPanel();
        this.buildGameOverPanel();
        this.buildConfirmDialog();
        this.buildDeveloperPanel();
    }

    /**
     * 仅重建游戏内 UI 容器下的节点，不触碰 UIManager 管理的主菜单/选关/编辑器屏幕。
     * 旧逻辑直接 clearLayer(uiNode) 会把那些屏幕节点一起销毁，
     * 导致 UIManager.hideAllScreens 访问已销毁组件的 .node（为 null）而崩溃。
     */
    private rebuildInGameUI(): void {
        this.clearLayer(this._inGameRoot);
        this.buildInGameUI();

        // 恢复默认隐藏状态（HUD 保持显示）
        this.resetInGameUIState();

        // 不在此处主动 setGameUIActive(true)：
        // 该回调也可能在"初始预加载完成时"触发（此时玩家还在主菜单），
        // 若强制打开 _inGameRoot 会导致 HUD 叠在主菜单之上。
        // 游戏内 UI 可见性由 startGame/returnToMenu 控制即可。
    }

    /**
     * 统一重置游戏内 UI 的默认隐藏状态。
     * rebuildInGameUI / startLevel 共用同一份逻辑，避免新增子面板时只在其中一处设置而漏掉另一处
     * （历史上「开发者按钮」就是因为只在 rebuildInGameUI 里设置、startLevel 漏设而不显示）。
     */
    private resetInGameUIState(): void {
        this.hideBuildPopup();
        this.towerPanelNode.active = false;
        this.gameOverPanelNode.active = false;
        this._confirmNode.active = false;
        this._devPanelNode.active = false;
        this._devBtnNode.active = DeveloperData.instance.devModeEnabled;
        this._isConfirmOpen = false;
        this._confirmCallback = null;
        this.currentTower = null;
    }

    /**
     * 重置开发者运行时状态（倍速 / 暂停）并同步按钮文字与遮罩。
     * speedMultiplier / paused 是全局单例，若不重置，用 2x 或暂停后重开/进下一关会带着旧状态继续，
     * 且按钮文字被 buildHUD 重画成默认值后会与实际状态不符（显示的 1x 其实是 2x）。
     */
    private resetDevRuntimeState(): void {
        const devData = DeveloperData.instance;
        devData.speedMultiplier = 1;
        devData.paused = false;
        if (this._speedBtnLabel) this._speedBtnLabel.string = '1x';
        if (this._pauseBtnLabel) this._pauseBtnLabel.string = '暂停';
        if (this._pauseOverlay) this._pauseOverlay.active = false;
        this.setTweensPaused(false);
    }

    private buildHUD(): void {
        const hud = this.makeNode('HUD', this._inGameRoot, 1920, 45, 0, 517);

        // HUD 精灵背景：使用明亮卡通主题的奶油色 hud_bar（深字在浅底上清晰）
        const sfBg = SpriteManager.getUIFrame('hud_bar');
        if (sfBg) {
            SpriteManager.setNodeSprite(hud, sfBg, 1920, 45);
        } else {
            this.makeRect('HudBg', hud, 1920, 42, new Color(233, 217, 184, 235), 0, 0);
        }

        // 左侧信息：金币 - 生命 - 波次
        const goldIconSf = SpriteManager.getUIFrame('icon_gold');
        if (goldIconSf) {
            SpriteManager.setNodeSprite(this.makeNode('GoldIcon', hud, 24, 24, -850, 0), goldIconSf, 24, 24);
        } else {
            this.makeLabel('GoldIcon', hud, 28, 28, '💰', 20, Color.WHITE, -850, 0);
        }
        this.goldLabel = this.makeLabel('Gold', hud, 100, 28, '0G', 18, new Color(150, 96, 16), -785, 0);

        const lifeIconSf = SpriteManager.getUIFrame('icon_life');
        if (lifeIconSf) {
            SpriteManager.setNodeSprite(this.makeNode('LifeIcon', hud, 24, 24, -650, 0), lifeIconSf, 24, 24);
        } else {
            this.makeLabel('LivesIcon', hud, 28, 28, '❤️', 20, Color.WHITE, -650, 0);
        }
        this.livesLabel = this.makeLabel('Lives', hud, 100, 28, '10/10', 18, new Color(170, 44, 44), -590, 0);
        this.makeLabel('WaveIcon', hud, 28, 28, '⚔️', 20, Color.WHITE, -460, 0);
        this.waveLabel = this.makeLabel('Wave', hud, 100, 28, '0/0', 18, new Color(64, 44, 28), -400, 0);

        // Boss战剩余时间（开局 5s 准备宽限内显示"准备 Ns"，之后显示"剩余 Ns"）
        this._bossTimeLabel = this.makeLabel('BossTime', hud, 240, 28, '', 18, new Color(170, 44, 44), 320, 0);
        this._bossTimeLabel.node.active = false;

        // 中央控制按钮
        const btnY = 0;
        const btnH = 34;

        // 倍速按钮
        const speedBtn = this.makeButton(
            'SpeedBtn', hud, 55, btnH,
            new Color(50, 80, 130), '1x', 14, Color.WHITE,
            -140, btnY, () => { this.toggleSpeed(); }
        );
        this._speedBtnLabel = speedBtn.getChildByName('Txt')!.getComponent(Label)!;

        // 暂停按钮
        const pauseBtn = this.makeButton(
            'PauseBtn', hud, 65, btnH,
            new Color(130, 110, 50), '暂停', 14, Color.WHITE,
            -70, btnY, () => { this.togglePause(); }
        );
        this._pauseBtnLabel = pauseBtn.getChildByName('Txt')!.getComponent(Label)!;

        // 返回选关
        this.makeButton(
            'BackBtn', hud, 45, btnH,
            new Color(80, 60, 100), '←', 18, Color.WHITE,
            0, btnY, () => { this.onBackToLevelsClick(); }
        );

        // 重新开始
        this.makeButton(
            'RestartBtn', hud, 45, btnH,
            new Color(140, 80, 50), '↻', 18, Color.WHITE,
            55, btnY, () => { this.onRestartClick(); }
        );

        // 开发者按钮
        this._devBtnNode = this.makeButton(
            'DevBtn', hud, 50, btnH,
            new Color(90, 90, 90), '开发', 12, new Color(180, 180, 180),
            120, btnY, () => { this.toggleDevPanel(); }
        );

        // 右侧"下一波"按钮（精灵优先）
        const nwX = 420;
        const nwW = 140;
        const nwH = 38;
        this.nextWaveBtn = this.makeNode('NextWaveBtn', hud, nwW, nwH, nwX, 0);
        const nwSf = SpriteManager.getUIFrame('btn_green');
        if (nwSf) {
            SpriteManager.setNodeSprite(this.nextWaveBtn, nwSf, nwW, nwH);
        } else {
            const nwBg = this.nextWaveBtn.addComponent(Graphics);
            nwBg.fillColor = new Color(50, 150, 50);
            nwBg.rect(-nwW / 2, -nwH / 2, nwW, nwH);
            nwBg.fill();
        }
        this.makeLabel('Txt', this.nextWaveBtn, nwW, nwH, '下一波', 16, Color.WHITE);
        this.nextWaveBtn.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            this.startNextWave();
        }, this);
        this.nextWaveBtn.active = false;

        // 波次自动衔接倒计时提示（普通波 5s 后自动开下一波时显示）
        this.autoNextLabel = this.makeLabel('AutoNextLbl', hud, 220, nwH, '', 16, new Color(150, 96, 16), nwX, 0);
        this.autoNextLabel.node.active = false;

        // 隐藏任务按钮：仅当本关配置了任务时才显示（见 startLevel）
        this._missionBtnNode = this.makeButton(
            'MissionBtn', hud, 72, btnH,
            new Color(115, 70, 140), '任务', 14, Color.WHITE,
            185, btnY, () => { this.toggleMissionPanel(); }
        );
        this._missionBtnLabel = this._missionBtnNode.getChildByName('Txt')!.getComponent(Label)!;
        this._missionBtnNode.active = false;

        // 暂停遮罩、提示气泡、进关引导（均为游戏内 UI 的体验优化）
        this.buildPauseOverlay();
        this.buildToast();
        this.buildHint();

        // 隐藏任务面板（默认关闭，点按钮展开）
        this.buildMissionPanel();
    }

    // ==================== 体验优化：暂停遮罩 / 提示气泡 / 进关引导 ====================

    private buildPauseOverlay(): void {
        if (!this._inGameRoot) return;
        this._pauseOverlay = this.makeNode('PauseOverlay', this._inGameRoot, 1920, 1080, 0, 0);
        const og = this._pauseOverlay.addComponent(Graphics);
        og.fillColor = new Color(0, 0, 0, 150);
        og.rect(-960, -540, 1920, 1080);
        og.fill();
        this.makeLabel('PauseText', this._pauseOverlay, 600, 60, '⏸ 游戏已暂停', 40, Color.WHITE, 0, 0);
        // 置于 _inGameRoot 最底层：HUD 按钮仍清晰可见且可点击（遮罩不挂触摸监听，不会拦截输入）
        this._pauseOverlay.setSiblingIndex(0);
        this._pauseOverlay.active = false;
    }

    private hidePauseOverlay(): void {
        if (this._pauseOverlay) this._pauseOverlay.active = false;
    }

    private buildToast(): void {
        if (!this._inGameRoot) return;
        this._toastLabel = this.makeLabel('Toast', this._inGameRoot, 420, 40, '', 18, new Color(255, 240, 180), 0, 380);
        this._toastLabel.node.active = false;
        this._toastTimer = 0;
    }

    /** 短暂显示一条提示（金币不足等），1.6s 内自动淡出 */
    private showToast(msg: string): void {
        if (!this._toastLabel || !this._toastLabel.node) return;
        this._toastLabel.string = msg;
        this._toastLabel.node.active = true;
        this._toastLabel.color = new Color(255, 240, 180, 255);
        this._toastTimer = 1.6;
    }

    private tickToast(dt: number): void {
        if (this._toastTimer <= 0) return;
        this._toastTimer -= dt;
        if (this._toastLabel && this._toastLabel.node) {
            const a = Math.max(0, Math.min(255, Math.round(this._toastTimer * 160)));
            this._toastLabel.color = new Color(255, 240, 180, a);
            if (this._toastTimer <= 0) this._toastLabel.node.active = false;
        }
    }

    private buildHint(): void {
        if (!this._inGameRoot) return;
        this._hintNode = this.makeNode('LevelHint', this._inGameRoot, 920, 56, 0, -430);
        const g = this._hintNode.addComponent(Graphics);
        g.fillColor = new Color(30, 42, 30, 210);
        g.roundRect(-460, -28, 920, 56, 14);
        g.fill();
        g.strokeColor = new Color(150, 200, 150, 160);
        g.lineWidth = 2;
        g.roundRect(-460, -28, 920, 56, 14);
        g.stroke();
        this._hintLabel = this.makeLabel('HintText', this._hintNode, 900, 30, '', 18, Color.WHITE, 0, 0);
        this._hintNode.active = false;
    }

    private showHint(msg: string): void {
        if (!this._hintNode || !this._hintLabel) return;
        this._hintLabel.string = msg;
        this._hintNode.active = true;
        this._hintNode.setPosition(0, -430, 0);
        // 5s 后自动消失（重开关卡时该延时会被 unscheduleAllCallbacks 取消）
        this.scheduleOnce(() => this.hideHint(), 5);
    }

    private hideHint(): void {
        if (this._hintNode) this._hintNode.active = false;
    }

    // ==================== 隐藏任务（彩星条件）UI ====================

    private buildMissionPanel(): void {
        const w = 470;
        const h = 220;
        // 在 buildHUD 末尾创建 → 层级位于 HUD 之上
        this._missionPanel = this.makeNode('MissionPanel', this._inGameRoot, w, h, 0, 300);
        this._missionPanel.active = false;

        // 背景吃掉点击，避免穿透到地图
        const bg = this.makeRect('MissionBg', this._missionPanel, w, h, new Color(38, 50, 38, 246), 0, 0);
        bg.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; }, this);

        this.makeLabel('MissionTitle', this._missionPanel, 300, 30, '隐藏任务', 22, new Color(255, 215, 90), 0, h / 2 - 30);
        this.makeLabel('MissionHint', this._missionPanel, 430, 20, '已完成的任务永久保留，未完成的任务重来时重新计数',
            12, new Color(170, 170, 190), 0, h / 2 - 56);

        // 任务行（每关最多 3 条）
        this._missionRows = [];
        for (let i = 0; i < 3; i++) {
            const lb = this.makeLabel(`MissionRow${i}`, this._missionPanel, w - 40, 28, '', 17, Color.WHITE, 0, 40 - i * 40);
            lb.overflow = Overflow.NONE;
            this._missionRows.push(lb);
        }

        this.makeButton(
            'MissionCloseBtn', this._missionPanel, 100, 32,
            new Color(140, 50, 50), '关闭', 15, Color.WHITE,
            0, -h / 2 + 26, () => { this.hideMissionPanel(); }
        );
    }

    private toggleMissionPanel(): void {
        if (!this._missionPanel) return;
        if (this._missionPanel.active) {
            this.hideMissionPanel();
        } else {
            this.showMissionPanel();
        }
    }

    private showMissionPanel(): void {
        if (!this._missionPanel) return;
        this.refreshMissionPanel();
        this._missionPanel.active = true;
    }

    private hideMissionPanel(): void {
        if (this._missionPanel) this._missionPanel.active = false;
    }

    /** 刷新任务按钮文案与面板内容 */
    private refreshMissionPanel(): void {
        const mgr = MissionManager.instance;
        if (!mgr) return;

        if (this._missionBtnLabel) {
            const total = mgr.missions.length;
            this._missionBtnLabel.string = total > 0 ? `任务 ${mgr.completedCount}/${total}` : '任务';
        }

        for (let i = 0; i < this._missionRows.length; i++) {
            const lb = this._missionRows[i];
            if (!lb) continue;
            const m = mgr.missions[i];
            if (!m) {
                lb.string = '';
                lb.color = Color.WHITE;
                continue;
            }
            const state = mgr.getState(m);
            if (state === 'completed') {
                lb.string = `★ ${m.desc}（已完成）`;
                lb.color = new Color(255, 215, 90);
            } else if (state === 'failed') {
                lb.string = `✗ ${m.desc}（失败）`;
                lb.color = new Color(255, 90, 90);
            } else if (m.type === MissionType.FINISH_IN_TIME) {
                const limit = mgr.getTarget(m);
                const used = Math.floor(mgr.getElapsedSeconds());
                const remain = Math.max(0, Math.ceil(limit - mgr.getElapsedSeconds()));
                lb.string = `☆ ${m.desc}  剩余 ${remain}s（已用 ${used}s）`;
                lb.color = Color.WHITE;
            } else if (typeof m.timeLimit === 'number') {
                // 限时型进度任务（累计金币 / 限时清除障碍）：额外显示剩余秒数
                const tRemain = Math.max(0, Math.ceil(m.timeLimit - mgr.getElapsedSeconds()));
                lb.string = `☆ ${m.desc}  ${mgr.getProgress(m)}/${mgr.getTarget(m)}  剩余 ${tRemain}s`;
                lb.color = Color.WHITE;
            } else if (m.type === MissionType.FORBID_TOWER) {
                lb.string = `☆ ${m.desc}（进行中）`;
                lb.color = Color.WHITE;
            } else {
                lb.string = `☆ ${m.desc}  ${mgr.getProgress(m)}/${mgr.getTarget(m)}`;
                lb.color = Color.WHITE;
            }
        }
    }

    private buildBuildPopup(): void {
        // 弹窗高 110：标题区（顶部）+ 塔位卡片区（下方），互不重叠
        this.buildPopupNode = this.makeNode('BuildPopup', this._inGameRoot, 700, 110);
        this.buildPopupNode.active = false;
        // 容器本身吃掉触摸：否则点卡片/背景之间的四角空隙会穿透到地图，误关弹窗
        this.buildPopupNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; }, this);

        const bg = this.makeRect('Bg', this.buildPopupNode, 680, 100, new Color(233, 217, 184, 245));
        bg.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; }, this);
        // 不用 addPanelDecor：其精灵若仍是旧版深色会盖住奶油底、把标题压暗看不清；直接用奶油 makeRect 兜底
        // 标题 y=38 → 局部范围 [28,48]；卡片顶部最高到 20，不重叠
        this.makeLabel('Title', this.buildPopupNode, 460, 20, '选择建造炮塔', 14, new Color(64, 44, 28), 0, 38);

        const types = this.getAvailableTowerTypes();
        const spacing = 95;
        const startX = -(types.length - 1) * spacing / 2;

        for (let i = 0; i < types.length; i++) {
            const type = types[i];
            const cfg = getTowerConfig(type, 0);
            if (!cfg) continue;

            // 卡片高 70、中心 y=-15 → 局部范围 [-50,20]，顶部不遮标题
            const item = this.makeRect(`BP_${type}`, this.buildPopupNode, 85, 70, new Color(62, 80, 60), startX + i * spacing, -15);

            // 图标占位节点（精灵就绪后用 setNodeSprite 创建子精灵）
            // 布局：图标 [1,25] / 塔名 [-19,-3] / 价格 [-35,-21]，互不重叠
            this.makeNode('Icon', item, 24, 24, 0, 13);
            this.makeLabel('Name', item, 78, 16, cfg.name, 10, Color.WHITE, 0, -11);
            const costLbl = this.makeLabel('Cost', item, 78, 14, `${cfg.cost}G`, 12, Color.YELLOW, 0, -28);

            item.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.onSelectTowerFromPopup(type);
            }, this);
            // 范围预览：PC 悬停 / 触屏按下时显示该塔在选中格的攻击范围
            const previewRange = cfg ? cfg.range : 0;
            item.on(Node.EventType.MOUSE_ENTER, () => { if (previewRange > 0) this.showRangePreview(this._selectedSpotRow, this._selectedSpotCol, previewRange); }, this);
            item.on(Node.EventType.MOUSE_LEAVE, () => this.hideRangePreview(), this);
            item.on(Node.EventType.TOUCH_START, () => { if (previewRange > 0) this.showRangePreview(this._selectedSpotRow, this._selectedSpotCol, previewRange); }, this);
        }
    }

    /**
     * 把尺寸为 (w,h) 的面板钳制在屏幕可见范围内，避免贴边时顶出屏幕。
     * 坐标系以屏幕中心为原点。topMargin 可单独加大以避开顶部 HUD。
     *
     * 注意：边界用面板**父容器**（_inGameRoot，contentSize 固定 1920×1080、原点居中）的真实
     * 内容范围，而不是 view.getVisibleSize()——后者在 Canvas fit 适配下会随窗口比例变化，
     * 与面板实际可见的本地坐标范围（±960×±540）不一致，会导致面板被钳到屏幕外。
     */
    private clampToScreen(node: Node, w: number, h: number, x: number, y: number, margin = 16, topMargin = margin): void {
        let sw = view.getVisibleSize().width;
        let sh = view.getVisibleSize().height;
        const parent = node.parent;
        const put = parent && parent.getComponent(UITransform);
        if (put) {
            sw = put.contentSize.width;
            sh = put.contentSize.height;
        }
        const minX = -sw / 2 + w / 2 + margin;
        const maxX = sw / 2 - w / 2 - margin;
        const minY = -sh / 2 + h / 2 + margin;
        const maxY = sh / 2 - h / 2 - topMargin;
        const px = minX > maxX ? 0 : Math.min(Math.max(x, minX), maxX);
        const py = minY > maxY ? 0 : Math.min(Math.max(y, minY), maxY);
        node.setPosition(px, py, 0);
    }

    private showBuildPopup(row: number, col: number): void {
        if (!MapManager.instance) return;
        this._selectedSpotRow = row;
        this._selectedSpotCol = col;

        const worldPos = MapManager.instance.gridToWorld(row, col);
        this.showSpotHighlight(row, col);   // 地图塔位「待建」选中指示
        this.buildPopupNode.active = true;
        this.popIn(this.buildPopupNode);     // 淡入 + 轻微回弹缩放弹出
        // 先刷新以确定实际宽度（可用塔数量决定弹窗宽度），再按真实宽度钳制，贴边更精准
        this.refreshBuildPopupItems();
        const bw = this.buildPopupNode.getComponent(UITransform)?.contentSize.width ?? 700;
        // 智能方向：塔位在上半屏则弹窗向下弹，避免贴顶 HUD；下半屏向上
        const desiredY = worldPos.y > 0 ? worldPos.y - 65 - 110 : worldPos.y + 65;
        this.clampToScreen(this.buildPopupNode, bw, 110, worldPos.x, desiredY, 16, 60);
    }

    private hideBuildPopup(): void {
        this.buildPopupNode.active = false;
        this._selectedSpotRow = -1;
        this._selectedSpotCol = -1;
    }

    /** 取消待建选中：收起弹窗并清除地图高亮 / 范围预览（保留 _selectedSpot 仅由 showBuildPopup 重置） */
    private cancelBuildSelection(): void {
        this.hideBuildPopup();
        this.hideSpotHighlight();
        this.hideRangePreview();
        this._selectedSpotRow = -1;
        this._selectedSpotCol = -1;
    }

    /** 弹窗 / 面板出现动画：淡入 + 轻微回弹缩放 */
    private popIn(node: Node): void {
        Tween.stopAllByTarget(node);
        node.setScale(0.92, 0.92, 1);
        let ui = node.getComponent(UIOpacity);
        if (!ui) ui = node.addComponent(UIOpacity);
        ui.opacity = 0;
        tween(node).to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(ui).to(0.15, { opacity: 255 }).start();
    }

    // ── 地图覆盖层：塔位选中高亮 + 攻击范围预览 ──
    private ensureMapOverlays(): void {
        if (!this.mapNode) return;
        if (!this._spotHighlightNode || !this._spotHighlightNode.isValid) {
            this._spotHighlightNode = new Node('SpotHighlight');
            this._spotHighlightNode.layer = Layers.Enum.UI_2D;
            this._spotHighlightNode.addComponent(UITransform).setContentSize(64, 64);
            this._spotHighlightNode.addComponent(Graphics);
            this._spotHighlightNode.active = false;
            this.mapNode.addChild(this._spotHighlightNode);
        }
        if (!this._rangePreviewNode || !this._rangePreviewNode.isValid) {
            this._rangePreviewNode = new Node('RangePreview');
            this._rangePreviewNode.layer = Layers.Enum.UI_2D;
            this._rangePreviewNode.addComponent(UITransform);
            this._rangePreviewNode.addComponent(Graphics);
            this._rangePreviewNode.active = false;
            this.mapNode.addChild(this._rangePreviewNode);
        }
    }

    private showSpotHighlight(row: number, col: number): void {
        this.ensureMapOverlays();
        const cs = this._currentLevelConfig?.cellSize ?? 64;
        const wp = MapManager.instance!.gridToWorld(row, col);
        const g = this._spotHighlightNode.getComponent(Graphics);
        g.clear();
        g.lineWidth = 4;
        g.strokeColor = new Color(255, 228, 120, 255);
        g.rect(-cs / 2 + 3, -cs / 2 + 3, cs - 6, cs - 6);
        g.stroke();
        this._spotHighlightNode.setPosition(wp.x, wp.y, 0);
        this._spotHighlightNode.active = true;
    }

    private hideSpotHighlight(): void {
        if (this._spotHighlightNode) this._spotHighlightNode.active = false;
    }

    private showRangePreview(row: number, col: number, range: number): void {
        if (!MapManager.instance) return;
        const wp = MapManager.instance.gridToWorld(row, col);
        this.showRangePreviewAt(wp, range);
    }

    /** 在指定世界坐标处显示攻击范围圈（用于已建塔的升级预览等，不依赖格子坐标） */
    private showRangePreviewAt(worldPos: Vec3, range: number): void {
        if (range <= 0) return;
        this.ensureMapOverlays();
        const g = this._rangePreviewNode.getComponent(Graphics);
        g.clear();
        g.lineWidth = 3;
        g.strokeColor = new Color(120, 220, 255, 220);
        g.fillColor = new Color(120, 220, 255, 40);
        g.circle(0, 0, range);
        g.fill();
        g.stroke();
        this._rangePreviewNode.setPosition(worldPos.x, worldPos.y, 0);
        this._rangePreviewNode.active = true;
    }

    private hideRangePreview(): void {
        if (this._rangePreviewNode) this._rangePreviewNode.active = false;
    }

    private onKeyDown(e: EventKeyboard): void {
        if (e.keyCode !== KeyCode.ESC) return;
        this.cancelBuildSelection();
        if (this.currentTower) { this.currentTower.deselect(); this.currentTower = null; }
        this.towerPanelNode.active = false;
        this.hideRangePreview();
    }

    private onMouseDown(e: EventMouse): void {
        if (e.getButton() !== 2) return;   // 仅右键
        this.cancelBuildSelection();
        if (this.currentTower) { this.currentTower.deselect(); this.currentTower = null; }
        this.towerPanelNode.active = false;
        this.hideRangePreview();
    }

    private getAvailableTowerTypes(): TowerType[] {
        if (!this._currentLevelConfig || !this._currentLevelConfig.availableTowers || this._currentLevelConfig.availableTowers.length === 0) {
            return ALL_TOWER_TYPES;
        }
        // 保持 ALL_TOWER_TYPES 中的顺序，只返回可用的
        return ALL_TOWER_TYPES.filter(t => this._currentLevelConfig!.availableTowers!.indexOf(t) >= 0);
    }

    private refreshBuildPopupItems(): void {
        const allTypes: TowerType[] = ALL_TOWER_TYPES;
        const availSet: Set<TowerType> = new Set(this.getAvailableTowerTypes());

        // 地编中禁用的炮塔直接隐藏，不显示灰色
        const visibleItems: { type: TowerType; node: Node }[] = [];
        for (let i = 0; i < allTypes.length; i++) {
            const type = allTypes[i];
            const cfg = getTowerConfig(type, 0);
            if (!cfg) continue;

            const item = this.buildPopupNode.getChildByName(`BP_${type}`);
            if (!item) continue;

            const isAvailable = availSet.has(type);
            item.active = isAvailable;
            if (!isAvailable) continue;
            visibleItems.push({ type, node: item });

            const canAfford = CurrencyManager.instance?.hasEnough(cfg.cost) ?? false;

            // 更新背景色（Graphics 在 item 自身上，不是在 children 里）
            const graphics = item.getComponent(Graphics);
            if (graphics) {
                graphics.clear();
                graphics.fillColor = canAfford ? new Color(62, 80, 60) : new Color(95, 58, 58); // 买不起 - 红色
                graphics.rect(-42.5, -35, 85, 70);
                graphics.fill();
            }

            // 更新造价标签
            const costLbl = this.findCostLabel(item);
            if (costLbl) {
                costLbl.string = `${cfg.cost}G`;
                costLbl.color = canAfford ? Color.YELLOW : Color.GRAY;
            }

            // ===== 塔精灵图标 =====
            const icon = item.getChildByName('Icon');
            if (icon) {
                destroyChildren(icon); // 清除旧的精灵节点（销毁而非仅脱离：每次金币变动都会刷新，否则持续泄漏）
                // 清除兜底的 Graphics 组件（如果之前走的是兜底路径）
                const oldGfx = icon.getComponent(Graphics);
                if (oldGfx) {
                    icon.removeComponent(Graphics);
                }
                const sf = SpriteManager.isReady()
                    ? (canAfford
                        ? SpriteManager.getUIFrame(`tower_icon_${type}`)
                        : SpriteManager.getUIFrame(`tower_icon_${type}_off`))
                    : null;
                if (sf) {
                    SpriteManager.setNodeSprite(icon, sf, 40, 40);
                } else {
                    // 彩块兜底
                    const fg = icon.addComponent(Graphics);
                    fg.clear(); // 清除之前的绘制命令
                    fg.fillColor = TOWER_COLORS[type];
                    fg.rect(-14, -14, 28, 28);
                    fg.fill();
                }
            }
        }

        // 可用炮塔居中重新排列 + 弹窗背景宽度自适应
        const spacing = 95;
        const startX = -(visibleItems.length - 1) * spacing / 2;
        for (let i = 0; i < visibleItems.length; i++) {
            visibleItems[i].node.setPosition(startX + i * spacing, -15, 0);
        }
        this.applyBuildPopupLayout(visibleItems.length);
    }

    /** 根据可见炮塔数量调整建造弹窗的背景宽度 */
    private applyBuildPopupLayout(count: number): void {
        const w = Math.max(220, count * 95 + 40);
        const h = 100;

        const container = this.buildPopupNode.getComponent(UITransform);
        if (container) container.setContentSize(w + 20, 110);

        const bg = this.buildPopupNode.getChildByName('Bg');
        if (bg) {
            bg.getComponent(UITransform)?.setContentSize(w, h);
            const g = bg.getComponent(Graphics);
            if (g) {
                g.clear();
                g.fillColor = new Color(44, 56, 44, 245);
                g.rect(-w / 2, -h / 2, w, h);
                g.fill();
            }
        }

        const decor = this.buildPopupNode.getChildByName('PanelSprite');
        if (decor) decor.getComponent(UITransform)?.setContentSize(w, h);
    }

    private findCostLabel(item: Node): Label | null {
        for (const child of item.children) {
            const lb = child.getComponent(Label);
            if (lb && child.name === 'Cost') {
                return lb;
            }
        }
        return null;
    }

    private onSelectTowerFromPopup(type: TowerType): void {
        if (this._selectedSpotRow < 0 || this._selectedSpotCol < 0) return;
        if (!MapManager.instance) return;

        // 检查炮塔是否在当前关卡可用
        const availTypes = this.getAvailableTowerTypes();
        if (availTypes.indexOf(type) < 0) return;

        const cfg = getTowerConfig(type, 0);
        if (!cfg) return;

        const row = this._selectedSpotRow;
        const col = this._selectedSpotCol;
        const mm = MapManager.instance;

        // 先确认该格子未被占用，再扣钱（避免极端时序下扣钱后才发现格子被占）
        if (mm.getTowerNode(row, col)) return;
        if (!CurrencyManager.instance?.hasEnough(cfg.cost)) {
            this.showToast('金币不足，无法建造');
            return;
        }
        if (!CurrencyManager.instance?.spendGold(cfg.cost)) return;

        const tn = new Node(`Tower_${row}_${col}`);
        tn.layer = Layers.Enum.UI_2D;
        tn.setPosition(mm.gridToWorld(row, col));
        const tower = tn.addComponent(Tower);
        tower.init(type, row, col, this.bulletNode);

        mm.registerTowerNode(row, col, tn);
        mm.setCellType(row, col, CellType.BLOCKED);
        const spotNode = mm.getTowerSpotNode(row, col);
        if (spotNode) spotNode.active = false;
        this.towerNode.addChild(tn);

        this.syncTowerMissions();   // 建造会影响「拥有 N 座 X 级塔」类任务
        MissionManager.instance?.onTowerBuilt(type);   // 触发「禁止建造」约束判定

        // B02: 塔建造动画（t_build 帧序列）
        EffectManager.playBuildEffect(tn.parent!, tn.getPosition());
        AudioManager.playSfx(AudioManager.SFX.TOWER_BUILD);
        this.hideRangePreview();
        this.hideSpotHighlight();
        this.hideBuildPopup();
    }

    private buildTowerPanel(): void {
        this.towerPanelNode = this.makeNode('TowerPanel', this._inGameRoot, 220, 150);
        this.towerPanelNode.active = false;
        this.makeRect('Bg', this.towerPanelNode, 220, 150, new Color(233, 217, 184, 240));
        this.towerPanelNode.getChildByName('Bg')!.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; }, this);
        this.addPanelDecor('panel', this.towerPanelNode, 220, 150);
        // 塔精灵图标（左上）
        this.makeNode('Icon', this.towerPanelNode, 40, 40, -75, 48);
        this.tpNameLabel = this.makeLabel('Name', this.towerPanelNode, 140, 22, '', 15, new Color(64, 44, 28), 10, 48);
        this.tpLevelLabel = this.makeLabel('Level', this.towerPanelNode, 140, 18, '', 13, new Color(20, 104, 104), 10, 29);
        this.tpDamageLabel = this.makeLabel('Dmg', this.towerPanelNode, 90, 18, '', 12, new Color(64, 44, 28), -52, 10);
        this.tpRangeLabel = this.makeLabel('Rng', this.towerPanelNode, 90, 18, '', 12, new Color(64, 44, 28), 52, 10);
        this.tpFireRateLabel = this.makeLabel('Rate', this.towerPanelNode, 200, 18, '', 12, new Color(64, 44, 28), 0, -7);
        this.tpAuraLabel = this.makeLabel('Aura', this.towerPanelNode, 200, 18, '', 11, new Color(28, 110, 56), 0, -25);
        this.tpUpgradeBtn = this.makeButton(
            'UpgradeBtn', this.towerPanelNode, 90, 30,
            new Color(40, 120, 40), '升级', 13, Color.WHITE,
            -55, -58, (event: EventTouch) => { event.propagationStopped = true; this.onUpgradeClick(); }
        );
        // 升级范围预览：悬停「升级」按钮时显示升级后的更大攻击范围；移开即隐藏（当前范围仍由塔自身 _rangeCircle 显示）
        this.tpUpgradeBtn.on(Node.EventType.MOUSE_ENTER, () => {
            if (this.currentTower && this.currentTower.canUpgrade) {
                this.showRangePreviewAt(this.currentTower.node.getPosition(), this.currentTower.nextRange);
            }
        }, this);
        this.tpUpgradeBtn.on(Node.EventType.MOUSE_LEAVE, () => {
            this.hideRangePreview();
        }, this);
        this.tpUpgradeCostLabel = this.makeLabel('UCost', this.tpUpgradeBtn, 86, 14, '', 10, Color.YELLOW, 0, -18);
        this.tpSellBtn = this.makeButton(
            'SellBtn', this.towerPanelNode, 90, 30,
            new Color(140, 50, 50), '出售', 13, Color.WHITE,
            55, -58, (event: EventTouch) => { event.propagationStopped = true; this.onSellClick(); }
        );
        this.tpSellValueLabel = this.makeLabel('SVal', this.tpSellBtn, 86, 14, '', 10, Color.YELLOW, 0, -18);
    }

    private buildGameOverPanel(): void {
        this.gameOverPanelNode = this.makeNode('GameOverPanel', this._inGameRoot, 450, 330);
        this.gameOverPanelNode.active = false;
        const overlay = this.makeRect('Overlay', this.gameOverPanelNode, 1920, 1080, new Color(0, 0, 0, 160));
        overlay.setPosition(0, 0);
        this.makeRect('Panel', this.gameOverPanelNode, 400, 300, new Color(42, 54, 42, 245));

        // Radish 精灵（胜利时绿色，失败时红色覆盖）
        this.makeNode('RadishIcon', this.gameOverPanelNode, 48, 48, 0, 95);
        const radishSf = SpriteManager.getUIFrame('radish');
        if (radishSf) {
            const ri = this.gameOverPanelNode.getChildByName('RadishIcon')!;
            SpriteManager.setNodeSprite(ri, radishSf, 48, 48);
        }

        // 星级测评（三颗 ★，初始全灰，胜利时由 showGameOver 点亮）
        const starColorOff = new Color(80, 80, 95);
        this.goStarLabels = [];
        for (let i = 0; i < 3; i++) {
            this.goStarLabels.push(
                this.makeLabel(`Star${i}`, this.gameOverPanelNode, 56, 44, '★', 32, starColorOff, (i - 1) * 56, 55)
            );
        }

        this.goTitleLabel = this.makeLabel('Title', this.gameOverPanelNode, 340, 36, '', 26, Color.WHITE, 0, 15);
        this.goMsgLabel = this.makeLabel('Msg', this.gameOverPanelNode, 340, 26, '', 16, Color.WHITE, 0, -18);
        this.goRestartBtn = this.makeButton(
            'RestartBtn', this.gameOverPanelNode, 140, 42,
            new Color(50, 120, 50), '重新开始', 16, Color.WHITE,
            -80, -65, () => { this.onRestartGame(); }
        );
        this.goNextBtn = this.makeButton(
            'NextBtn', this.gameOverPanelNode, 140, 42,
            new Color(50, 50, 150), '下一关', 16, Color.WHITE,
            80, -65, () => { this.onNextLevel(); }
        );
        this.goMenuBtn = this.makeButton(
            'MenuBtn', this.gameOverPanelNode, 140, 42,
            new Color(80, 60, 100), '主菜单', 16, Color.WHITE,
            0, -115, () => { if (GameManager.onBackToMenu) GameManager.onBackToMenu(); }
        );
        this.goMenuBtn.active = false;
    }

    private buildConfirmDialog(): void {
        this._confirmNode = this.makeNode('ConfirmDialog', this._inGameRoot, 400, 200);
        this._confirmNode.active = false;

        // 半透明遮罩
        const overlay = this.makeRect('Overlay', this._confirmNode, 1920, 1080, new Color(0, 0, 0, 140));
        overlay.setPosition(0, 0);
        overlay.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; }, this);

        // 对话框面板
        this.makeRect('Panel', this._confirmNode, 380, 180, new Color(46, 58, 48, 250));

        // 标题
        this.makeLabel('Title', this._confirmNode, 340, 30, '确认操作', 22, Color.YELLOW, 0, 52);

        // 提示信息
        this.makeLabel('Msg', this._confirmNode, 340, 28, '', 16, Color.WHITE, 0, 10);

        // 确认按钮
        this.makeButton(
            'ConfirmBtn', this._confirmNode, 120, 36,
            new Color(140, 50, 50), '确认', 15, Color.WHITE,
            -70, -50, () => { this.onConfirmYes(); }
        );

        // 返回游戏按钮
        this.makeButton(
            'CancelBtn', this._confirmNode, 120, 36,
            new Color(50, 120, 50), '返回游戏', 14, Color.WHITE,
            70, -50, () => { this.onConfirmNo(); }
        );
    }

    private buildDeveloperPanel(): void {
        this._devPanelNode = this.makeNode('DevPanel', this._inGameRoot, 580, 600);
        this._devPanelNode.active = false;

        // 半透明遮罩
        const overlay = this.makeRect('Overlay', this._devPanelNode, 1920, 1080, new Color(0, 0, 0, 120));
        overlay.setPosition(0, 0);
        overlay.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; }, this);

        // 面板背景
        this.makeRect('Panel', this._devPanelNode, 560, 580, new Color(44, 56, 46, 250));
        this.makeLabel('Title', this._devPanelNode, 500, 32, '开发者技能', 22, Color.YELLOW, 0, 248);

        // 关闭按钮
        this.makeButton(
            'CloseBtn', this._devPanelNode, 50, 30,
            new Color(140, 50, 50), 'X', 16, Color.WHITE,
            245, 248, () => { this._devPanelNode.active = false; this._devBtnNode.active = true; }
        );

        // 6 个技能按钮（2 列 × 3 行）
        // permanent=true：本关只能生效一次，生效后打勾并禁止重复点击（避免叠 buff/误操作）
        const skills: { label: string; permanent: boolean; cb: () => void }[] = [
            { label: '全场减速50%(永久)', permanent: true, cb: () => this.devSkillSlowAll() },
            { label: '全场冻结(永久)', permanent: true, cb: () => this.devSkillFreezeAll() },
            { label: '全场塔攻速+50%(永久)', permanent: true, cb: () => this.devSkillAttackSpeedAll() },
            { label: '金币 +1000', permanent: false, cb: () => this.devSkillAddGold() },
            { label: '生命 +1', permanent: false, cb: () => this.devSkillAddLife() },
            { label: '秒杀全场怪', permanent: false, cb: () => this.devSkillKillAll() },
        ];
        this._devSkillBtns = [];
        this._devSkillLabels = [];
        this._devSkillUsed = [];
        const bw = 250, bh = 70, gapY = 18, leftX = -135, rightX = 135;
        const startY = 160;
        for (let i = 0; i < skills.length; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = col === 0 ? leftX : rightX;
            const y = startY - row * (bh + gapY);
            const idx = i;
            const btn = this.makeButton(
                `Skill_${i}`, this._devPanelNode, bw, bh,
                new Color(60, 90, 140), skills[i].label, 15, Color.WHITE,
                x, y, () => this.onDevSkillClick(idx, skills[idx])
            );
            this._devSkillBtns.push(btn);
            this._devSkillLabels.push(skills[i].label);
            this._devSkillUsed.push(false);
        }

        // 底部说明
        this.makeLabel('DevHint', this._devPanelNode, 520, 24,
            '永久技能每关只生效一次（生效后打勾）；金币 / 生命 / 秒杀可重复使用',
            14, new Color(180, 200, 215), 0, -250);
    }

    /** 开发者技能点击：永久类不可重复使用，生效后打勾反馈 */
    private onDevSkillClick(i: number, skill: { label: string; permanent: boolean; cb: () => void }): void {
        if (skill.permanent && this._devSkillUsed[i]) {
            this.showToast('该永久技能本关已生效');
            return;
        }
        skill.cb();
        if (skill.permanent) {
            this._devSkillUsed[i] = true;
            this.markDevSkillUsed(i);
        }
        this.showToast('已生效：' + skill.label);
    }

    /** 将指定技能按钮标记为「已生效」（打勾 + 变绿），提示不可重复 */
    private markDevSkillUsed(i: number): void {
        const btn = this._devSkillBtns[i];
        if (!btn || !btn.isValid) return;
        const l = btn.getChildByName('Txt')?.getComponent(Label);
        if (l) {
            l.string = this._devSkillLabels[i] + ' ✓';
            l.color = new Color(150, 235, 160);
        }
    }

    /** 进新关时重置各技能按钮的「已生效」标记（永久技能的效果随关卡重来而失效） */
    private resetDevSkillButtons(): void {
        for (let i = 0; i < this._devSkillBtns.length; i++) {
            const btn = this._devSkillBtns[i];
            if (btn && btn.isValid) {
                const l = btn.getChildByName('Txt')?.getComponent(Label);
                if (l) {
                    l.string = this._devSkillLabels[i];
                    l.color = Color.WHITE;
                }
            }
            this._devSkillUsed[i] = false;
        }
    }



    // ============ HUD 控制方法 ============

    private toggleSpeed(): void {
        const devData = DeveloperData.instance;
        devData.speedMultiplier = devData.speedMultiplier === 1 ? 2 : 1;
        if (this._speedBtnLabel) {
            this._speedBtnLabel.string = devData.speedMultiplier === 2 ? '2x' : '1x';
        }
    }

    private togglePause(): void {
        if (this._gameState !== GameState.PLAYING) return;
        const devData = DeveloperData.instance;
        devData.paused = !devData.paused;
        if (this._pauseBtnLabel) {
            this._pauseBtnLabel.string = devData.paused ? '继续' : '暂停';
        }
        // 同步全屏"已暂停"遮罩
        if (this._pauseOverlay) this._pauseOverlay.active = devData.paused;
        // 冻结/恢复所有 tween 动画（爆炸、红闪等），避免暂停期间特效仍在播放
        this.setTweensPaused(devData.paused);
    }

    /** 暂停/恢复全局 tween 系统（容错：API 不存在时降级为 no-op，配合各实体的 paused 冻结逻辑兜底） */
    private setTweensPaused(paused: boolean): void {
        const tm = (game as unknown as { tweenManager?: { pause?: () => void; resume?: () => void } }).tweenManager;
        if (tm && typeof tm.pause === 'function' && typeof tm.resume === 'function') {
            if (paused) tm.pause();
            else tm.resume();
        }
    }

    private onRestartClick(): void {
        if (DeveloperData.instance.paused) this.togglePause();
        this.showConfirmDialog('重新开始?', '当前进度将丢失。', () => {
            this.onRestartGame();
        });
    }

    private onBackToLevelsClick(): void {
        if (DeveloperData.instance.paused) this.togglePause();
        this.showConfirmDialog('退出关卡?', '返回选关界面?', () => {
            if (GameManager.onBackToMenu) GameManager.onBackToMenu();
        });
    }

    private toggleDevPanel(): void {
        if (!DeveloperData.instance.devModeEnabled) return;
        // 已打开 → 直接关闭
        if (this._devPanelNode.active) {
            this._devPanelNode.active = false;
            this._devBtnNode.active = true;
            return;
        }
        // 打开前二次确认：该按钮与"暂停/返回/重开"并排，容易误触导致影响游戏平衡
        this.showConfirmDialog('打开开发者面板?', '这是调试用功能，会影响游戏平衡。', () => {
            this._devPanelNode.active = true;
            this._devBtnNode.active = false;
        });
    }

    // ============ 确认对话框方法 ============

    private showConfirmDialog(title: string, message: string, onConfirm: () => void): void {
        this._isConfirmOpen = true;
        this._confirmCallback = onConfirm;
        this._confirmNode.active = true;

        const titleLabel = this._confirmNode.getChildByName('Title')!.getComponent(Label)!;
        const msgLabel = this._confirmNode.getChildByName('Msg')!.getComponent(Label)!;
        titleLabel.string = title;
        msgLabel.string = message;
    }

    private onConfirmYes(): void {
        this._confirmNode.active = false;
        this._isConfirmOpen = false;
        if (this._confirmCallback) {
            const cb = this._confirmCallback;
            this._confirmCallback = null;
            cb();
        }
    }

    private onConfirmNo(): void {
        this._confirmNode.active = false;
        this._isConfirmOpen = false;
        this._confirmCallback = null;
    }

    // ============ 开发者技能 ============

    /** 1. 对所有场上怪减速 50%（永久） */
    private devSkillSlowAll(): void {
        const enemies = this.collectFieldEnemies();
        for (const e of enemies) {
            e.applySlow(0.5, 1e9);
        }
    }

    /** 2. 冻结所有场上怪（永久） */
    private devSkillFreezeAll(): void {
        const enemies = this.collectFieldEnemies();
        for (const e of enemies) {
            e.applyFreeze(1e9);
        }
    }

    /** 3. 所有场上塔攻速 +50%（永久，可叠加） */
    private devSkillAttackSpeedAll(): void {
        const nodes = MapManager.instance?.getAllTowerNodes() ?? [];
        for (const node of nodes) {
            const t = node.getComponent(Tower);
            if (t) t.addAttackSpeedBonus(0.5);
        }
    }

    /** 4. 加金币（每次 +1000） */
    private devSkillAddGold(): void {
        CurrencyManager.instance?.addGold(1000);
    }

    /** 5. 加命（每次 +1） */
    private devSkillAddLife(): void {
        Radish.instance?.addLife(1);
    }

    /** 6. 秒杀所有场上怪 */
    private devSkillKillAll(): void {
        const enemies = this.collectFieldEnemies();
        for (const e of enemies) {
            e.takeDamage(e.hp + 1, TowerType.EMITTER);
        }
    }

    /** 收集当前场上的存活敌人（先快照，避免遍历中节点销毁导致问题） */
    private collectFieldEnemies(): Enemy[] {
        const result: Enemy[] = [];
        if (this.enemyNode && this.enemyNode.isValid) {
            for (const child of this.enemyNode.children) {
                const e = child.getComponent(Enemy);
                if (e && !e.isDead) result.push(e);
            }
        }
        return result;
    }

    private setupListeners(): void {
        const wm = WaveManager.instance;
        if (wm) {
            wm.eventTarget.on(WaveManager.EVENT_SPAWN_ENEMY, this.onSpawnEnemy, this);
            wm.eventTarget.on(WaveManager.EVENT_WAVE_START, this.onWaveStart, this);
            wm.eventTarget.on(WaveManager.EVENT_WAVE_END, this.onWaveEnd, this);
            wm.eventTarget.on(WaveManager.EVENT_MANUAL_NEXT_READY, this.onManualNextReady, this);
            wm.eventTarget.on(WaveManager.EVENT_AUTO_NEXT_TICK, this.onAutoNextTick, this);
            wm.eventTarget.on(WaveManager.EVENT_ALL_WAVES_DONE, this.onAllWavesDone, this);
        }

        const cm = CurrencyManager.instance;
        if (cm) {
            cm.eventTarget.on(CurrencyManager.EVENT_GOLD_CHANGED, this.onGoldChanged, this);
        }

        Enemy.eventTarget.on(Enemy.EVENT_ENEMY_REACHED_END, this.onEnemyReachedEnd, this);
        Enemy.eventTarget.on(Enemy.EVENT_ENEMY_SPLIT, this.onEnemySplit, this);
        Enemy.eventTarget.on(Enemy.EVENT_ENEMY_DIED, this.onEnemyDiedEvent, this);
        this.node.on(Node.EventType.TOUCH_END, this.onMapClick, this);
        // Esc 关闭弹窗 / 右键取消选中
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.node.on(Node.EventType.MOUSE_DOWN, this.onMouseDown, this);
    }

    private removeListeners(): void {
        const wm = WaveManager.instance;
        if (wm) {
            wm.eventTarget.off(WaveManager.EVENT_SPAWN_ENEMY, this.onSpawnEnemy, this);
            wm.eventTarget.off(WaveManager.EVENT_WAVE_START, this.onWaveStart, this);
            wm.eventTarget.off(WaveManager.EVENT_WAVE_END, this.onWaveEnd, this);
            wm.eventTarget.off(WaveManager.EVENT_MANUAL_NEXT_READY, this.onManualNextReady, this);
            wm.eventTarget.off(WaveManager.EVENT_AUTO_NEXT_TICK, this.onAutoNextTick, this);
            wm.eventTarget.off(WaveManager.EVENT_ALL_WAVES_DONE, this.onAllWavesDone, this);
        }

        const cm = CurrencyManager.instance;
        if (cm) {
            cm.eventTarget.off(CurrencyManager.EVENT_GOLD_CHANGED, this.onGoldChanged, this);
        }

        Enemy.eventTarget.off(Enemy.EVENT_ENEMY_REACHED_END, this.onEnemyReachedEnd, this);
        Enemy.eventTarget.off(Enemy.EVENT_ENEMY_SPLIT, this.onEnemySplit, this);
        Enemy.eventTarget.off(Enemy.EVENT_ENEMY_DIED, this.onEnemyDiedEvent, this);
        this.node.off(Node.EventType.TOUCH_END, this.onMapClick, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.node.off(Node.EventType.MOUSE_DOWN, this.onMouseDown, this);
    }

    private onRestartGame(): void {
        this.startLevel(this._currentLevel);
    }

    private onNextLevel(): void {
        const next = this._currentLevel + 1;
        if (next < getAllLevelConfigs().length) {
            this.startLevel(next);
        } else {
            if (GameManager.onBackToMenu) GameManager.onBackToMenu();
        }
    }

    /** 销毁层内全部子节点（removeAllChildren 不销毁节点，只脱离场景树） */
    private clearLayer(layer: Node): void {
        if (!layer || !layer.isValid) return;
        const children = layer.children.slice();
        for (const c of children) {
            if (c && c.isValid) c.destroy();
        }
    }

    /**
     * 统一控制游戏内 UI（HUD + 各面板）的显隐。
     * 之前返回主菜单时只隐藏了 UIManager 的屏幕节点，_inGameRoot 始终 active，
     * 导致 HUD 叠在菜单之上"不消失"。进游戏显示、回菜单隐藏。
     */
    public setGameUIActive(visible: boolean): void {
        if (this._inGameRoot && this._inGameRoot.isValid) {
            this._inGameRoot.active = visible;
        }
        // 隐藏＝退出关卡/回主菜单：统一销毁在场特效，避免残留到菜单界面
        if (!visible) {
            EffectManager.clearAll();
            AudioManager.playBgm(AudioManager.BGM_MAIN);   // 回菜单切主菜单 BGM
        }
    }

    /**
     * 彻底退出当前关卡：停止模拟 + 销毁在场实体 + 隐藏 UI + 切主菜单 BGM。
     * 供「退出关卡 / 游戏结束返回主菜单 / 通关后返回」等所有回菜单路径调用。
     * 否则仅隐藏 UI 会让 WaveManager 继续刷怪、敌人/塔继续 update，
     * 在后台持续发出 explosion/coin/wave_go 等音效。
     */
    public exitLevel(): void {
        this._gameState = GameState.MENU;
        this.currentTower = null;
        this.markedObstacle = null;
        // 停刷怪 + 销毁在场敌人/塔/子弹实体，避免后台继续推进并发出音效
        WaveManager.instance?.reset();
        this.clearLayer(this.mapNode);
        this.clearLayer(this.enemyNode);
        this.clearLayer(this.towerNode);
        this.clearLayer(this.bulletNode);
        Bullet.clearPool();
        // 隐藏 UI + 切主菜单 BGM + 清残留特效
        this.setGameUIActive(false);
    }

    public startLevel(levelIndex: number): void {
        this._currentLevel = levelIndex;
        this._gameState = GameState.PLAYING;
        this._allWavesHandled = false;
        // 取消上一局可能残留的延时回调（如通关结算的 2s 延时），避免重开时旧回调误触发
        this.unscheduleAllCallbacks();
        this.currentTower = null;
        this.markedObstacle = null;

        // 复位游戏内 UI 默认状态（含开发者按钮显隐）+ 开发者运行时状态（倍速/暂停）
        this.resetInGameUIState();
        this.resetDevRuntimeState();

        // 统一销毁残留实体：removeAllChildren 仅脱离场景树，节点既不销毁也不回池。
        // 更关键的是脱离场景树后 Component 的 update 虽不再被调用，但 scheduleOnce
        // 由全局调度器管理、仍会触发 → 上一关敌人的死亡回调会在新关卡里加金币、
        // 递减波次计数（可致负数，进而误判通关），Radish 也会重复回调扣血。
        // 先清掉可能残留的特效（挂在关卡外持久节点上的），再重建各层
        EffectManager.clearAll();
        this.clearLayer(this.mapNode);
        this.clearLayer(this.enemyNode);
        this.clearLayer(this.towerNode);
        this.clearLayer(this.bulletNode);
        Bullet.clearPool();

        const config = getLevelConfig(levelIndex);
        if (!config) return;
        this._currentLevelConfig = config;
        this._currentMode = config.mode ?? LevelMode.WAVE;
        this._bossTimeLimit = config.timeLimit ?? 0;
        this._bossTimeRemaining = this._bossTimeLimit;
        this._bossTimedOut = false;
        this._bossGrace = 5;
        if (this._bossTimeLabel) {
            const isBoss = this._currentMode === LevelMode.BOSS && this._bossTimeLimit > 0;
            this._bossTimeLabel.node.active = isBoss;
            if (isBoss) this._bossTimeLabel.string = `剩余 ${Math.ceil(this._bossTimeRemaining)}s`;
        }

        MapManager.instance?.init(config);
        CurrencyManager.instance?.init(config.startGold);
        WaveManager.instance?.init(config);

        // 进入关卡：切战斗 BGM + 开场音
        AudioManager.playBgm(AudioManager.BGM_GAME);
        AudioManager.playSfx(AudioManager.SFX.GAME_START);

        // 隐藏任务：读取已完成任务（永久保留），未完成的任务从 0 重新计数
        MissionManager.instance?.startLevel(getLevelStarKey(config));
        // 任务状态变化时自动刷新面板/按钮
        if (MissionManager.instance) {
            MissionManager.instance.onChange = () => { this.refreshMissionPanel(); };
        }

        // 仅当本关配置了任务时才显示「任务」按钮
        const hasMission = MissionManager.instance?.hasMissions ?? false;
        this._missionBtnNode.active = hasMission;
        if (!hasMission && this._missionPanel) this._missionPanel.active = false;
        this.refreshMissionPanel();

        // 开发者技能的「已生效」标记是每关独立的，进新关重置按钮状态
        this.resetDevSkillButtons();

        this.drawMap(config);
        // boss战无萝卜（环形地图，敌人不抵达终点）
        if (this._currentMode !== LevelMode.BOSS) this.placeRadish(config);
        this.placeObstacles();

        this.goldLabel.string = `${config.startGold}G`;
        this.livesLabel.string = `${config.lives}/${config.lives}`;
        this.waveLabel.string = `0/${config.waves.length}`;
        this.nextWaveBtn.active = false;
        if (this.autoNextLabel) this.autoNextLabel.node.active = false;
        // 首波也走自动衔接：非 boss 关 5s 后自动开始，boss 关仍提示手动
        WaveManager.instance?.scheduleNextWave();

        // 体验优化：进关展示操作引导，几秒后或首次点击地图时自动消失
        this.hidePauseOverlay();
        this.showHint('点击草地空格建造炮塔 · 点击敌人优先攻击 · 点击障碍集火');
    }

    private drawMap(config: LevelConfig): void {
        // 坐标换算统一走 MapManager.gridToWorld（唯一真相源）。
        // 此前此处自带一套 ox/oy 公式，与 MapManager 不一致时地图就会整体错位/上下翻转。
        const mm = MapManager.instance;

        // 关卡背景（第一章 BG1 整图铺满画面，置于地图最底层）
        const bgSf = SpriteManager.getUIFrame('level_bg');
        if (bgSf) {
            const bg = SpriteManager.setNodeSprite(this.mapNode!, bgSf, 1920, 1080, 'LevelBg');
            bg.setSiblingIndex(0);
        }

        // 网格线层（一次性绘制全部线条）
        const gridNode = new Node('Grid');
        gridNode.layer = Layers.Enum.UI_2D;
        const gridG = gridNode.addComponent(Graphics);
        gridG.strokeColor = new Color(120, 160, 104, 50);
        gridG.lineWidth = 1;

        for (let r = 0; r < config.rows; r++) {
            for (let c = 0; c < config.cols; c++) {
                const cellPos = mm ? mm.gridToWorld(r, c) : new Vec3(0, 0, 0);
                const cx = cellPos.x;
                const cy = cellPos.y;
                const ct = MapManager.instance?.getCellType(r, c) ?? CellType.EMPTY;

                // 格子精灵：PATH 用方向道路瓦片；其余用 cell_empty
                // 障碍物也走 cell_empty，岩石图形由 Obstacle 实体自绘在上层，避免此处画棕色底块与周围格子违和。
                // 塔位用透明虚框标记，叠在草地格子上（见 ensureSpotOverlay）
                let spriteName = 'cell_empty';
                let fallbackColor = new Color(70, 130, 70);
                let needsSpotOverlay = false;
                let overrideSf = (ct === CellType.PATH)
                    ? (SpriteManager.getRoadTile(MapManager.instance?.getRoadTileKey(r, c) ?? 'road_straight_h') ?? null)
                    : null;
                if (ct === CellType.PATH) {
                    fallbackColor = new Color(200, 180, 140);
                } else if (ct === CellType.TOWER_SPOT) {
                    needsSpotOverlay = true;
                }

                const cellNode = this.makeNode(`Cell_${r}_${c}`, this.mapNode, config.cellSize, config.cellSize, cx, cy);
                const sf = overrideSf ?? SpriteManager.getUIFrame(spriteName);
                if (sf) {
                    SpriteManager.setNodeSprite(cellNode, sf, config.cellSize, config.cellSize);
                } else {
                    // 兜底：纯色方块
                    const bg = cellNode.addComponent(Graphics);
                    bg.fillColor = fallbackColor;
                    bg.rect(-config.cellSize / 2, -config.cellSize / 2, config.cellSize, config.cellSize);
                    bg.fill();
                }

                // 塔位透明虚框标记叠在草地格子上
                if (needsSpotOverlay) {
                    this.ensureSpotOverlay(cellNode, config.cellSize, r, c);
                }

                // 网格线
                gridG.rect(cx - config.cellSize / 2, cy - config.cellSize / 2, config.cellSize, config.cellSize);
                gridG.stroke();
            }
        }
        this.mapNode.addChild(gridNode);

        // 出生点标记
        if (config.path.length === 0) return;
        const first = config.path[0];
        const spawnPos = mm ? mm.gridToWorld(first.y, first.x) : new Vec3(0, 0, 0);
        const spawnX = spawnPos.x;
        const spawnY = spawnPos.y;
        this.drawSpawnMarker(spawnX, spawnY, config.cellSize);

        // 塔位标记已由 ensureSpotOverlay 在绘制格子时叠加，无需再单独画高亮块
    }

    private drawSpawnMarker(cx: number, cy: number, cellSize: number): void {
        const sf = SpriteManager.getUIFrame('spawn_marker');
        if (sf) {
            const marker = this.makeNode('SpawnMarker', this.mapNode, cellSize, cellSize, cx, cy);
            SpriteManager.setNodeSprite(marker, sf, cellSize, cellSize);
            return;
        }
        // 兜底：红色方框
        const marker = this.makeNode('SpawnMarker', this.mapNode, cellSize, cellSize, cx, cy);
        const g = marker.addComponent(Graphics);
        g.strokeColor = new Color(255, 50, 50);
        g.lineWidth = 4;
        const half = cellSize / 2 - 4;
        g.rect(-half, -half, half * 2, half * 2);
        g.stroke();
        g.fillColor = new Color(255, 50, 50);
        g.rect(-4, -half + 12, 8, half * 2 - 24);
        g.fill();
        g.circle(0, -half + 8, 6);
        g.fill();
    }

    /** 在塔位格子节点上叠加透明的虚框十字标记，并注册到 MapManager 供建造/出售时显隐 */
    private ensureSpotOverlay(cellNode: Node, cellSize: number, row: number, col: number): void {
        let overlay = cellNode.getChildByName('SpotOverlay');
        if (!overlay) {
            overlay = this.makeNode('SpotOverlay', cellNode, cellSize, cellSize, 0, 0);
            const sf = SpriteManager.getUIFrame('cell_tower_spot');
            if (sf) SpriteManager.setNodeSprite(overlay, sf, cellSize, cellSize);
        }
        overlay.active = true;
        MapManager.instance?.registerTowerSpotNode(row, col, overlay);
    }

    private placeRadish(config: LevelConfig): void {
        if (config.path.length === 0) return;
        const last = config.path[config.path.length - 1];
        // 与 drawMap 保持一致：统一走 MapManager 的坐标换算
        const mm = MapManager.instance;
        const p = mm ? mm.gridToWorld(last.y, last.x) : new Vec3(0, 0, 0);
        const x = p.x;
        const y = p.y;

        const rn = new Node('Radish');
        rn.layer = Layers.Enum.UI_2D;
        rn.setPosition(x, y, 0);
        const radish = rn.addComponent(Radish);
        radish.init(config.lives);

        radish.eventTarget.on(Radish.EVENT_LIVES_CHANGED, (lives: number, max: number) => {
            this.livesLabel.string = `${lives}/${max}`;
        }, this);
        radish.eventTarget.on(Radish.EVENT_RADISH_DESTROYED, () => {
            this.onRadishDestroyed();
        }, this);

        this.mapNode.addChild(rn);
    }

    /** 根据 MapManager 计算的障碍物列表在地图上放置障碍实体 */
    private placeObstacles(): void {
        const mm = MapManager.instance;
        if (!mm) return;
        const cellSize = mm.getCellSize();

        for (const o of mm.getObstacles()) {
            // 障碍节点位置 = 覆盖区域中心（按宽高计算：1×1 居中，2×2/(2×1) 取块中心）
            const def = OBSTACLE_DEFS[o.type ?? ObstacleType.ROCK_SMALL];
            const centerRow = o.row + (def.h - 1) / 2;
            const centerCol = o.col + (def.w - 1) / 2;
            const pos = mm.gridToWorld(centerRow, centerCol);

            const node = new Node(`Obstacle_${o.row}_${o.col}`);
            node.layer = Layers.Enum.UI_2D;
            node.setPosition(pos);
            const obstacle = node.addComponent(Obstacle);
            obstacle.init(o.row, o.col, o.type, cellSize, o.fortress === true);
            for (const cell of obstacle.coveredCells) {
                mm.registerObstacleCell(cell.row, cell.col, node);
            }
            obstacle.eventTarget.on(Obstacle.EVENT_DESTROYED, this.onObstacleDestroyed, this);
            this.mapNode.addChild(node);
        }
    }

    /** 障碍被摧毁：给金币、覆盖格变为可建造，清除手动标记 */
    private onObstacleDestroyed(ob: Obstacle): void {
        AudioManager.playSfx(ob.isTreasure ? AudioManager.SFX.CHEST_OPEN : AudioManager.SFX.ROCK_BREAK);
        const mm = MapManager.instance;
        if (!mm) return;

        // 摧毁奖励（岩石 50/100/200，宝箱 750/2000）
        const reward = ob.reward;
        if (reward > 0) {
            CurrencyManager.instance?.addGold(reward);
            // 隐藏任务：累计获得金币（毛收入，建造花费不扣减）
            MissionManager.instance?.onGoldEarned(reward);
            this.showGoldPopup(ob.node.position, reward, ob.isTreasure);
        }

        for (const cell of ob.coveredCells) {
            mm.unregisterObstacleCell(cell.row, cell.col);
            mm.setCellType(cell.row, cell.col, CellType.TOWER_SPOT);
            this.refreshCellVisual(cell.row, cell.col);
            // 隐藏任务：记录被摧毁的障碍所在格
            MissionManager.instance?.onObstacleDestroyed(cell.row, cell.col);
        }
        if (this.markedObstacle === ob) {
            this.unmarkObstacle();
        }

        // 堡垒战：摧毁被标记为「堡垒」的障碍即触发胜利（按萝卜剩余血结算星级）
        if (ob.isFortress && this._currentMode === LevelMode.FORTRESS) {
            this.onFortressDestroyed();
        }
    }

    /** 动态刷新指定格子的显示（障碍清理、路径变更等场景） */
    private refreshCellVisual(row: number, col: number): void {
        const mm = MapManager.instance;
        if (!mm || !this.mapNode) return;
        const cellNode = this.mapNode.getChildByName(`Cell_${row}_${col}`);
        if (!cellNode) return;

        const ct = mm.getCellType(row, col);
        const cellSize = mm.getCellSize();

        // 移除旧的 Graphics 兜底
        const oldG = cellNode.getComponent(Graphics);
        if (oldG) { oldG.clear(); oldG.destroy(); }

        // 取得对应 SpriteFrame
        let sf = (ct === CellType.PATH)
            ? (SpriteManager.getRoadTile(mm.getRoadTileKey(row, col)) ?? null)
            : null;
        if (ct === CellType.TOWER_SPOT) sf = SpriteManager.getUIFrame('cell_empty');
        if (ct === CellType.EMPTY) sf = SpriteManager.getUIFrame('cell_empty');

        if (sf && ct !== CellType.OBSTACLE) {
            // 复用已有的 Sprite 子节点，避免 destroy 延迟造成闪烁
            let spriteNode = cellNode.getChildByName('Sprite');
            if (spriteNode) {
                const sprite = spriteNode.getComponent(Sprite);
                if (sprite) sprite.spriteFrame = sf;
            } else {
                SpriteManager.setNodeSprite(cellNode, sf, cellSize, cellSize);
            }
        } else {
            const g = cellNode.addComponent(Graphics);
            g.fillColor = ct === CellType.OBSTACLE ? new Color(92, 88, 80) : new Color(70, 130, 70);
            g.rect(-cellSize / 2, -cellSize / 2, cellSize, cellSize);
            g.fill();
        }

        // 塔位：叠加透明虚框标记（与预设塔位一致）
        if (ct === CellType.TOWER_SPOT) {
            this.ensureSpotOverlay(cellNode, cellSize, row, col);
        }
    }

    /** 障碍摧毁时飘出 "+Ng"（宝箱用金色高亮） */
    private showGoldPopup(worldPos: Vec3, amount: number, isTreasure: boolean): void {
        if (!this.mapNode) return;
        const node = new Node('GoldPopup');
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(worldPos.x, worldPos.y + 10, 0);
        const label = node.addComponent(Label);
        label.string = `+${amount}G`;
        label.fontSize = isTreasure ? 22 : 16;
        label.color = isTreasure ? new Color(255, 220, 90) : new Color(255, 240, 160);
        applyTextOutline(label, 2);
        label.lineHeight = label.fontSize + 4;
        (node.getComponent(UITransform) || node.addComponent(UITransform)).setContentSize(120, 28);
        this.mapNode.addChild(node);
        node.addComponent(GoldPopup);
    }

    /** 玩家手动标记「优先攻击」的敌人（null = 默认索敌） */
    private markedEnemy: Enemy | null = null;

    /** 命中检测：返回点击位置附近的存活敌人（半径内最近的一个） */
    private pickEnemyAt(worldPos: Vec3): Enemy | null {
        if (!this.enemyNode) return null;
        let best: Enemy | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const child of this.enemyNode.children) {
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;
            const d = Vec3.distance(worldPos, child.position);
            // 命中半径按体型放宽，方便点中体积小的敌人
            if (d <= enemy.getSelectRadius() + 10 && d < bestDist) {
                bestDist = d;
                best = enemy;
            }
        }
        return best;
    }

    /** 手动标记敌人优先攻击：再点同一敌人则取消，恢复默认索敌 */
    private toggleMarkEnemy(enemy: Enemy): void {
        if (this.markedEnemy === enemy) {
            this.unmarkEnemy();
            return;
        }
        if (this.markedEnemy) {
            this.markedEnemy.setSelected(false);
        }
        this.markedEnemy = enemy;
        enemy.setSelected(true);
        MapManager.instance?.setMarkedEnemyNode(enemy.node);
    }

    private unmarkEnemy(): void {
        if (this.markedEnemy) {
            this.markedEnemy.setSelected(false);
        }
        this.markedEnemy = null;
        MapManager.instance?.setMarkedEnemyNode(null);
    }

    /** 敌人死亡：播放击杀音效（限流防叠加）+ 被标记者死亡后恢复默认索敌 */
    private onEnemyDiedEvent(enemy: Enemy): void {
        AudioManager.playSfxThrottled(AudioManager.SFX.ENEMY_HIT, 0.09);
        if (this.markedEnemy === enemy) {
            this.markedEnemy = null;
            MapManager.instance?.setMarkedEnemyNode(null);
        }
    }

    /** 手动标记障碍物：附近塔集中攻击（再点同一障碍则取消标记） */
    private toggleMarkObstacle(ob: Obstacle): void {
        if (this.markedObstacle === ob) {
            this.unmarkObstacle();
            return;
        }
        if (this.markedObstacle) {
            this.markedObstacle.deselect();
        }
        this.markedObstacle = ob;
        ob.select();
        MapManager.instance?.setMarkedObstacleNode(ob.node);
    }

    private unmarkObstacle(): void {
        if (this.markedObstacle) {
            this.markedObstacle.deselect();
        }
        this.markedObstacle = null;
        MapManager.instance?.setMarkedObstacleNode(null);
    }

    private onMapClick(event: EventTouch): void {
        if (this._gameState !== GameState.PLAYING) return;
        this.hideHint();

        if (!MapManager.instance) return;
        const mm = MapManager.instance;

        const uiPos = event.getUILocation();
        const visibleSize = view.getVisibleSize();
        const worldPos = new Vec3(uiPos.x - visibleSize.width / 2, uiPos.y - visibleSize.height / 2, 0);
        const gp = mm.worldToGrid(worldPos);

        // 建造弹窗已开：再点同一塔位 → 取消选中；点别处 → 仅收起弹窗（保留待建高亮）
        if (this.buildPopupNode.active) {
            if (gp.row === this._selectedSpotRow && gp.col === this._selectedSpotCol) {
                this.cancelBuildSelection();
            } else {
                this.hideBuildPopup();
            }
            return;
        }

        if (this.currentTower) {
            this.currentTower.deselect();
            this.currentTower = null;
            this.towerPanelNode.active = false;
        }
        this.hideRangePreview();

        // 敌人点击：手动标记优先攻击 / 再点一次同一敌人恢复默认索敌
        const hitEnemy = this.pickEnemyAt(worldPos);
        if (hitEnemy) {
            this.toggleMarkEnemy(hitEnemy);
            return;
        }

        const ct = mm.getCellType(gp.row, gp.col);

        // 障碍物点击：手动标记攻击 / 取消标记
        if (ct === CellType.OBSTACLE) {
            const obNode = mm.getObstacleNode(gp.row, gp.col);
            const ob = obNode?.getComponent(Obstacle);
            if (ob && !ob.isDead) {
                this.toggleMarkObstacle(ob);
            }
            return;
        }

        if (ct === CellType.TOWER_SPOT || ct === CellType.BLOCKED) {
            const existingTower = mm.getTowerNode(gp.row, gp.col);
            if (existingTower) {
                const tower = existingTower.getComponent(Tower);
                if (tower) {
                    tower.select();
                    AudioManager.playSfx(AudioManager.SFX.TOWER_SELECT);
                    this.currentTower = tower;
                    this.showTowerPanel(tower);
                }
            } else if (ct === CellType.TOWER_SPOT) {
                this.showBuildPopup(gp.row, gp.col);
            }
        } else {
            // 点空白（非塔位 / 障碍 / 敌人）→ 取消待建选中态
            this.towerPanelNode.active = false;
            this.cancelBuildSelection();
        }
    }

    private showTowerPanel(tower: Tower): void {
        this.towerPanelNode.active = true;
        this.popIn(this.towerPanelNode);
        const pos = tower.node.getPosition();
        // 智能方向：塔位在上半屏则面板向下弹，避免贴顶 HUD；下半屏向上
        const desiredY = pos.y > 0 ? pos.y - 90 - 150 : pos.y + 90;
        this.clampToScreen(this.towerPanelNode, 220, 150, pos.x, desiredY, 16, 60);
        this.updateTowerPanelIcon(tower);
        this.updateTowerPanelInfo();
    }

    private updateTowerPanelIcon(tower: Tower): void {
        const icon = this.towerPanelNode.getChildByName('Icon');
        if (!icon) return;
        destroyChildren(icon);
        if (!SpriteManager.isReady()) return;
        const sf = SpriteManager.getTowerFrame(tower.towerType, tower.level);
        if (sf) {
            SpriteManager.setNodeSprite(icon, sf, 36, 36);
        }
    }

    private updateTowerPanelInfo(): void {
        if (!this.currentTower || !this.currentTower.config) return;
        const cfg = this.currentTower.config;

        this.tpNameLabel.string = cfg.name;
        this.tpLevelLabel.string = `等级 ${this.currentTower.level + 1}`;

        const auraMult = this.currentTower.auraMultiplier;
        const effDmg = Math.round(cfg.damage * auraMult);
        if (auraMult > 1.0) {
            this.tpDamageLabel.string = `伤害:${effDmg}`;
            this.tpDamageLabel.color = new Color(20, 104, 104);
        } else {
            this.tpDamageLabel.string = `伤害:${cfg.damage}`;
            this.tpDamageLabel.color = new Color(64, 44, 28);
        }
        this.tpRangeLabel.string = `射程:${cfg.range}`;
        this.tpFireRateLabel.string = `攻速:${cfg.fireRate}s`;

        // 光环信息
        if (this.currentTower.auraActive) {
            this.tpAuraLabel.string = `光环: +${Math.round(cfg.auraDamageBonus * 100)}% 攻击`;
            this.tpAuraLabel.color = new Color(20, 104, 104);
        } else if (auraMult > 1.0) {
            this.tpAuraLabel.string = `受光环: +${Math.round((auraMult - 1) * 100)}% 攻击`;
            this.tpAuraLabel.color = new Color(20, 104, 104);
        } else {
            this.tpAuraLabel.string = '';
        }

        if (this.currentTower.canUpgrade) {
            this.tpUpgradeBtn.active = true;
            this.tpUpgradeCostLabel.string = `${this.currentTower.upgradeCost}G`;
        } else {
            this.tpUpgradeBtn.active = false;
        }

        this.tpSellValueLabel.string = `${this.currentTower.sellValue}G`;
    }

    private onUpgradeClick(): void {
        if (!this.currentTower) return;
        if (!this.currentTower.canUpgrade) return;
        if (!CurrencyManager.instance?.hasEnough(this.currentTower.upgradeCost)) {
            this.showToast('金币不足，无法升级');
            return;
        }
        if (this.currentTower.upgrade()) {
            AudioManager.playSfx(AudioManager.SFX.TOWER_UPGRADE);
            this.updateTowerPanelInfo();
            this.syncTowerMissions();   // 等级变化会影响「拥有 N 座 X 级塔」类任务
            this.hideRangePreview();    // 鼠标仍停在按钮上时不触发 MOUSE_LEAVE，这里清掉悬停预览的旧范围圈
        }
    }

    private onSellClick(): void {
        if (!this.currentTower) return;
        this.currentTower.sell();
        AudioManager.playSfx(AudioManager.SFX.TOWER_SELL);
        this.currentTower = null;
        this.towerPanelNode.active = false;
        this.syncTowerMissions();
    }

    /** 收集场上所有塔并同步给任务系统（建造 / 升级 / 出售后调用） */
    private syncTowerMissions(): void {
        const mm = MapManager.instance;
        if (!mm) return;
        const entries: TowerStatEntry[] = [];
        for (const n of mm.getAllTowerNodes()) {
            const t = n.getComponent(Tower);
            if (!t) continue;
            // Tower.level 是 0-based，任务配置里用 1-based（1/2/3 级）
            entries.push({ type: t.towerType, level: t.level + 1 });
        }
        MissionManager.instance?.refreshTowers(entries);
    }

    private startNextWave(): void {
        if (this._gameState !== GameState.PLAYING) return;
        const wm = WaveManager.instance;
        if (wm && !wm.isActive) {
            wm.startNextWave();
        }
    }

    private onWaveStart(waveIndex: number, total: number): void {
        // 最后一波用专属音效，其余用统一出怪音
        AudioManager.playSfx(waveIndex >= total - 1 ? AudioManager.SFX.FINAL_WAVE : AudioManager.SFX.WAVE_GO);
        this.waveLabel.string = `${waveIndex + 1}/${total}`;
        this.nextWaveBtn.active = false;
        if (this.autoNextLabel) this.autoNextLabel.node.active = false;
        MissionManager.instance?.onWaveStarted();   // 启动限时任务计时
    }

    private onWaveEnd(waveIndex: number): void {
        // 下一波不再手动触发：普通波由 WaveManager 5s 后自动开始（label 由 onAutoNextTick 显示），
        // boss 波由 onManualNextReady 显示手动按钮
        this.nextWaveBtn.active = false;
        if (this.autoNextLabel) this.autoNextLabel.node.active = false;
    }

    private onManualNextReady(): void {
        this.nextWaveBtn.active = true;
        if (this.autoNextLabel) this.autoNextLabel.node.active = false;
    }

    private onAutoNextTick(remaining: number): void {
        if (!this.autoNextLabel) return;
        this.autoNextLabel.node.active = true;
        // 首波尚未开始时（currentWave<0）显示"出怪准备"，其余显示"下一波"
        const prefix = (WaveManager.instance && WaveManager.instance.currentWave < 0) ? '出怪准备' : '下一波';
        this.autoNextLabel.string = `${prefix} ${Math.ceil(remaining)}s`;
        this.nextWaveBtn.active = false;
    }

    private onSpawnEnemy(type: EnemyType, waveIndex: number, hpMult?: number, noBlock?: boolean): void {
        const path = MapManager.instance?.getWorldPath();
        if (!path || path.length === 0) return;

        // 波次血量曲线：按章节等级分段（每5关一级），关内线性从下限涨到上限
        const waveHpMult = hpMult != null ? hpMult : calcWaveHpMult(
            waveIndex,
            WaveManager.instance?.totalWaves ?? 1,
            this._currentLevel,
        );

        // 换皮：同一波的同类怪共用一套皮肤，波次递增时轮换到下一套
        const skinIdx = SpriteManager.getEnemySkinForWave(type, waveIndex);

        const en = new Node(`Enemy_${type}`);
        en.layer = Layers.Enum.UI_2D;
        en.setPosition(path[0]);
        const enemy = en.addComponent(Enemy);
        enemy.init(type, path, 0, waveHpMult, skinIdx);
        enemy.nonBlocking = noBlock === true;
        this.enemyNode.addChild(en);

        // BOSS 级敌人出场音效
        if (type === EnemyType.BOSS || type === EnemyType.SMALL_BOSS
            || type === EnemyType.BOSS_MODE || type === EnemyType.BOSS_MODE_FLYING) {
            AudioManager.playSfx(AudioManager.SFX.BOSS_SPAWN);
        }

        WaveManager.instance?.onEnemySpawned(enemy.nonBlocking);

        // B03: 敌人生成动画
        EffectManager.playSpawnEffect(this.enemyNode, path[0]);
    }

    private onEnemyReachedEnd(damage: number): void {
        if (Radish.instance) {
            Radish.instance.takeDamage(damage);
        }
    }

    private onEnemySplit(data: { type: EnemyType; count: number; pos: Vec3; pathIndex: number; path: Vec3[]; waveHpMult?: number }): void {
        const { type, count, pos, pathIndex, path, waveHpMult = 1 } = data;
        // A05: 分裂特效
        EffectManager.playSplitEffect(this.enemyNode, pos);

        // 换皮：子怪同样按当前波次取皮肤，保证与同波其他同类怪外观一致
        const splitWaveIndex = WaveManager.instance?.currentWave ?? 0;
        const splitSkinIdx = SpriteManager.getEnemySkinForWave(type, splitWaveIndex);

        for (let i = 0; i < count; i++) {
            const en = new Node(`Enemy_${type}_split_${i}`);
            en.layer = Layers.Enum.UI_2D;
            en.setPosition(pos.x + (Math.random() - 0.5) * 20, pos.y + (Math.random() - 0.5) * 20, 0);
            const enemy = en.addComponent(Enemy);
            // 直接共享路径引用（Enemy 对 path 只读），避免每分裂 1 个就复制一次数组
            enemy.init(type, path, pathIndex, waveHpMult, splitSkinIdx);
            this.enemyNode.addChild(en);
            WaveManager.instance?.onEnemySpawned();
        }
    }


    private onAllWavesDone(): void {
        if (this._allWavesHandled) return;
        this._allWavesHandled = true;
        const levelAtFire = this._currentLevel;
        MissionManager.instance?.stopTiming();   // 冻结限时计时，避免通关延迟期间误判超时
        this.scheduleOnce(() => {
            // 守卫：若 2s 内玩家重开了关卡，旧的结算回调不应再触发
            if (this._currentLevel !== levelAtFire) return;
            const wm = WaveManager.instance;
            if (!wm || wm.remainingEnemies > 0) return;
            // 堡垒战：胜利由堡垒障碍被摧毁触发，不在此处判定
            if (this._currentMode === LevelMode.FORTRESS) return;
            // boss战无萝卜，只需清空敌人；波次战还需萝卜存活
            const alive = this._currentMode === LevelMode.BOSS ? true : Radish.instance?.isAlive() ?? false;
            if (alive) {
                this._gameState = GameState.VICTORY;
                MissionManager.instance?.onLevelCleared();   // 结算禁塔/限时约束任务
                this.showGameOver(true);
            }
        }, 2.0);
    }

    private onRadishDestroyed(): void {
        this._gameState = GameState.GAME_OVER;
        this.showGameOver(false);
    }

    // 堡垒战：由 onObstacleDestroyed 在「堡垒」障碍被摧毁时调用 → 触发胜利（按萝卜剩余血结算星级）
    private onFortressDestroyed(): void {
        if (this._currentMode !== LevelMode.FORTRESS) return;
        this._gameState = GameState.VICTORY;
        MissionManager.instance?.onLevelCleared();
        this.showGameOver(true);
    }

    private showGameOver(isVictory: boolean): void {
        AudioManager.playSfx(isVictory ? AudioManager.SFX.VICTORY : AudioManager.SFX.DEFEAT);
        this.hideHint();
        this.hidePauseOverlay();
        this.gameOverPanelNode.active = true;
        if (this._bossTimeLabel) this._bossTimeLabel.node.active = false;
        this.goTitleLabel.string = isVictory ? '胜利!' : '游戏结束';
        this.goTitleLabel.color = isVictory ? Color.GREEN : Color.RED;
        this.goMsgLabel.string = isVictory ? '所有敌人已被击败!' : '防御点被摧毁!';
        this.goNextBtn.active = isVictory && (this._currentLevel + 1 < getAllLevelConfigs().length);
        this.goMenuBtn.active = true;

        // 星级测评：仅胜利时结算并保存（只增不减，取历史最高）
        const starColorOn = new Color(255, 215, 0);
        const starColorOff = new Color(80, 80, 95);
        let earned = 0;
        if (isVictory && this._currentLevelConfig) {
            // boss战按剩余时间结算；波次/堡垒战按萝卜剩余血结算
            const stars = this._currentMode === LevelMode.BOSS
                ? calcBossStars(this._bossTimeRemaining)
                : calcLevelStars(Radish.instance?.hp ?? 0);
            earned = saveLevelStars(getLevelStarKey(this._currentLevelConfig), stars);
        }
        for (let i = 0; i < this.goStarLabels.length; i++) {
            this.goStarLabels[i].color = i < earned ? starColorOn : starColorOff;
        }
    }

    private onGoldChanged(gold: number): void {
        this.goldLabel.string = `${gold}G`;
        if (this.buildPopupNode.active) {
            this.refreshBuildPopupItems();
        }
        if (this.currentTower && this.towerPanelNode.active) {
            this.updateTowerPanelInfo();
        }
    }

    /** 每帧推进限时任务的计时（约束型任务超时即本局失败） */
    public update(dt: number): void {
        MissionManager.instance?.tickTime(dt);
        this.tickToast(dt);
        // Boss战：倒计时，超时未清完即判负。开局有 5s 准备宽限（与普通关首波 5s 后开始一致），
        // 宽限内不扣时间，仅显示"准备 Ns"；宽限结束后才倒计时并在 HUD 显示"剩余 Ns"。
        if (this._currentMode === LevelMode.BOSS && this._gameState === GameState.PLAYING && !this._bossTimedOut) {
            const scaled = DeveloperData.instance.paused ? 0 : dt;
            if (this._bossGrace > 0) {
                this._bossGrace = Math.max(0, this._bossGrace - scaled);
                if (this._bossTimeLabel && this._bossTimeLabel.node.active) {
                    this._bossTimeLabel.string = `准备 ${Math.ceil(this._bossGrace)}s`;
                }
            } else {
                this._bossTimeRemaining = Math.max(0, this._bossTimeRemaining - scaled);
                if (this._bossTimeLabel && this._bossTimeLabel.node.active) {
                    this._bossTimeLabel.string = `剩余 ${Math.ceil(this._bossTimeRemaining)}s`;
                }
                if (this._bossTimeRemaining <= 0) {
                    this._bossTimedOut = true;
                    this._gameState = GameState.GAME_OVER;
                    this.showGameOver(false);
                }
            }
        }
    }

}