import { _decorator, Component, Node, Vec3, Color, Graphics, UITransform, Label, Overflow, HorizontalTextAlignment, VerticalTextAlignment, EventTarget, Layers, Sprite, SpriteFrame } from 'cc';
const { ccclass, property } = _decorator;

import { EnemyType, EnemyConfig, getEnemyConfig } from '../Data/EnemyData';
import { TowerType } from '../Data/TowerData';
import { COMBAT_SCALE } from '../Data/VisualScale';
import { DeveloperData } from '../Data/DeveloperData';
import { CurrencyManager } from '../Core/CurrencyManager';
import { MissionManager } from '../Core/MissionManager';
import { WaveManager } from '../Core/WaveManager';
import { SpriteManager } from '../Utils/SpriteManager';
import { applyTextOutline } from '../Utils/UIText';
import { EffectManager } from '../Utils/EffectManager';
import { CodexManager } from '../Utils/CodexManager';
import { destroyChildren } from '../Utils/NodeUtil';

const ENEMY_COLORS: Record<EnemyType, Color> = {
    [EnemyType.NORMAL]: new Color(255, 100, 100),
    [EnemyType.FAST]: new Color(255, 200, 50),
    [EnemyType.TANK]: new Color(150, 80, 200),
    [EnemyType.BOSS]: new Color(255, 50, 50),
    [EnemyType.BIG_FAST]: new Color(255, 150, 30),
    [EnemyType.SPLITTER]: new Color(100, 255, 100),
    [EnemyType.SMALL_BOSS]: new Color(255, 120, 200),
    [EnemyType.BOSS_MODE]: new Color(190, 200, 90),
    [EnemyType.BOSS_MODE_FLYING]: new Color(90, 210, 210),
};

/** 是否按大体积敌人（BOSS 级）渲染：更大的贴图、更宽的血条 */
function isBigEnemy(type: EnemyType): boolean {
    return type === EnemyType.BOSS || type === EnemyType.SMALL_BOSS || type === EnemyType.BOSS_MODE || type === EnemyType.BOSS_MODE_FLYING;
}

@ccclass('Enemy')
export class Enemy extends Component {
    private config: EnemyConfig | null = null;
    private _hp: number = 0;
    private _maxHp: number = 0;
    /** 最后一击的来源塔类型（用于「用某塔消灭 N 个敌人」类隐藏任务） */
    private _lastHitTowerType: TowerType | null = null;
    private _waveHpMult: number = 1;
    private _speed: number = 0;
    private _baseSpeed: number = 0;
    private _isDead: boolean = false;
    private _slowTimer: number = 0;
    private _slowFactor: number = 0;
    // 定身：完全停止移动（区别于减速）。_freezeTimer>0 时速度视为 0。
    private _freezeTimer: number = 0;
    private _pathIndex: number = 0;
    private _isLoopPath: boolean = false;
    private _path: Vec3[] = [];
    /** true 时本敌人不计入「本波清空」判定（存活也不阻挡下一波），由波次配置的 noBlock 指定 */
    public nonBlocking: boolean = false;
    /** 被玩家手动标记为优先目标时的高亮描边（Graphics 绘制，不依赖美术资源） */
    private _selRing: Graphics | null = null;
    /** 当前朝向是否朝右（null = 尚未确定，首帧强制同步一次） */
    private _facingRight: boolean | null = null;
    /** 上次血条绘制的像素宽度（-1 = 未绘制过），用于跳过无变化的重绘 */
    private _lastHpBarW: number = -1;
    /** 上次写入的血条文本，用于跳过无变化的 Label 赋值 */
    private _lastHpText: string = '';
    private _hpBarWidth: number = 30;
    private _hpBarHeight: number = 6;
    private _hpBarOffsetY: number = 0;
    /** 敌人本体高度（画布高度），用于把血条精确摆在头顶 */
    private _bodyHeight: number = 0;
    private _hpBarBg: Graphics | null = null;
    private _hpBarFill: Graphics | null = null;
    private _hpLabel: Label | null = null;
    private _healTimer: number = 0;
    private _mainSprite: Sprite | null = null;
    private _slowOverlayNode: Node | null = null;
    /** 定身特效节点（PSnow-11 冰霜环），定身期间挂在身上，到期移除 */
    private _freezeNode: Node | null = null;
    // 持续伤害（暮色长弓）：持续 DoT，刷新取高
    private _dotDps: number = 0;
    private _dotRemaining: number = 0;
    private _dotNode: Node | null = null;
    private _dotSource: TowerType | null = null;
    /** DoT 覆盖层循环播放的帧序列（复用弓箭塔命中动画 archer_fire_11~15） */
    private _dotFrames: (SpriteFrame | null)[] = [];
    private _dotAnimIdx: number = 0;
    private _dotAnimTimer: number = 0;
    private _walkTimer: number = 0;
    private _walkFrameIdx: number = 0;
    /** 换皮索引：生成时随机选定，本体与行走 3 帧都取自该套皮肤（仅外观不同，属性不变） */
    private _skinIdx: number = 0;

