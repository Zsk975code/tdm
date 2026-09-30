import { _decorator, Component, Node, Vec3, Color, Graphics, UITransform, Label, EventTarget, Layers } from 'cc';
const { ccclass, property } = _decorator;

import { SpriteManager } from '../Utils/SpriteManager';
import { EffectManager } from '../Utils/EffectManager';
import { applyTextOutline } from '../Utils/UIText';
import { MapManager } from '../Core/MapManager';
import { destroyChildren } from '../Utils/NodeUtil';

@ccclass('Radish')
export class Radish extends Component {
    private static _instance: Radish | null = null;

    public static readonly EVENT_LIVES_CHANGED = 'lives-changed';
    public static readonly EVENT_RADISH_DESTROYED = 'radish-destroyed';

    public static get instance(): Radish {
        return Radish._instance!;
    }

    private _maxHp: number = 10;
    private _hp: number = 10;
    private _hpLabel: Label | null = null;
    private _eventTarget: EventTarget = new EventTarget();

    public get hp(): number {
        return this._hp;
    }

    public get isDead(): boolean {
        return this._hp <= 0;
    }

    public get eventTarget(): EventTarget {
        return this._eventTarget;
    }

    public isAlive(): boolean {
        return this._hp > 0;
    }

    onLoad(): void {
        Radish._instance = this;
    }

    onDestroy(): void {
        if (Radish._instance === this) {
            Radish._instance = null;
        }
    }

    public init(maxHp: number): void {
        this._maxHp = maxHp;
        this._hp = maxHp;
        this.createVisuals();
    }

    private createVisuals(): void {
        destroyChildren(this.node);

        // 与出怪点一致：按格子尺寸显示，保证两者大小匹配
        const mm = MapManager.instance;
        const cellSize = mm ? mm.getCellSize() : 88;

        // ── 萝卜本体：优先使用素材 Sprite，否则回退到 Graphics ──
        const sf = SpriteManager.isReady()
            ? SpriteManager.getUIFrame('radish')
            : null;

        if (sf) {
            SpriteManager.setNodeSprite(this.node, sf, cellSize, cellSize);
        } else {
            const g = this.node.getComponent(Graphics);
            if (!g) {
                this.node.addComponent(Graphics);
            }
            const graphics = this.node.getComponent(Graphics)!;
            graphics.clear();
            const r = cellSize * 0.3;
            graphics.fillColor = new Color(60, 140, 255);
            graphics.circle(0, 0, r);
            graphics.fill();
            graphics.fillColor = new Color(100, 180, 255);
            graphics.circle(0, r * 0.15, r * 0.58);
            graphics.fill();
        }

        const hpLabelNode = new Node('HpLabel');
        hpLabelNode.layer = Layers.Enum.UI_2D;
        hpLabelNode.setPosition(0, -cellSize * 0.55, 0);
        this._hpLabel = hpLabelNode.addComponent(Label);
        this._hpLabel.string = `${this._hp}/${this._maxHp}`;
        this._hpLabel.fontSize = 12;
        this._hpLabel.color = Color.WHITE;
        applyTextOutline(this._hpLabel, 2);
        hpLabelNode.getComponent(UITransform)?.setContentSize(60, 18);
        this.node.addChild(hpLabelNode);
    }

    public takeDamage(damage: number): void {
        if (this._hp <= 0) return;
        this._hp -= damage;
        if (this._hp < 0) this._hp = 0;
        if (this._hpLabel) {
            this._hpLabel.string = `${this._hp}/${this._maxHp}`;
        }
        this._eventTarget.emit(Radish.EVENT_LIVES_CHANGED, this._hp, this._maxHp);

        // B04: 萝卜受伤动画（红色闪烁）
        this.playHurtEffect();

        if (this._hp <= 0) {
            this._eventTarget.emit(Radish.EVENT_RADISH_DESTROYED);
        }
    }

    /** 开发者技能：增加生命上限与当前生命（每次 +amount） */
    public addLife(amount: number): void {
        this._maxHp += amount;
        this._hp += amount;
        if (this._hpLabel) {
            this._hpLabel.string = `${this._hp}/${this._maxHp}`;
        }
        this._eventTarget.emit(Radish.EVENT_LIVES_CHANGED, this._hp, this._maxHp);
    }

    /** B04: 萝卜受伤视觉效果 */
    private playHurtEffect(): void {
        // 红色闪烁
        EffectManager.playRedFlash(this.node);
    }
}