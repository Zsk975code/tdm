import { _decorator, Component, Node, Vec3, Color, Graphics, UITransform, Label, EventTarget, Layers, Sprite, SpriteFrame } from 'cc';
const { ccclass } = _decorator;

import { ObstacleType, OBSTACLE_DEFS } from '../Data/LevelData';
import { EffectManager } from '../Utils/EffectManager';
import { SpriteManager } from '../Utils/SpriteManager';
import { applyTextOutline } from '../Utils/UIText';
import { TowerType } from '../Data/TowerData';
import { DeveloperData } from '../Data/DeveloperData';
import { CodexManager } from '../Utils/CodexManager';
import { destroyChildren } from '../Utils/NodeUtil';

/**
 * 地图障碍物：
 * - 岩石类：ROCK_SMALL(1×1) / ROCK_WIDE(2×1) / ROCK_BIG(2×2)，摧毁时给少量金币
 * - 宝箱类（金袋）：CHEST_SMALL(1×1) / CHEST_BIG(2×2)，摧毁时给大量金币
 * - 不可直接建造，被炮塔（手动点击标记后）攻击摧毁，摧毁后覆盖格变为可建造
 * - 数值（血量/奖励/占格）由 OBSTACLE_DEFS 统一配置
 */
@ccclass('Obstacle')
export class Obstacle extends Component {
    public static readonly EVENT_DESTROYED = 'obstacle-destroyed';

    private _row: number = 0;
    private _col: number = 0;
    private _type: ObstacleType = ObstacleType.ROCK_SMALL;
    private _w: number = 1;
    private _h: number = 1;
    private _cellSize: number = 140;
    private _hp: number = 0;
    private _maxHp: number = 0;
    private _reward: number = 0;
    private _isTreasure: boolean = false;
    private _isFortress: boolean = false;
    private _dead: boolean = false;
    private _gfx: Graphics | null = null;
    private _hpBarGfx: Graphics | null = null;
    private _hpLabel: Label | null = null;
    private _selRing: Graphics | null = null;
    private _eventTarget: EventTarget = new EventTarget();

    // 持续伤害（穿云箭命中障碍）：持续 DoT，刷新取高
    private _dotDps: number = 0;
    private _dotRemaining: number = 0;
    private _dotNode: Node | null = null;
    /** DoT 覆盖层循环播放的帧序列（复用弓箭塔命中动画 archer_fire_11~15） */
    private _dotFrames: (SpriteFrame | null)[] = [];
    private _dotAnimIdx: number = 0;
    private _dotAnimTimer: number = 0;

    public get isDead(): boolean {
        return this._dead;
    }

    public get hp(): number {
        return this._hp;
    }

    public get maxHp(): number {
        return this._maxHp;
    }

    public get row(): number {
        return this._row;
    }

    public get col(): number {
        return this._col;
    }

    public get type(): ObstacleType {
        return this._type;
    }

    public get w(): number {
        return this._w;
    }

    public get h(): number {
        return this._h;
    }

    public get reward(): number {
        return this._reward;
    }

    public get isTreasure(): boolean {
        return this._isTreasure;
    }

    public get isFortress(): boolean {
        return this._isFortress;
    }

    public get eventTarget(): EventTarget {
        return this._eventTarget;
    }

    /** 装备尺寸（像素）：宽 = w*cellSize，高 = h*cellSize */
    public get pixelW(): number {
        return this._w * this._cellSize;
    }

    public get pixelH(): number {
        return this._h * this._cellSize;
    }

    public get coveredCells(): { row: number; col: number }[] {
        const cells: { row: number; col: number }[] = [];
        for (let r = 0; r < this._h; r++) {
            for (let c = 0; c < this._w; c++) {
                cells.push({ row: this._row + r, col: this._col + c });
            }
        }
        return cells;
    }

    public init(row: number, col: number, type: ObstacleType, cellSize: number, isFortress: boolean = false): void {
        this._row = row;
        this._col = col;
        this._type = type;
        this._cellSize = cellSize;
        this._isFortress = isFortress;

        const def = OBSTACLE_DEFS[type];
        this._w = def.w;
        this._h = def.h;
        this._maxHp = def.hp;
        this._hp = def.hp;
        this._reward = def.reward;
        this._isTreasure = def.isTreasure;
        this._dead = false;

        // 图鉴：障碍生成即解锁（首遇）
        CodexManager.discover('obstacles', type);

        const tf = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        tf.setContentSize(this.pixelW + 8, this.pixelH + 40);
        this.createVisuals();
    }