    private static readonly WALK_FRAME_INTERVAL = 0.14;

    private static _eventTarget: EventTarget = new EventTarget();
    public static readonly EVENT_ENEMY_REACHED_END = 'enemy-reached-end';
    public static readonly EVENT_ENEMY_DIED = 'enemy-died';
    public static readonly EVENT_ENEMY_SPLIT = 'enemy-split';

    public static get eventTarget(): EventTarget {
        return Enemy._eventTarget;
    }

    public get isDead(): boolean {
        return this._isDead;
    }

    public get hp(): number {
        return this._hp;
    }

    public get pathIndex(): number {
        return this._pathIndex;
    }

    public init(type: EnemyType, path: Vec3[], startPathIndex: number = 0, waveHpMult: number = 1, skinIdx: number = 0): void {
        const cfg = getEnemyConfig(type);
        if (!cfg) return;

        this.config = cfg;
        this._waveHpMult = Math.max(0.1, waveHpMult);
        this._hp = Math.round(cfg.hp * this._waveHpMult);
        this._maxHp = Math.round(cfg.hp * this._waveHpMult);
        this._speed = cfg.speed;
        this._baseSpeed = cfg.speed;
        this._isDead = false;
        this._slowTimer = 0;
        this._slowFactor = 0;
        this._path = path;
        this._isLoopPath = this._path.length >= 2
            && this._path[0].x === this._path[this._path.length - 1].x
            && this._path[0].y === this._path[this._path.length - 1].y;
        this._pathIndex = startPathIndex;
        this._healTimer = 0;
        this._walkTimer = 0;
        this._walkFrameIdx = 0;
        // 换皮：皮肤由波次决定（同一波同类怪外观一致，波与波之间轮换）
        this._skinIdx = skinIdx;

        if (this._path.length > startPathIndex) {
            this.node.setPosition(this._path[startPathIndex]);
        }

        this.createVisuals();
        this.createHpBar();
    }

    onDestroy(): void {
        // 关卡切换会销毁敌人节点。必须取消延时回调：
        // 死亡动画的 finalizeDie 由全局调度器管理，脱离场景树也会照常触发，
        // 从而在新关卡里加金币、递减波次计数（可致负数 → 误判通关）。
        this.unscheduleAllCallbacks();
    }

    private createVisuals(): void {
        // 图鉴：敌人出场即解锁（首遇）
        if (this.config) CodexManager.discover('enemies', this.config.type);
        // 复用节点时：旧子节点必须"脱离 + 销毁"，removeAllChildren 只脱离不销毁会泄漏
        // （旧血条 / 减速 / DoT / 定身特效节点会成为孤儿）
        destroyChildren(this.node);
        this.clearCombatOverlays();
        this._mainSprite = null;

        // ── 敌人本体：优先使用素材 Sprite，否则回退到 Graphics ──
        const sf = SpriteManager.isReady()
            ? SpriteManager.getEnemyFrame(this.config!.type, this._skinIdx)
            : null;

        if (sf) {
            // 按内容包围盒适配：贴图含透明 padding，且各敌人画布宽高比不同
            // （如 splitter 为 148×104），强行铺成正方形会拉伸变形
            const contentSize = this.getContentSize();
            const spriteNode = SpriteManager.setNodeSpriteFitted(this.node, sf, contentSize);
            this._bodyHeight = spriteNode.getComponent(UITransform)!.contentSize.height;
            this._mainSprite = spriteNode.getComponent(Sprite)!;
        } else {
            const g = this.node.getComponent(Graphics);
            if (!g) {
                this.node.addComponent(Graphics);
            }
            const graphics = this.node.getComponent(Graphics)!;
            graphics.clear();
            const color = ENEMY_COLORS[this.config!.type] || Color.WHITE;
            graphics.fillColor = color;
            // 无素材兜底：半径需与有素材时的内容尺寸对应（contentSize 为长边 → 直径）
            const r = this.getContentSize() / 2;
            graphics.circle(0, 0, r);
            graphics.fill();
            this._bodyHeight = r * 2;
        }
    }

    /**
     * 敌人的**内容长边**显示尺寸（像素，格子为 60）。
     * 注：原实现按 isBigEnemy（仅 BOSS/SMALL_BOSS）分为 64/56/44 三档，
     * 导致 TANK、BIG_FAST 这类大体积怪与普通怪同为 44 —— 体型差异完全丢失。
     */
    /** 各类型基础内容长边尺寸（像素，在 60px 老基准下调好），getContentSize 会再乘 COMBAT_SCALE */
    private getBaseContentSize(): number {
        switch (this.config!.type) {
            case EnemyType.BOSS: return 96;
            // boss_mode_11 素材：体型介于 BOSS(200×176) 与小BOSS(160×112) 之间
            case EnemyType.BOSS_MODE:
            case EnemyType.BOSS_MODE_FLYING: return 88;
            case EnemyType.SMALL_BOSS: return 78;
            case EnemyType.BIG_FAST: return 72;
            case EnemyType.TANK: return 66;
            case EnemyType.SPLITTER: return 60;
            case EnemyType.NORMAL:
                return 52;
            case EnemyType.FAST: return 50;
            default: return 54;
        }
    }

    /**
     * 敌人的**内容长边**显示尺寸（像素），整体按 COMBAT_SCALE 与塔身/特效统一放大，
     * 保持"怪 vs 塔"的视觉比例一致；命中半径、选中半径、血条位置都由此推导，自动跟随。
     */
    private getContentSize(): number {
        return this.getBaseContentSize() * COMBAT_SCALE;
    }

    /** 怪物命中判定半径（像素）：基于本体显示长边的一半，
     *  让子弹/溅射的命中判定随怪物体型同步增大，避免"看着很大却打不中"。 */
    public get hitRadius(): number {
        return this.getContentSize() / 2;
    }