    private createVisuals(): void {
        // 复用节点时：旧子节点必须"脱离 + 销毁"，removeAllChildren 只脱离不销毁会泄漏
        destroyChildren(this.node);
        this.clearCombatOverlays();
        this.node.removeComponent(Graphics);
        this._gfx = null;

        const def = OBSTACLE_DEFS[this._type];

        // 宝箱（金袋）：优先使用素材贴图，否则 Graphics 兜底
        if (this._isTreasure) {
            const sf = SpriteManager.isReady()
                ? SpriteManager.getObstacleFrame(this._type)
                : null;
            if (sf) {
                SpriteManager.setNodeSprite(this.node, sf, this.pixelW, this.pixelH);
            } else {
                const g = this.node.addComponent(Graphics);
                this._gfx = g;
                this.drawChestFallback(g);
            }
            this.addGoldGlow();
        } else {
            // 岩石：优先素材（obstacle_big / obstacle_small_0x），否则 Graphics 兜底
            const sf = SpriteManager.isReady()
                ? SpriteManager.getObstacleFrame(this._type, this._row, this._col)
                : null;
            if (sf) {
                SpriteManager.setNodeSprite(this.node, sf, this.pixelW, this.pixelH);
            } else {
                const g = this.node.addComponent(Graphics);
                this._gfx = g;
                this.drawRock(g);
            }
        }

        // HP 条
        const barNode = new Node('HpBar');
        barNode.layer = Layers.Enum.UI_2D;
        const barG = barNode.addComponent(Graphics);
        this._hpBarGfx = barG;
        this.node.addChild(barNode);
        this.redrawHpBar();

        // HP 文字
        const labelNode = new Node('HpLabel');
        labelNode.layer = Layers.Enum.UI_2D;
        const halfH = this.pixelH / 2;
        labelNode.setPosition(0, halfH + 14, 0);
        this._hpLabel = labelNode.addComponent(Label);
        this._hpLabel.string = `${this._hp}/${this._maxHp}`;
        this._hpLabel.fontSize = this._h >= 2 ? 16 : 13;
        this._hpLabel.color = Color.WHITE;
        applyTextOutline(this._hpLabel, 2);
        (labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform)).setContentSize(
            this._w >= 2 ? 120 : 80, 20,
        );
        this.node.addChild(labelNode);

        // 选中标记环
        const ringNode = new Node('SelRing');
        ringNode.layer = Layers.Enum.UI_2D;
        const ringG = ringNode.addComponent(Graphics);
        this._selRing = ringG;
        this.node.addChild(ringNode);