    private createHpBar(): void {
        const isBoss = isBigEnemy(this.config!.type);
        this._hpBarWidth = isBoss ? 40 : 30;
        this._hpBarHeight = 6;
        // 由本体实际高度推导，敌人尺寸调整后血条自动贴合头顶（原先为写死的 52/42）
        this._hpBarOffsetY = this._bodyHeight / 2 + 12;

        const w = this._hpBarWidth;
        const h = this._hpBarHeight;
        const oy = this._hpBarOffsetY;
        const hw = w / 2;
        const hh = h / 2;

        const bgNode = new Node('HpBarBg');
        bgNode.layer = Layers.Enum.UI_2D;
        bgNode.addComponent(UITransform).setContentSize(w + 2, h + 2);
        bgNode.setPosition(0, oy, 0);
        const bgG = bgNode.addComponent(Graphics);
        const r = 3;
        // 深灰蓝半透圆角槽（v3 深色磨砂）
        bgG.fillColor = new Color(24, 36, 54, 230);
        bgG.roundRect(-hw - 1, -hh - 1, w + 2, h + 2, r + 1);
        bgG.fill();
        bgG.strokeColor = new Color(140, 178, 210, 120);
        bgG.lineWidth = 1;
        bgG.roundRect(-hw - 1, -hh - 1, w + 2, h + 2, r + 1);
        bgG.stroke();
        bgG.strokeColor = new Color(26, 38, 58, 160);
        bgG.roundRect(-hw, -hh, w, h, r);
        bgG.stroke();
        this._hpBarBg = bgG;
        this.node.addChild(bgNode);

        const fillNode = new Node('HpBarFill');
        fillNode.layer = Layers.Enum.UI_2D;
        fillNode.addComponent(UITransform).setContentSize(w, h);
        fillNode.setPosition(0, oy, 0);
        this._hpBarFill = fillNode.addComponent(Graphics);
        this._hpBarFill.fillColor = new Color(50, 255, 50);
        this._hpBarFill.rect(-hw, -hh, w, h);
        this._hpBarFill.fill();
        this.node.addChild(fillNode);

        const hpLabelNode = new Node('HpLabel');
        hpLabelNode.layer = Layers.Enum.UI_2D;
        hpLabelNode.addComponent(UITransform).setContentSize(w + 10, 14);
        hpLabelNode.setPosition(0, oy - h - 6, 0);
        this._hpLabel = hpLabelNode.addComponent(Label);
        this._hpLabel.string = `${this._hp}/${this._maxHp}`;
        this._hpLabel.fontSize = 9;
        this._hpLabel.lineHeight = 12;
        this._hpLabel.color = Color.WHITE;
        applyTextOutline(this._hpLabel, 2);
        this._hpLabel.overflow = Overflow.NONE;
        this._hpLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        this._hpLabel.verticalAlign = VerticalTextAlignment.CENTER;
        this.node.addChild(hpLabelNode);
    }

    /**
     * @param damage 伤害值
     * @param sourceTowerType 伤害来源塔类型（可选，供隐藏任务按塔统计击杀）
     */
    public takeDamage(damage: number, sourceTowerType?: TowerType): void {
        if (this._isDead) return;
        if (sourceTowerType) this._lastHitTowerType = sourceTowerType;
        this._hp -= damage;

        // boss 受击掉金：每被打一下固定获得金币（由 EnemyConfig.goldPerHit 配置，默认 0 不掉）。
        // 这里不发飘字 —— boss 会被高频 AoE 反复命中，飘字会刷屏。
        const goldPerHit = this.config.goldPerHit ?? 0;
        if (goldPerHit > 0) {
            CurrencyManager.instance?.addGold(goldPerHit);
            MissionManager.instance?.onGoldEarned(goldPerHit);
        }

        this.updateHpBar();

        if (this._hp <= 0) {
            this.die();
        }
    }

    /** 当前是否带有任意负面效果（减速或定身）。
     *  按需求：一个怪同时只能有一个负面效果（减速/定身互斥），
     *  故只要有任一种负面在身，新的减速或定身都应被拒绝，直到当前负面结束。 */
    public hasNegativeEffect(): boolean {
        return this._slowTimer > 0 || this._freezeTimer > 0;
    }

    public applySlow(factor: number, duration: number, slowEffect: 'frost' | 'coagulator' | 'condenser' | 'default' = 'default'): void {
        // 负面效果互斥：若怪身上已有减速或定身，新的减速一律忽略，
        // 除非当前负面效果已结束（_slowTimer/_freezeTimer 归零）。
        // 例：被光棱塔减速的怪，凝滞塔的减速无效，须等光棱减速结束才能再上减速。
        if (this.hasNegativeEffect()) return;

        this._slowFactor = factor;
        this._slowTimer = duration;
        this._speed = this._baseSpeed * (1 - this._slowFactor);

        // 减速覆盖层：
        //  - 光棱塔使用专属冰束减速动画（单帧）
        //  - 凝滞塔（便便）使用专属减速特效（PShit-11 / PShit-12 两帧循环）
        //  - 其余塔回退通用 slow_overlay
        if (!this._slowOverlayNode && SpriteManager.isReady()) {
            // 减速叠加层尺寸随敌人放大（setNodeSprite 不经 sc，故直接用已放大的 getContentSize）
            const slowSize = Math.round(this.getContentSize() * 0.85);
            let sf: SpriteFrame | null = null;
            let frames: SpriteFrame[] | null = null;
            if (slowEffect === 'frost') {
                sf = SpriteManager.getPrismSlowFrame();
            } else if (slowEffect === 'coagulator') {
                frames = SpriteManager.getCoagulatorSlowFrames();
            } else if (slowEffect === 'condenser') {
                sf = SpriteManager.getCondenserSlowFrame();
            }
            if (!sf && !frames) sf = SpriteManager.getEffectFrame('slow_overlay');
            if (sf) {
                this._slowOverlayNode = SpriteManager.setNodeSprite(this.node, sf, slowSize, slowSize);
            } else if (frames && frames.length > 0) {
                // 凝滞塔减速特效：两帧 PShit-11 → PShit-12 循环播放
                this._slowOverlayNode = SpriteManager.setNodeSprite(this.node, frames[0], slowSize, slowSize);
                const sprite = this._slowOverlayNode.getComponent(Sprite);
                if (sprite && frames.length > 1) {
                    let idx = 0;
                    const swap = () => {
                        // 节点/组件被销毁后停止切换并注销定时器
                        if (!sprite || !sprite.isValid) {
                            this.unschedule(swap);
                            return;
                        }
                        idx = (idx + 1) % frames.length;
                        sprite.spriteFrame = frames[idx];
                    };
                    this.schedule(swap, 0.18);
                }
            }
        }
    }

    /** 定身：使敌人完全停止移动一段时长（取更长者）。
     *  定身是比减速更高一级的负面效果，拥有最高优先级：
     *  - 若怪当前只是被减速，定身会覆盖减速（清除减速状态后上定身）；
     *  - 若已在定身，仅刷新定身时长（不叠加）；
     *  - 减速无法覆盖定身（见 applySlow 的 hasNegativeEffect 拦截）。 */
    public applyFreeze(duration: number): void {
        if (duration <= 0) return;

        // 覆盖减速：清掉当前减速（保证同一时刻只有一个负面效果，且定身优先）
        if (this._slowTimer > 0) {
            this._slowTimer = 0;
            this._slowFactor = 0;
            this._speed = this._baseSpeed;
            if (this._slowOverlayNode && this._slowOverlayNode.isValid) {
                this._slowOverlayNode.destroy();
                this._slowOverlayNode = null;
            }
        }

        const wasFrozen = this._freezeTimer > 0;
        this._freezeTimer = Math.max(this._freezeTimer, duration);
        // 进入定身时挂上冰霜定身特效（PSnow-11）；若已在定身则仅刷新时长
        // playSnowFreeze 内部会再乘 COMBAT_SCALE，故此处传未放大的基准值，使冰霜环随敌人放大
        if (!wasFrozen && !this._freezeNode && SpriteManager.isReady()) {
            this._freezeNode = EffectManager.playSnowFreeze(this.node, Math.round(this.getBaseContentSize() * 0.85));
        }
    }

    /**
     * 统一清理"战斗覆盖层"节点（DoT / 减速 / 定身特效）并复位相关状态。
     * 这些节点默认挂在敌人本体上、随本体销毁回收；显式清理用于：
     *   1) 避免组件持有已销毁节点的悬空引用；
     *   2) 复用节点重建时防止旧特效被子节点脱离却未销毁而泄漏。
     */
    private clearCombatOverlays(): void {
        if (this._dotNode && this._dotNode.isValid) this._dotNode.destroy();
        this._dotNode = null;
        this._dotFrames = [];
        this._dotDps = 0;
        this._dotRemaining = 0;
        this._dotSource = null;

        if (this._slowOverlayNode && this._slowOverlayNode.isValid) this._slowOverlayNode.destroy();
        this._slowOverlayNode = null;

        if (this._freezeNode && this._freezeNode.isValid) this._freezeNode.destroy();
        this._freezeNode = null;
    }