        // 堡垒标记：金色环，提示这是堡垒战的胜利目标
        if (this._isFortress) this.drawFortressMarker();
    }

    /** 宝箱背后的金色光晕，提示"摧毁有奖励" */
    private addGoldGlow(): void {
        const glow = new Node('GoldGlow');
        glow.layer = Layers.Enum.UI_2D;
        const g = glow.addComponent(Graphics);
        const r = Math.max(this.pixelW, this.pixelH) / 2 + 6;
        g.fillColor = new Color(255, 220, 90, 60);
        g.circle(0, 0, r);
        g.fill();
        this.node.addChild(glow);
        // 置于最底层
        glow.setSiblingIndex(0);
    }

    private drawRock(g: Graphics): void {
        g.clear();
        const w = this.pixelW;
        const h = this.pixelH;
        const hw = w / 2;
        const hh = h / 2;

        g.fillColor = new Color(126, 116, 104);
        g.rect(-hw + 4, -hh + 4, w - 8, h - 8);
        g.fill();

        g.strokeColor = new Color(70, 62, 56);
        g.lineWidth = 3;
        g.rect(-hw + 4, -hh + 4, w - 8, h - 8);
        g.stroke();

        // 顶部高光
        g.fillColor = new Color(150, 142, 128);
        g.rect(-hw + 8, hh - Math.min(20, h / 3), w - 16, 10);
        g.fill();

        // 裂纹
        g.strokeColor = new Color(70, 62, 56);
        g.lineWidth = 2;
        const segX = w / 4;
        const segY = h / 4;
        g.moveTo(-hw + segX * 1.4, -hh + segY * 0.8);
        g.lineTo(-hw + segX * 2.2, -hh + segY * 1.8);
        g.lineTo(-hw + segX * 1.8, -hh + segY * 2.6);
        g.stroke();

        // 碎石点缀
        g.fillColor = new Color(70, 62, 56);
        const dotCount = this._w + this._h;
        for (let i = 0; i < dotCount; i++) {
            const dx = -hw + segX * (1 + (i + 1) * 0.8);
            const dy = -hh + segY * (2.4 - (i % 2) * 0.5);
            g.circle(dx, dy, 4);
            g.fill();
        }
    }

    private drawChestFallback(g: Graphics): void {
        g.clear();
        const w = this.pixelW;
        const h = this.pixelH;
        const hw = w / 2;
        const hh = h / 2;
        g.fillColor = new Color(180, 140, 60);
        g.rect(-hw + 6, -hh + 6, w - 12, h - 12);
        g.fill();
        g.strokeColor = new Color(120, 90, 30);
        g.lineWidth = 3;
        g.rect(-hw + 6, -hh + 6, w - 12, h - 12);
        g.stroke();
        g.fillColor = new Color(255, 220, 90);
        g.circle(0, 0, Math.min(w, h) * 0.18);
        g.fill();
    }

    /** 堡垒标记：在障碍外缘描一圈金色，提示它是堡垒战的胜利目标 */
    private drawFortressMarker(): void {
        const ring = new Node('FortressRing');
        ring.layer = Layers.Enum.UI_2D;
        const g = ring.addComponent(Graphics);
        const hw = this.pixelW / 2 + 6;
        const hh = this.pixelH / 2 + 6;
        g.lineWidth = 4;
        g.strokeColor = new Color(255, 215, 90, 255);
        g.rect(-hw, -hh, hw * 2, hh * 2);
        g.stroke();
        this.node.addChild(ring);
    }

    private redrawHpBar(): void {
        if (!this._hpBarGfx) return;
        const bar = this._hpBarGfx;
        bar.clear();
        const w = this._w >= 2 ? Math.max(this.pixelW, 120) * 0.8 : 84;
        const h = 7;
        const halfH = this.pixelH / 2;
        const bx = -w / 2;
        const by = halfH + 4;
        // 深灰蓝半透圆角槽（v3 深色磨砂）
        bar.fillColor = new Color(24, 36, 54, 230);
        bar.roundRect(bx - 1, by - 1, w + 2, h + 2, 4);
        bar.fill();
        bar.strokeColor = new Color(140, 178, 210, 120);
        bar.lineWidth = 1;
        bar.roundRect(bx - 1, by - 1, w + 2, h + 2, 4);
        bar.stroke();
        bar.strokeColor = new Color(26, 38, 58, 160);
        bar.roundRect(bx, by, w, h, 3);
        bar.stroke();
        const pct = this._maxHp > 0 ? Math.max(0, this._hp / this._maxHp) : 0;
        const fw = Math.max(0, w * pct);
        bar.fillColor = pct > 0.5 ? new Color(110, 172, 122) : (pct > 0.25 ? new Color(206, 184, 104) : new Color(194, 110, 112));
        bar.roundRect(bx, by, fw, h, 3);
        bar.fill();
    }

    public takeDamage(damage: number): void {
        if (this._dead || damage <= 0) return;
        this._hp -= damage;
        if (this._hp < 0) this._hp = 0;
        if (this._hpLabel) {
            this._hpLabel.string = `${this._hp}/${this._maxHp}`;
        }
        this.redrawHpBar();
        this.flashHit();
        if (this._hp <= 0) {
            this.die();
        }
    }

    /** 受击闪烁（贴图路径：红色高亮 0.08s 后还原；Graphics 路径：白色涂装） */
    private flashHit(): void {
        if (this._dead) return;
        if (this._gfx) {
            const g = this._gfx;
            g.fillColor = Color.WHITE;
            g.rect(-this.pixelW / 2 + 4, -this.pixelH / 2 + 4, this.pixelW - 8, this.pixelH - 8);
            g.fill();
            this.scheduleOnce(() => {
                if (this.isValid && this._gfx) {
                    if (this._isTreasure) this.drawChestFallback(this._gfx);
                    else this.drawRock(this._gfx);
                }
            }, 0.08);
            return;
        }
        const sp = this.node.getComponentInChildren(Sprite);
        if (sp) {
            sp.color = new Color(255, 110, 110);
            this.scheduleOnce(() => {
                if (this.isValid && sp.isValid) sp.color = Color.WHITE;
            }, 0.08);
        }
    }

    private die(): void {
        if (this._dead) return;
        this._dead = true;

        const parent = this.node.parent;
        if (parent) {
            EffectManager.playExplosion(parent, this.node.position.clone());
        }

        // 通知 GameManager 清理（同步执行），再销毁节点
        this._eventTarget.emit(Obstacle.EVENT_DESTROYED, this);
        // 统一清理 DoT 覆盖层，避免引用悬空
        this.clearCombatOverlays();
        if (this.node && this.node.isValid) {
            this.node.destroy();
        }
    }

    /** 统一清理 DoT 覆盖层节点并复位相关状态（默认随本体销毁回收，这里显式清理防悬空引用） */
    private clearCombatOverlays(): void {
        if (this._dotNode && this._dotNode.isValid) this._dotNode.destroy();
        this._dotNode = null;
        this._dotFrames = [];
        this._dotAnimIdx = 0;
        this._dotAnimTimer = 0;
        this._dotDps = 0;
        this._dotRemaining = 0;
    }

    /** 施加持续伤害（穿云箭命中障碍）：刷新取高，不叠加 */
    public applyDot(dps: number, duration: number, source?: TowerType): void {
        if (dps <= 0 || duration <= 0 || this._dead) return;
        this._dotDps = Math.max(this._dotDps, dps);
        this._dotRemaining = Math.max(this._dotRemaining, duration);
        if (!this._dotNode && SpriteManager.isReady()) {
            const size = Math.round(Math.min(this.pixelW, this.pixelH) * 0.5);
            // 毒效视觉：与敌人统一，循环播放弓箭塔命中动画（archer_fire_11~15），到期移除，不额外出素材
            const frames = SpriteManager.getArcherHitFrames();
            const dotSf = frames.find((f) => !!f) ?? null;
            if (dotSf) {
                this._dotNode = SpriteManager.setNodeSpriteFitted(this.node, dotSf, size, 'DotOverlay');
                this._dotFrames = frames;
                this._dotAnimIdx = 0;
                this._dotAnimTimer = 0.08;
            } else {
                const n = new Node('DotOverlay');
                n.layer = Layers.Enum.UI_2D;
                this.node.addChild(n);
                const sf = SpriteManager.getEffectFrame('dot_overlay');
                if (sf) {
                    SpriteManager.setNodeSprite(n, sf, size, size);
                } else {
                    const g = n.addComponent(Graphics);
                    g.fillColor = new Color(80, 200, 60, 90);
                    g.circle(0, 0, size * 0.5);
                    g.fill();
                }
                this._dotNode = n;
            }
        }
    }

    /** 障碍持续伤害 DoT 持续扣血（穿云箭挂毒） */
    public update(dt: number): void {
        if (this._dead) return;
        // 暂停时冻结持续伤害（与敌人/塔/子弹一致，避免暂停期间毒伤仍在扣血）
        if (DeveloperData.instance.paused) return;
        const scaledDt = dt * DeveloperData.instance.speedMultiplier;
        if (this._dotRemaining > 0) {
            this._dotRemaining -= scaledDt;
            this.takeDamage(this._dotDps * scaledDt);
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
    }

    public select(): void {
        if (!this._selRing) return;
        const ring = this._selRing;
        ring.clear();
        const half = Math.max(this.pixelW, this.pixelH) / 2 + 6;
        ring.strokeColor = new Color(255, 255, 80);
        ring.lineWidth = 3;
        ring.rect(-half, -half, half * 2, half * 2);
        ring.stroke();
        ring.fillColor = new Color(255, 255, 80, 20);
        ring.rect(-half, -half, half * 2, half * 2);
        ring.fill();
    }

    public deselect(): void {
        if (this._selRing) {
            this._selRing.clear();
        }
    }
}