    /** 施加持续伤害：刷新取高（dps 与剩余时长均取较大者，不叠加）。 */
    public applyDot(dps: number, duration: number, source: TowerType = TowerType.ARCHER): void {
        if (dps <= 0 || duration <= 0 || this._isDead) return;
        this._dotSource = source;
        // 刷新取高：再中毒时取 max，避免叠加
        this._dotDps = Math.max(this._dotDps, dps);
        this._dotRemaining = Math.max(this._dotRemaining, duration);
        // 毒效视觉：循环播放弓箭塔命中动画（archer_fire_11~15），DoT 期间持续、到期移除，不额外出素材
        if (!this._dotNode && SpriteManager.isReady()) {
            const size = Math.round(this.getContentSize() * 0.9);
            const frames = SpriteManager.getArcherHitFrames();
            const dotSf = frames.find((f) => !!f) ?? null;
            if (dotSf) {
                this._dotNode = SpriteManager.setNodeSpriteFitted(this.node, dotSf, size, 'DotOverlay');
                this._dotFrames = frames;
                this._dotAnimIdx = 0;
                this._dotAnimTimer = 0.08;
            } else {
                const sf = SpriteManager.getEffectFrame('dot_overlay');
                if (sf) {
                    this._dotNode = SpriteManager.setNodeSprite(this.node, sf, size, size);
                } else {
                    const n = new Node('DotOverlay');
                    n.layer = this.node.layer;
                    this.node.addChild(n);
                    const g = n.addComponent(Graphics);
                    g.fillColor = new Color(80, 200, 60, 90);
                    g.circle(0, 0, size * 0.5);
                    g.fill();
                    this._dotNode = n;
                }
            }
        }
    }

    /** 选中/命中半径（按体型缩放）：供手动标记高亮与点击命中判定使用 */
    public getSelectRadius(): number {
        return this.getContentSize() / 2 + 8;
    }

    /** 手动标记为优先目标时的高亮：on=true 显示描边，false 清除 */
    public setSelected(on: boolean): void {
        if (on) {
            if (!this._selRing) {
                const n = new Node('SelRing');
                n.layer = this.node.layer;
                this.node.addChild(n);
                this._selRing = n.addComponent(Graphics);
            }
            const half = this.getSelectRadius();
            const g = this._selRing!;
            g.clear();
            g.fillColor = new Color(255, 90, 90, 26);
            g.rect(-half, -half, half * 2, half * 2);
            g.fill();
            g.strokeColor = new Color(255, 90, 90);
            g.lineWidth = 3;
            g.rect(-half, -half, half * 2, half * 2);
            g.stroke();
        } else if (this._selRing) {
            this._selRing.clear();
        }
    }

    /** 获取敌人当前移动方向（归一化向量），用于分裂子弹 */
    public getMovementDirection(): Vec3 | null {
        if (this._isDead || this._pathIndex >= this._path.length - 1) return null;
        const target = this._path[this._pathIndex + 1];
        const current = this.node.position;
        const dir = new Vec3(target.x - current.x, target.y - current.y, 0);
        const len = dir.length();
        if (len < 0.001) return null;
        return dir.normalize();
    }

    private updateHpBar(): void {
        if (!this._hpBarFill) return;
        const ratio = Math.max(0, this._hp / this._maxHp);
        const w = this._hpBarWidth;
        const h = this._hpBarHeight;

        // 量化到 1px：辐射/火炮这类高频 AoE 每 tick 都会打到全体敌人并调用本函数，
        // 而血量变化常常小到不足以改变 1px 宽度 —— 此时跳过 clear+fill 重绘与 Color 分配。
        // 血条宽 30px，故每只怪一生最多重绘 31 次，而非每次掉血一次。
        const fillW = Math.round(w * ratio);
        if (fillW !== this._lastHpBarW) {
            this._lastHpBarW = fillW;
            const hw = w / 2;
            const hh = h / 2;
            this._hpBarFill.clear();
            this._hpBarFill.fillColor = ratio > 0.5
                ? new Color(110, 172, 122)
                : (ratio > 0.25 ? new Color(206, 184, 104) : new Color(194, 110, 112));
            this._hpBarFill.roundRect(-hw, -hh, fillW, h, 3);
            this._hpBarFill.fill();
        }

        if (this._hpLabel) {
            const text = `${Math.max(0, Math.ceil(this._hp))}/${this._maxHp}`;
            if (text !== this._lastHpText) {
                this._lastHpText = text;
                this._hpLabel.string = text;
            }
        }
    }

    private die(): void {
        if (this._isDead) return;
        this._isDead = true;

        // die 帧与 walk 帧内容一致（源素材共用），不再单独播放死亡序列，直接结算
        this.finalizeDie();

    }

    /** Destroy immediately (no death anim) */
    private finalizeDie(): void {
        if (this.config) {
            const reward = this.config.reward;
            CurrencyManager.instance?.addGold(reward);
            // 隐藏任务：累计获得金币（毛收入，建造花费不扣减）
            MissionManager.instance?.onGoldEarned(reward);
            // B06: 金币飞入特效
            this.playCoinFly(reward);
            // Split monster spawns children on death
            if (this.config.splitCount > 0) {
                const pos = this.node.getPosition();
                Enemy._eventTarget.emit(
                    Enemy.EVENT_ENEMY_SPLIT,
                    {
                        type: this.config.splitType,
                        count: this.config.splitCount,
                        pos: pos,
                        pathIndex: this._pathIndex,
                        path: [...this._path],
                        waveHpMult: this._waveHpMult,
                    },
                );
            }
        }

        WaveManager.instance?.onEnemyDied(this.nonBlocking);
        // 隐藏任务：按「最后一击」的来源塔统计击杀
        MissionManager.instance?.onEnemyKilled(this._lastHitTowerType);
        Enemy._eventTarget.emit(Enemy.EVENT_ENEMY_DIED, this);

        // 统一清理战斗覆盖层，避免引用悬空（DoT / 减速 / 定身特效）
        this.clearCombatOverlays();
        if (this.node && this.node.isValid) {
            this.node.destroy();
        }
    }

    /** B06: 金币飞入特效 */
    private playCoinFly(amount: number): void {
        const parent = this.node.parent;
        if (!parent) return;
        EffectManager.playCoinFly(parent, this.node.getPosition(), amount);
    }

    private reachEnd(): void {
        if (this._isDead) return;
        this._isDead = true;

        WaveManager.instance?.onEnemyReachedEnd(this.nonBlocking);
        Enemy._eventTarget.emit(Enemy.EVENT_ENEMY_REACHED_END, this.config?.damage ?? 1);

        // 到达终点同样清理战斗覆盖层
        this.clearCombatOverlays();
        if (this.node && this.node.isValid) {
            this.node.destroy();
        }
    }

    private healNearbyEnemies(dt: number): void {
        if (!this.config || this.config.healAmount <= 0 || this.config.healInterval <= 0) return;

        this._healTimer += dt;
        if (this._healTimer < this.config.healInterval) return;
        this._healTimer = 0;

        const parent = this.node.parent;
        if (!parent) return;

        const myPos = this.node.position;
        for (const child of parent.children) {
            if (child === this.node) continue;
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;
            const dist = Vec3.distance(myPos, child.position);
            if (dist <= 100) {
                enemy.heal(this.config.healAmount);
            }
        }
    }

    public heal(amount: number): void {
        if (this._isDead) return;
        this._hp = Math.min(this._hp + amount, this._maxHp);
        this.updateHpBar();
    }

    update(dt: number): void {
        if (this._isDead) return;
        if (DeveloperData.instance.paused) return;

        const scaledDt = dt * DeveloperData.instance.speedMultiplier;

        // 持续伤害 DoT（刷新取高，不叠加）：按 dps 持续扣血，击杀归属记持续伤害来源
        if (this._dotRemaining > 0) {
            this._dotRemaining -= scaledDt;
            this._hp -= this._dotDps * scaledDt;
            this.updateHpBar();
            if (this._hp <= 0) {
                this._lastHitTowerType = this._dotSource;
                this.die();
                return;
            }
            // DoT 视觉：按间隔循环切帧（archer_fire_11~15），与命中动画一致
            if (this._dotNode && this._dotNode.isValid && this._dotFrames.length > 1) {
                this._dotAnimTimer -= scaledDt;
                if (this._dotAnimTimer <= 0) {
                    this._dotAnimTimer += 0.08;
                    this._dotAnimIdx = (this._dotAnimIdx + 1) % this._dotFrames.length;
                    const sp = this._dotNode.getComponent(Sprite);
                    const f = this._dotFrames[this._dotAnimIdx];
                    if (sp && f) sp.spriteFrame = f;
                }
            }
            if (this._dotRemaining <= 0) {
                this._dotRemaining = 0;
                this._dotDps = 0;
                if (this._dotNode && this._dotNode.isValid) {
                    this._dotNode.destroy();
                    this._dotNode = null;
                }
                this._dotFrames = [];
            }
        }

        this.healNearbyEnemies(scaledDt);

        if (this._slowTimer > 0) {
            this._slowTimer -= scaledDt;
            if (this._slowTimer <= 0) {
                this._slowFactor = 0;
                this._speed = this._baseSpeed;
                // Remove slow overlay
                if (this._slowOverlayNode && this._slowOverlayNode.isValid) {
                    this._slowOverlayNode.destroy();
                    this._slowOverlayNode = null;
                }
            }
        }

        // 定身：完全停止移动。定身期间不推进路径进度，也不做任何位移。
        if (this._freezeTimer > 0) {
            this._freezeTimer -= scaledDt;
            if (this._freezeTimer <= 0) {
                this._freezeTimer = 0;
                // 定身结束，移除冰霜特效节点
                if (this._freezeNode && this._freezeNode.isValid) {
                    this._freezeNode.destroy();
                    this._freezeNode = null;
                }
            }
            // 定身期间跳过行走动画与位移，但仍处理血条/治疗等（已在上面完成）
            return;
        }

        // ── 行走动画：循环切换 3 帧行走序列（源帧，如 normal_11/12/13） ──
        if (this._mainSprite && this.config && SpriteManager.isReady()) {
            this._walkTimer -= scaledDt;
            if (this._walkTimer <= 0) {
                this._walkTimer = Enemy.WALK_FRAME_INTERVAL;
                this._walkFrameIdx = (this._walkFrameIdx + 1) % 3;
                const walkFrames = SpriteManager.getEnemyWalkFrames(this.config.type, this._skinIdx);
                const walkFrame = walkFrames[this._walkFrameIdx];
                if (walkFrame) {
                    this._mainSprite.spriteFrame = walkFrame;
                }
            }
        }

        if (this._pathIndex >= this._path.length - 1) {
            // 环形地图（Boss 战）：路径首尾相接则循环回起点，避免敌人绕一圈就逃脱
            if (this._isLoopPath) {
                this._pathIndex = 0;
                return;
            }
            this.reachEnd();
            return;
        }

        // 每帧避免临时对象分配（高敌数量时显著降低 GC 压力）
        const target = this._path[this._pathIndex + 1];
        const current = this.node.position;
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 朝向左时水平翻转敌人精灵（敌人默认朝右），无需额外方向帧组。
        // 仅在朝向真正改变时才 setScale —— 每帧无条件调用会让 60 只怪 ×60fps 反复弄脏变换矩阵。
        if (this._mainSprite && dx !== 0) {
            const right = dx > 0;
            if (this._facingRight !== right) {
                this._facingRight = right;
                this._mainSprite.node.setScale(right ? 1 : -1, 1);
            }
        }

        if (dist < 2) {
            this._pathIndex++;
            return;
        }

        const inv = this._speed * scaledDt / dist;
        this.node.setPosition(current.x + dx * inv, current.y + dy * inv, 0);
    }
}