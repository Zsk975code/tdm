import { _decorator, Component, Node, Vec3, Color, Graphics, UITransform, Label, Layers, Sprite, tween, Tween } from 'cc';
const { ccclass, property } = _decorator;

import { TowerType, TowerConfig, TOWER_COLORS, TOWER_CONFIGS, getTowerConfig } from '../Data/TowerData';
import { TOWER_VISUAL_SIZE, COMBAT_SCALE } from '../Data/VisualScale';
import { DeveloperData } from '../Data/DeveloperData';
import { Enemy } from './Enemy';
import { Bullet } from './Bullet';
import { Obstacle } from './Obstacle';
import { CurrencyManager } from '../Core/CurrencyManager';
import { MapManager, CellType } from '../Core/MapManager';
import { SpriteManager } from '../Utils/SpriteManager';
import { EffectManager } from '../Utils/EffectManager';
import { applyTextOutline } from '../Utils/UIText';
import { CodexManager } from '../Utils/CodexManager';
import { destroyChildren } from '../Utils/NodeUtil';

@ccclass('Tower')
export class Tower extends Component {
    private _towerType: TowerType = TowerType.EMITTER;
    private _level: number = 0;
    private _row: number = 0;
    private _col: number = 0;
    private _attackTimer: number = 0;
    private _attackSpeedMult: number = 1.0;

    /** 开发者技能：提升攻速（倍率叠加，作用于 fireRate 分母） */
    public addAttackSpeedBonus(amount: number): void {
        this._attackSpeedMult += amount;
    }
    private _config: TowerConfig | null = null;
    private _target: Node | null = null;
    private _bulletParent: Node | null = null;
    private _rangeCircle: Node | null = null;
    private _auraCircle: Node | null = null;
    private _levelLabel: Label | null = null;
    private _isSelected: boolean = false;
    private _auraMultiplier: number = 1.0;
    private _shotCount: number = 0;
    private _idleTime: number = 0;
    private _faceSprite: Sprite | null = null;     // 太阳塔脸层（随等级取帧 Sun-11/-12/-13）
    private _towerBodySprite: Sprite | null = null; // 塔身 Sprite（XX11，开火时播 XX12/13 攻击动画）
    private _bodyNode: Node | null = null;          // 塔身节点缓存（避免每帧 getChildByName）
    private _auraTimer: number = 0;                 // 光环倍率刷新节流计时
    private _attackPop: number = 0;                 // 攻击时“花瓣外张”强度（0~1，衰减）
    // 特斯拉连续攻击：目标节点 -> 持久电弧光束节点（每帧跟随刷新，目标消失即移除）
    private _teslaBeams: Map<Node, Node> = new Map();
    // 预分配临时向量，避免每帧 getWorldPosition 产生 clone（GC 压力）
    private _tmpWorldTarget: Vec3 = new Vec3();
    private _tmpWorldMine: Vec3 = new Vec3();

    public get towerType(): TowerType {
        return this._towerType;
    }

    public get level(): number {
        return this._level;
    }

    public get config(): TowerConfig | null {
        return this._config;
    }

    public get canUpgrade(): boolean {
        if (!this._towerType) return false;
        const configs = TOWER_CONFIGS[this._towerType];
        return this._level + 1 < configs.length;
    }

    /** 升级后（下一级）的攻击射程；已满级返回 0。用于升级面板悬停预览更大范围 */
    public get nextRange(): number {
        if (!this.canUpgrade) return 0;
        const next = TOWER_CONFIGS[this._towerType][this._level + 1];
        return next ? next.range : 0;
    }

    public get upgradeCost(): number {
        if (!this.canUpgrade) return 0;
        const nextConfig = TOWER_CONFIGS[this._towerType][this._level + 1];
        return nextConfig ? nextConfig.cost : 0;
    }

    public get sellValue(): number {
        let total = 0;
        const configs = TOWER_CONFIGS[this._towerType];
        for (let i = 0; i <= this._level && i < configs.length; i++) {
            total += configs[i].cost;
        }
        return Math.floor(total * 0.8);
    }

    public get auraActive(): boolean {
        return this._config ? (this._config.auraRadius > 0 && this._config.auraDamageBonus > 0) : false;
    }

    public get auraMultiplier(): number {
        return this._auraMultiplier;
    }

    public init(towerType: TowerType, row: number, col: number, bulletParent: Node): void {
        this._towerType = towerType;
        this._row = row;
        this._col = col;
        this._level = 0;
        this._attackTimer = 0;
        this._attackSpeedMult = 1.0;
        this._shotCount = 0;
        this._teslaBeams.clear();
        this._config = getTowerConfig(towerType, 0);
        this._bulletParent = bulletParent;

        // 图鉴：首次建造即解锁该塔
        CodexManager.discover('towers', towerType);

        this.createVisuals();
    }

    private createVisuals(): void {
        // 重建前必须销毁旧子节点：removeAllChildren 只解除父子关系、不销毁节点，
        // 每次升级都会泄漏底座/塔身/脸层/等级标签/射程圈（射程圈还带 Graphics 绘制）。
        destroyChildren(this.node);
        // 清空悬空引用：否则会残留指向已销毁节点的 Sprite。
        // 典型后果：_auraCircle 非 null 导致升级后新光环被跳过（光环视觉消失）。
        this._faceSprite = null;
        this._towerBodySprite = null;
        this._bodyNode = null;
        this._levelLabel = null;
        this._rangeCircle = null;
        this._auraCircle = null;

        // ── 塔身：优先使用素材 Sprite，素材未就绪时回退到 Graphics ──
        const sf = SpriteManager.isReady()
            ? SpriteManager.getTowerFrame(this._towerType, this._level)
            : null;

        if (sf) {
            // 使用美术素材（清理升级前 Graphics 兜底的残留绘制，避免叠加）
            const staleG = this.node.getComponent(Graphics);
            if (staleG) this.node.removeComponent(Graphics);
            // 底座（XX-1X 按等级 1/2/3 底盘逐级变大，静态不旋转）
            const baseSf = SpriteManager.getTowerBaseFrame(this._towerType, this._level);
            if (baseSf) {
                SpriteManager.setNodeSprite(this.node, baseSf, TOWER_VISUAL_SIZE, TOWER_VISUAL_SIZE, 'SpriteBase');
            }
            // 塔身（XX11/XX21/XX31，随目标旋转，置于底座之上）
            const bodyNode = SpriteManager.setNodeSprite(this.node, sf, TOWER_VISUAL_SIZE, TOWER_VISUAL_SIZE, 'Sprite');
            this._towerBodySprite = bodyNode.getComponent(Sprite);
            this._bodyNode = bodyNode;
            // 太阳塔：在光芒圆盘上叠加脸层（Solar -11/-12/-13 = 1/2/3 级脸，随等级取帧）
            if (this._towerType === TowerType.RADIATION) {
                const faceFrames = SpriteManager.getRadiationFaceFrames();
                const face = faceFrames[Math.min(this._level, faceFrames.length - 1)] || faceFrames[0];
                if (face) {
                    const faceNode = SpriteManager.setNodeSprite(this.node, face, TOWER_VISUAL_SIZE, TOWER_VISUAL_SIZE, 'SpriteFace');
                    this._faceSprite = faceNode.getComponent(Sprite)!;
                }
            } else if (this._towerType === TowerType.CONDENSER) {
                // 冷凝塔：在塔身中央叠加月核面（condenser_face_01/02/03 每级 1 帧）
                const faceFrames = SpriteManager.getCondenserFaceFrames();
                const face = faceFrames[Math.min(this._level, faceFrames.length - 1)] || faceFrames[0];
                if (face) {
                    const faceNode = SpriteManager.setNodeSprite(this.node, face, TOWER_VISUAL_SIZE, TOWER_VISUAL_SIZE, 'SpriteFace');
                    this._faceSprite = faceNode.getComponent(Sprite)!;
                }
            }
        } else {
            // 回退：用 Graphics 画彩色方块
            const g = this.node.getComponent(Graphics);
            if (!g) {
                this.node.addComponent(Graphics);
            }
            const graphics = this.node.getComponent(Graphics)!;
            graphics.clear();
            const color = TOWER_COLORS[this._towerType] || Color.WHITE;
            graphics.fillColor = color;
            const half = 15 * COMBAT_SCALE;
            graphics.rect(-half, -half, half * 2, half * 2);
            graphics.fill();
        }

        const levelLabelNode = new Node('LevelLabel');
        levelLabelNode.layer = Layers.Enum.UI_2D;
        levelLabelNode.setPosition(0, 20 * COMBAT_SCALE, 0);
        this._levelLabel = levelLabelNode.addComponent(Label);
        this._levelLabel.string = `Lv${this._level + 1}`;
        this._levelLabel.fontSize = Math.round(10 * COMBAT_SCALE);
        this._levelLabel.color = Color.WHITE;
        applyTextOutline(this._levelLabel, Math.max(2, Math.round(2 * COMBAT_SCALE)));
        (levelLabelNode.getComponent(UITransform) || levelLabelNode.addComponent(UITransform)).setContentSize(40 * COMBAT_SCALE, 16 * COMBAT_SCALE);
        this.node.addChild(levelLabelNode);

        this._rangeCircle = new Node('RangeCircle');
        this._rangeCircle.layer = Layers.Enum.UI_2D;
        const rangeSize = this._config!.range * 2 + 4;
        this._rangeCircle.addComponent(UITransform).setContentSize(rangeSize, rangeSize);
        const rangeG = this._rangeCircle.addComponent(Graphics);
        rangeG.fillColor = new Color(255, 255, 255, 25);
        rangeG.circle(0, 0, this._config!.range);
        rangeG.fill();
        rangeG.strokeColor = new Color(255, 255, 100, 120);
        rangeG.lineWidth = 2;
        rangeG.circle(0, 0, this._config!.range);
        rangeG.stroke();
        this._rangeCircle.active = false;
        this.node.addChild(this._rangeCircle);

        // 三级供能发射器光环视觉
        if (this._config!.auraRadius > 0 && this._config!.auraDamageBonus > 0) {
            if (!this._auraCircle) {
                this._auraCircle = new Node('AuraCircle');
                this._auraCircle.layer = Layers.Enum.UI_2D;
                const auraSize = this._config!.auraRadius * 2 + 4;
                this._auraCircle.addComponent(UITransform).setContentSize(auraSize, auraSize);
                const auraG = this._auraCircle.addComponent(Graphics);
                auraG.fillColor = new Color(100, 255, 255, 15);
                auraG.circle(0, 0, this._config!.auraRadius);
                auraG.fill();
                auraG.strokeColor = new Color(100, 255, 200, 60);
                auraG.lineWidth = 1;
                auraG.circle(0, 0, this._config!.auraRadius);
                auraG.stroke();
                this.node.addChild(this._auraCircle);
            }
        }
    }

    public select(): void {
        this._isSelected = true;
        this.showRange(true);
    }

    public deselect(): void {
        this._isSelected = false;
        this.showRange(false);
    }

    public showRange(show: boolean): void {
        if (this._rangeCircle) {
            this._rangeCircle.active = show;
        }
    }

    public upgrade(): boolean {
        if (!this.canUpgrade) return false;

        const nextLevel = this._level + 1;
        const nextConfig = getTowerConfig(this._towerType, nextLevel);
        if (!nextConfig) return false;

        if (!CurrencyManager.instance?.spendGold(this.upgradeCost)) return false;

        this._level = nextLevel;
        this._config = nextConfig;

        // 升级后等级变化，旧电弧按旧等级渲染，直接清掉让下一帧用新等级重建
        this.clearTeslaBeams();

        // Upgrade flash effect (A07)
        this.playUpgradeFlash();

        this.createVisuals();
        if (this._isSelected) {
            this.showRange(true);
        }
        return true;
    }

    /** Show a brief flash sprite on upgrade */
    private playUpgradeFlash(): void {
        EffectManager.playUpgradeFlash(this.node, new Vec3(0, 0, 0));
    }

    public sell(): void {
        const value = this.sellValue;
        CurrencyManager.instance?.addGold(value);

        this.clearTeslaBeams();

        MapManager.instance?.unregisterTowerNode(this._row, this._col);
        MapManager.instance?.setCellType(this._row, this._col, CellType.TOWER_SPOT);

        const spotNode = MapManager.instance?.getTowerSpotNode(this._row, this._col);
        if (spotNode) {
            spotNode.active = true;
        }

        if (this.node && this.node.isValid) {
            this.node.destroy();
        }
    }

    private findTarget(): void {
        if (!this._bulletParent || !this._config) return;

        const range = this._config.range;
        const pos = this.node.position;

        // 手动标记的障碍物：在射程内时优先集中攻击（"手动点击攻击"）
        const marked = MapManager.instance?.getMarkedObstacleNode();
        if (marked && marked.isValid) {
            const ob = marked.getComponent(Obstacle);
            if (ob && !ob.isDead && Vec3.distance(pos, marked.position) <= range) {
                this._target = marked;
                return;
            }
        }

        let bestTarget: Node | null = null;
        let bestProgress = -1;

        const enemyLayer = this._bulletParent.parent?.getChildByName('EnemyLayer');
        if (!enemyLayer) return;

        // 手动标记的敌人：射程内时无视路径进度，强制优先锁定（再点一次即恢复默认索敌）
        const markedEnemy = MapManager.instance?.getMarkedEnemyNode();
        if (markedEnemy && markedEnemy.isValid) {
            const me = markedEnemy.getComponent(Enemy);
            if (me && !me.isDead && Vec3.distance(pos, markedEnemy.position) <= range) {
                this._target = markedEnemy;
                return;
            }
        }

        for (const child of enemyLayer.children) {
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;
            const dist = Vec3.distance(pos, child.position);
            if (dist <= range) {
                const progress = enemy.pathIndex;
                if (progress > bestProgress) {
                    bestTarget = child;
                    bestProgress = progress;
                }
            }
        }

        this._target = bestTarget;
    }

    private getAuraDamageMultiplier(): number {
        if (!this._config || !this.node || !this.node.isValid) return 1.0;
        const towerLayer = this._bulletParent?.parent?.getChildByName('TowerLayer');
        if (!towerLayer) return 1.0;
        const myPos = this.node.position;
        let maxBonus = 0;
        for (const child of towerLayer.children) {
            if (child === this.node) continue;
            const otherTower = child.getComponent(Tower);
            if (!otherTower || !otherTower.config) continue;
            if (otherTower.config.auraRadius > 0 && otherTower.config.auraDamageBonus > 0) {
                const dist = Vec3.distance(myPos, child.position);
                if (dist <= otherTower.config.auraRadius) {
                    if (otherTower.config.auraDamageBonus > maxBonus) {
                        maxBonus = otherTower.config.auraDamageBonus;
                    }
                }
            }
        }
        return 1.0 + maxBonus;
    }

    private shoot(): void {
        if (this._towerType === TowerType.ARCHER) { this.shootArcher(); return; }
        if (!this._config || !this._bulletParent) return;

        // 光电棱镜塔不需要目标也能射击（直线穿透）
        if (this._towerType !== TowerType.PRISM) {
            if (!this._target || !this._target.isValid) return;
        } else {
            // FAN塔：无目标时找一个方向射击
            if (!this._target || !this._target.isValid) {
                this.findTarget();
                // 如果仍无目标，不射击
                if (!this._target || !this._target.isValid) return;
            }
        }

        // 复用 update() 中 4Hz 节流算好的光环倍率，避免每次开火都遍历整个 TowerLayer
        const auraMult = this._auraMultiplier;
        const finalDamage = Math.round(this._config.damage * auraMult);

        // 瓶子塔/火箭塔/光棱塔从炮口发射：子弹与发射动画都从炮口（塔中心沿瞄准方向偏移）出现
        const muzzleOffset = (this._towerType === TowerType.EMITTER || this._towerType === TowerType.ROCKET || this._towerType === TowerType.PRISM)
            ? this.getMuzzleOffset() : Vec3.ZERO;

        // 普通子弹（N2: 走对象池）
        const bullet = Bullet.spawn(
            this._bulletParent,
            new Vec3(this.node.position.x + muzzleOffset.x, this.node.position.y + muzzleOffset.y, 0),
            'Bullet',
        );
        if (this._towerType === TowerType.PRISM) {
            // 光电棱镜塔：穿透直线子弹，朝目标方向直线飞（不追踪/不弯曲），三级命中后分裂
            const targetPos = this._target!.position;
            const myPos = this.node.position;
            const dir = new Vec3(targetPos.x - myPos.x, targetPos.y - myPos.y, 0);
            const len = dir.length();
            if (len > 0.001) {
                dir.normalize();
            }
            bullet.init(
                this._towerType,
                finalDamage,
                this._config.bulletSpeed,
                this._target, // 仅用于“有目标才射击”判定；方向已按当前目标算好（直线飞，不追踪）
                this._config.slowFactor || 0,
                this._config.slowDuration || 0,
                this._config.aoeRadius || 0,
                this._config.aoeFalloffMin ?? 1.0,
                this._level,     // 塔等级，用于判断是否三级分裂
                false,           // 非子子弹
                dir,             // 发射方向（朝目标直线）
            );
            bullet.setFireContext(this.node.position, this._config.range);
        } else {
            bullet.init(
                this._towerType,
                finalDamage,
                this._config.bulletSpeed,
                this._target,
                this._config.slowFactor || 0,
                this._config.slowDuration || 0,
                this._config.aoeRadius || 0,
                this._config.aoeFalloffMin ?? 1.0,
                this._level,     // 塔等级，用于按等级取子弹素材 P*11/21/31
            );
        }

        // 周期AOE：每N次攻击触发多方向散射
        if (this._config.periodicAoeInterval > 0 && this._config.periodicAoeCount > 0) {
            this._shotCount++;
            if (this._shotCount >= this._config.periodicAoeInterval) {
                this._shotCount = 0;
                this.periodicAoe(finalDamage);
            }
        }

        // 塔中心开火特效：默认不播放（瓶子/火箭/光棱/火炮/凝滞器均与瓶子一致，无塔中心发射动画）
        // 星星塔无塔中心发射帧，开火即发射冲击弹，落点由 Bullet.aoeHit 播 240 爆炸动画
        switch (this._towerType) {
            case TowerType.ROCKET:
                // 火箭塔无塔中心开火特效，炮管转正后直接发射火箭子弹
                break;
            default:
                break;
        }

        // 塔身开火攻击动画（XX11→12→13，有独立攻击帧的塔才播放）
        this.playBodyAttack();
    }

    /** 暮色长弓·多重箭：一次齐射按等级 2/3/5 支独立直线箭（扇形散布，各打首个敌人，非连射） */
    private shootArcher(): void {
        if (!this._config || !this._bulletParent) return;
        const target = this.getArcherPrimaryTarget();
        if (!target) return;

        const auraMult = this._auraMultiplier;
        const finalDamage = Math.round(this._config.damage * auraMult);
        // 三级起按概率整束射出穿云箭：仅中央那支为穿透主箭（2×伤害·2×素材·命中物品挂毒）
        const penetrate = this._level >= 2 && (this._config.penetrateChance ?? 0) > 0
            && Math.random() < (this._config.penetrateChance ?? 0);

        const arrowCount = Math.max(this._config.bulletCount, 1);
        // 扇形总夹角统一 30°，且关于目标方向对称（1 级 2 支 = ±15°），
        // 多重箭散布与弓身开火动画视觉一致。
        const fanDeg = 30;
        const towerPos = this.node.position;
        const baseAng = Math.atan2(target.position.y - towerPos.y, target.position.x - towerPos.x);
        // center 取浮点 (N-1)/2，保证偶数支也对称（如 2 支 = ±15°）。
        const center = (arrowCount - 1) / 2;
        const step = arrowCount > 1 ? fanDeg / (arrowCount - 1) : 0;
        const mainIdx = Math.floor((arrowCount - 1) / 2);

        for (let i = 0; i < arrowCount; i++) {
            const offDeg = (i - center) * step;
            const ang = baseAng + (offDeg * Math.PI) / 180;
            const dir = new Vec3(Math.cos(ang), Math.sin(ang), 0);
            const isMain = penetrate && i === mainIdx;
            const dmg = isMain ? finalDamage * 2 : finalDamage;
            const bullet = Bullet.spawn(this._bulletParent, towerPos.clone(), 'Bullet');
            bullet.init(
                this._towerType,
                dmg,
                this._config!.bulletSpeed,
                null,                  // 直线飞行，不追踪单一目标
                0, 0, 0, 1.0,
                this._level,
                false,
                dir,                  // 扇形中各箭的飞行方向
                this._config!.dotDps ?? 0,
                this._config!.dotDuration ?? 0,
                isMain,               // 仅中央主箭为穿云箭（穿透）
            );
            bullet.setFireContext(towerPos, this._config!.range);
        }

        this.playBodyAttack();
    }

    /** 选取射程内最靠前的敌人作为主目标（多重箭扇形中轴指向它；无则 null） */
    private getArcherPrimaryTarget(): Node | null {
        if (!this._config || !this._bulletParent) return null;
        const range = this._config.range;
        const pos = this.node.position;

        // 手动标记的障碍优先锁定（玩家点障碍时弓箭塔会集火清障）
        const marked = MapManager.instance?.getMarkedObstacleNode();
        if (marked && marked.isValid) {
            const ob = marked.getComponent(Obstacle);
            if (ob && !ob.isDead && Vec3.distance(pos, marked.position) <= range) {
                return marked;
            }
        }

        const enemyLayer = this._bulletParent.parent?.getChildByName('EnemyLayer');
        if (!enemyLayer) return null;
        let best: Node | null = null;
        let bestProgress = -Infinity;
        for (const child of enemyLayer.children) {
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;
            if (Vec3.distance(pos, child.position) > range) continue;
            const progress = enemy.pathIndex;
            if (progress > bestProgress) { bestProgress = progress; best = child; }
        }
        // 手动标记的敌人优先锁定
        const markedEnemy = MapManager.instance?.getMarkedEnemyNode();
        if (markedEnemy && markedEnemy.isValid) {
            const me = markedEnemy.getComponent(Enemy);
            if (me && !me.isDead && Vec3.distance(pos, markedEnemy.position) <= range) return markedEnemy;
        }
        return best;
    }

    /** 塔身开火动画：从待机初始帧 XX11 播到 XX12/XX13，再回到待机帧 */
    private playBodyAttack(): void {
        // 不播塔身攻击帧的塔：火箭(炮管转正直接发射，无开火帧)
        // 光棱炮台接入攻击帧(prism_attack_lvX2/3)：蓄光汇聚→爆发射出，随炮台一起旋转
        // 凝滞器恢复开火动画（便便攻击帧）
        // 火炮保留开火后坐/闪光（artillery_attack_lvX2/3）
        if (this._towerType === TowerType.ROCKET) return;
        if (!this._towerBodySprite || !this._towerBodySprite.isValid) return;
        const frames = SpriteManager.getTowerAttackFrames(this._towerType, this._level);
        if (frames.length < 2 || !frames[1]) return; // 无独立攻击帧的塔（雪/太阳/电塔）跳过
        const sprite = this._towerBodySprite;
        // 清除上一轮残余的待播帧，避免快速连击时帧回调堆积
        sprite.unscheduleAllCallbacks();
        const dur = SpriteManager.playFrameSequence(sprite, frames, 0.06);
        // 播完后回到待机初始帧
        sprite.scheduleOnce(() => {
            if (!sprite.isValid) return;
            const idle = frames[0];
            if (idle) sprite.spriteFrame = idle;
        }, dur);
        // 开火时塔身轻微脉冲（蓄光爆发感），update 中按塔型缩放回落
        this._attackPop = 1;
    }

    private periodicAoe(damage: number): void {
        if (!this._bulletParent || !this._config) return;
        const count = this._config.periodicAoeCount;
        const angleStep = (2 * Math.PI) / count;
        const range = this._config.range;

        // 以当前目标方向为基准均匀散射（塔身不转向，故以此对齐更有意义）
        let baseAngle = 0;
        if (this._target && this._target.isValid) {
            this._target.getWorldPosition(this._tmpWorldTarget);
            this.node.getWorldPosition(this._tmpWorldMine);
            baseAngle = Math.atan2(
                this._tmpWorldTarget.y - this._tmpWorldMine.y,
                this._tmpWorldTarget.x - this._tmpWorldMine.x,
            );
        }

        for (let i = 0; i < count; i++) {
            // 让散射关于目标方向对称：正负交错排列，首发的正方向对准目标
            const offset = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * angleStep;
            const angle = baseAngle + offset;
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);

            const bullet = Bullet.spawn(this._bulletParent, this.node.position, 'PeriodicBolt');
            bullet.initPeriodic(
                this._towerType,
                damage,
                this._config.bulletSpeed,
                dirX,
                dirY,
                range,
                this._config.slowFactor || 0,
                this._config.slowDuration || 0,
            );
        }
    }

    update(dt: number): void {
        if (!this._config) return;
        if (DeveloperData.instance.paused) return;

        // 光环倍率需要遍历整个 TowerLayer，无需每帧重算（塔的增删不频繁）→ 节流到 4Hz
        this._auraTimer += dt;
        if (this._auraTimer >= 0.25) {
            this._auraTimer = 0;
            this._auraMultiplier = this.getAuraDamageMultiplier();
        }

        const scaledDt = dt * DeveloperData.instance.speedMultiplier;
        this._attackTimer += scaledDt;

        // ── 待机呼吸动画：轻微缩放，让静态贴图活起来（不新增素材） ──
        this._idleTime += scaledDt;
        const breathe = 1 + 0.04 * Math.sin(this._idleTime * 3.0);
        // 攻击时底座花瓣向外张开（太阳盘+脸 短暂放大后回落）
        this._attackPop = Math.max(0, this._attackPop - scaledDt * 4);
        // 太阳塔/光棱塔开火时塔身轻微脉冲（蓄光爆发感），逐帧衰减回落
        const popFactor = this._towerType === TowerType.RADIATION ? 0.12
                        : this._towerType === TowerType.CONDENSER ? 0.12
                        : this._towerType === TowerType.PRISM ? 0.10 : 0;
        const eatScale = breathe * (1 + popFactor * this._attackPop);
        if (this._bodyNode && this._bodyNode.isValid) {
            this._bodyNode.setScale(eatScale, eatScale, 1);
        }
        if (this._faceSprite) {
            // 太阳塔脸层随攻击脉冲放大后回落（原误写为未定义的 petalPop，
            // 每帧抛 ReferenceError 中断 update → 开火判定永远走不到 → 辐射塔完全不攻击）
            const faceScale = 1 + 0.18 * this._attackPop;
            this._faceSprite.node.setScale(faceScale, faceScale, 1);
        }
        const fireRate = this._config.fireRate / this._attackSpeedMult;
        if (this._attackTimer >= fireRate) {
            // 保留溢出时间而非清零：清零会丢弃超出 fireRate 的部分，
            // 使实际攻速被帧率拖慢（低帧率下尤为明显）。
            // clamp 上限避免低帧率时累积过多造成单帧连发。
            this._attackTimer = Math.min(this._attackTimer - fireRate, fireRate);
            if (this._config.hitsAllInRange) {
                if (this._config.maxTargets > 0) {
                    this.areaDamageTargeted();
                } else {
                    this.areaDamageAll();
                }
            } else {
                this.findTarget();
                if (this._target) {
                    // 发射前让炮管对准当前目标（瓶子/火箭/火炮/光棱旋转瞄准；凝滞器塔身固定不转）
                    if (!this._config.hitsAllInRange
                        && this._towerType !== TowerType.COAGULATOR) {
                        this.rotateTowardTarget();
                    }
                    this.shoot();
                }
            }
        }

        // 塔身/炮管随目标旋转：瓶子(EMITTER)/火箭(ROCKET)/火炮(ARTILLERY)/光棱(PRISM) 旋转瞄准；
        // 凝滞器(COAGULATOR) 塔身固定不转向
        if (!this._config.hitsAllInRange
            && this._towerType !== TowerType.COAGULATOR) {
            this.rotateTowardTarget();
        }

        // 特斯拉连续电弧：每帧刷新（攻击间隔内也持续显示，表现为连续放电）
        this.refreshTeslaBeams(dt);
    }

    /** 让精灵子节点旋转指向目标 */
    private rotateTowardTarget(): void {
        const spriteNode = (this._bodyNode && this._bodyNode.isValid) ? this._bodyNode : null;
        if (!spriteNode) return;
        // 优先追踪当前锁定的敌人
        if (this._target && this._target.isValid) {
            // 使用世界坐标：塔和目标可能不在同一父节点下，getPosition 是局部坐标会出错
            // 传入 out 参数复用预分配向量，避免每帧 clone
            this._target.getWorldPosition(this._tmpWorldTarget);
            this.node.getWorldPosition(this._tmpWorldMine);
            let aimOffset = 0;
            if (this._towerType === TowerType.EMITTER) {
                // 瓶子塔底座画幅里瓶口朝上（+y 90°），旋转时要减去 90° 才能让瓶口对准目标
                aimOffset = -90;
            } else if (this._towerType === TowerType.ROCKET) {
                // 火箭塔炮管层(rocket_lv)画幅里炮口朝上（+y 90°），旋转时减 90° 让炮口对准目标
                aimOffset = -90;
            } else if (this._towerType === TowerType.ARTILLERY) {
                // 火炮塔炮身画幅里炮口朝上（+y 90°），旋转时减 90° 让炮口对准目标
                aimOffset = -90;
            } else if (this._towerType === TowerType.PRISM) {
                // 光棱炮台画幅里棱镜尖朝上（+y 90°），旋转时减 90° 让棱镜对准目标
                aimOffset = -90;
            } else if (this._towerType === TowerType.ARCHER) {
                // 弓箭塔画幅里弓口朝上（+y 90°），旋转时减 90° 让弓口对准目标
                aimOffset = -90;
            }
            const angle = Math.atan2(
                this._tmpWorldTarget.y - this._tmpWorldMine.y,
                this._tmpWorldTarget.x - this._tmpWorldMine.x,
            ) * (180 / Math.PI);
            spriteNode.angle = angle + aimOffset;
        }
    }

    /** 瓶子塔/火箭塔/光棱塔瓶口（炮口）相对塔中心的偏移，方向指向当前目标（本地坐标） */
    private getMuzzleOffset(): Vec3 {
        const mz = new Vec3();
        if (!this._target || !this._target.isValid) return mz;
        this._target.getWorldPosition(this._tmpWorldTarget);
        this.node.getWorldPosition(this._tmpWorldMine);
        mz.set(
            this._tmpWorldTarget.x - this._tmpWorldMine.x,
            this._tmpWorldTarget.y - this._tmpWorldMine.y,
            0,
        );
        const lenSq = mz.x * mz.x + mz.y * mz.y;
        if (lenSq > 0.0001) {
            const len = Math.sqrt(lenSq);
            // 瓶/火箭炮口在塔盘边缘(30)，光棱水晶炮口略内收(27，与 prism_lv 画幅对齐)
            const muzzleDist = ((this._towerType === TowerType.PRISM) ? 27 : 30) * COMBAT_SCALE;
            mz.x = (mz.x / len) * muzzleDist;
            mz.y = (mz.y / len) * muzzleDist;
        }
        return mz;
    }

    private areaDamageAll(): void {
        if (!this._config || !this._bulletParent) return;

        const auraMult = this._auraMultiplier;
        const finalDamage = Math.round(this._config.damage * auraMult);
        const range = this._config.range;
        const pos = this.node.position;

        const enemyLayer = this._bulletParent.parent?.getChildByName('EnemyLayer');
        if (!enemyLayer) return;

        let hitCount = 0;
        for (const child of enemyLayer.children) {
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;
            const dist = Vec3.distance(pos, child.position);
            if (dist <= range) {
                enemy.takeDamage(finalDamage, this._towerType);
                if (this._config.freezeDuration > 0) {
                    // 雪花塔：定身（完全停止移动），而非减速
                    enemy.applyFreeze(this._config.freezeDuration);
                } else if (this._config.slowFactor > 0 && this._config.slowDuration > 0) {
                    const slowType = this._towerType === TowerType.COAGULATOR ? 'coagulator'
                        : this._towerType === TowerType.PRISM ? 'frost'
                        : this._towerType === TowerType.CONDENSER ? 'condenser' : 'default';
                    enemy.applySlow(this._config.slowFactor, this._config.slowDuration, slowType);
                }
                // 雪花塔用冰霜命中特效，其余（辐射/特斯拉）沿用辐射命中特效
                if (this._towerType === TowerType.SNOW) {
                    EffectManager.playFrostHit(enemy.node, Vec3.ZERO, 44, 44);
                } else if (this._towerType === TowerType.CONDENSER) {
                    // 命中爆点尺寸跟随塔等级数据放大（Lv1=60 / Lv2=72 / Lv3=84），更醒目
                    const hitSize = 48 + (this._level + 1) * 12;
                    EffectManager.playCondenserHit(enemy.node, Vec3.ZERO, hitSize, hitSize);
                } else {
                    const hitSize = 48 + (this._level + 1) * 12;
                    EffectManager.playRadiationHit(enemy.node, Vec3.ZERO, hitSize, hitSize);
                }
                hitCount++;
            }
        }

        // 辐射塔攻击障碍：
        // 有怪时 → 自动范围攻击（波及射程内所有障碍，同打怪属性 + 命中动画）
        // 无怪时 → 需手动点击标记才范围攻击（点哪个，射程内所有障碍都被波及，动画特效齐全）
        let obstacleCount = 0;
        if (hitCount > 0 || this.isMarkedObstacleInRange(pos, range)) {
            obstacleCount = this.damageObstaclesInRange(pos, range, finalDamage);
        }

        // A03: 攻击光环脉冲 + 塔中心攻击动画 + 花瓣外张 —— 命中怪物或障碍都触发
        if (hitCount > 0 || obstacleCount > 0) {
            if (this._towerType === TowerType.SNOW) {
                // 雪花塔：塔中心雪爆（PSnow11-15/21-25/31-35 5帧），size=射程直径，与辐射塔一致覆盖整个攻击范围
                EffectManager.playSnowFire(this.node, Vec3.ZERO, this._level, Math.round(this._config.range * 2));
            } else if (this._towerType === TowerType.CONDENSER) {
                EffectManager.playCondenserBeam(this.node, Vec3.ZERO, this._level, Math.round(this._config.range * 2), this._config.fireRate);
            } else {
                EffectManager.playRadiationBeam(this.node, Vec3.ZERO, this._level, Math.round(this._config.range * 2), this._config.fireRate);
            }
            this._attackPop = 1;
        }
    }

    /** 手动点击标记的障碍是否在攻击范围内 */
    private isMarkedObstacleInRange(pos: Vec3, radius: number): boolean {
        const marked = MapManager.instance?.getMarkedObstacleNode();
        if (!marked || !marked.isValid) return false;
        const ob = marked.getComponent(Obstacle);
        if (!ob || ob.isDead) return false;
        return Vec3.distance(pos, marked.position) <= radius;
    }

    /**
     * 对射程内所有存活障碍物造成伤害（群攻塔攻击怪物时波及），
     * 打障碍时同样播放命中爆炸动画（同打怪）。
     * @returns 命中障碍数
     */
    private damageObstaclesInRange(pos: Vec3, radius: number, damage: number): number {
        const mm = MapManager.instance;
        if (!mm) return 0;
        let count = 0;
        for (const n of mm.getObstacleNodes()) {
            if (!n || !n.isValid) continue;
            const ob = n.getComponent(Obstacle);
            if (!ob || ob.isDead) continue;
            if (Vec3.distance(pos, n.position) <= radius) {
                ob.takeDamage(damage);
                // 攻击障碍也播放命中动画（同打怪）；雪花塔用冰霜命中，其余用辐射命中。
                // 注意：特效挂在障碍的「父节点」（持久地图层）而非障碍节点本身，
                // 否则障碍被这下打死、Obstacle.die() 同步销毁节点时，命中特效会被一并销毁
                // （表现为"打到障碍上命中特效没了"）。障碍不挂减速/定身等 debuff 特效，仅播命中爆点。
                const fxParent = n.parent!;
                const fxPos = n.position.clone();
                if (this._towerType === TowerType.SNOW) {
                    EffectManager.playFrostHit(fxParent, fxPos, 40, 40);
                } else if (this._towerType === TowerType.CONDENSER) {
                    const hitSize = 48 + (this._level + 1) * 12;
                    EffectManager.playCondenserHit(fxParent, fxPos, hitSize, hitSize);
                } else {
                    const hitSize = 48 + (this._level + 1) * 12;
                    EffectManager.playRadiationHit(fxParent, fxPos, hitSize, hitSize);
                }
                count++;
            }
        }
        return count;
    }

    /**
     * 特斯拉目标选取（与 areaDamageTargeted 共用）：返回当前应锁定的目标节点列表，
     * 优先级：①手动标记的障碍（独占）②范围内最靠终点的 N 个敌人 ③手动标记的敌人（强制纳入）
     * ④无怪时点击标记的障碍。数量上限为 maxTargets。
     */
    private collectTeslaTargetNodes(): Node[] {
        if (!this._config || !this._bulletParent) return [];
        const range = this._config.range;
        const pos = this.node.position;
        const maxTargets = Math.max(this._config.maxTargets, 1);
        const mm = MapManager.instance;

        // ① 手动标记的障碍优先（独占攻击，不波及怪物）
        const marked = mm?.getMarkedObstacleNode();
        const markedObstacle = marked && marked.isValid ? marked.getComponent(Obstacle) : null;
        if (markedObstacle && !markedObstacle.isDead && Vec3.distance(pos, marked.position) <= range) {
            return [marked];
        }

        // ② 范围内所有敌人，按路径进度从大到小排序取前 N 个
        const enemyLayer = this._bulletParent.parent?.getChildByName('EnemyLayer');
        const enemies: Node[] = [];
        if (enemyLayer) {
            for (const child of enemyLayer.children) {
                const enemy = child.getComponent(Enemy);
                if (!enemy || enemy.isDead) continue;
                if (Vec3.distance(pos, child.position) <= range) enemies.push(child);
            }
            enemies.sort((a, b) => {
                const ea = a.getComponent(Enemy);
                const eb = b.getComponent(Enemy);
                return (eb ? eb.pathIndex : 0) - (ea ? ea.pathIndex : 0);
            });
        }
        const targets = enemies.slice(0, maxTargets);

        // ③ 手动标记的敌人优先：不论路径进度都纳入（已满则顶掉最末位）
        const markedEnemy = mm?.getMarkedEnemyNode();
        // 手动标记的敌人强制纳入；已在目标列表内则跳过，避免重复
        if (markedEnemy && markedEnemy.isValid && targets.indexOf(markedEnemy) === -1) {
            const me = markedEnemy.getComponent(Enemy);
            if (me && !me.isDead && Vec3.distance(pos, markedEnemy.position) <= range) {
                if (targets.length < maxTargets) targets.push(markedEnemy);
                else targets[targets.length - 1] = markedEnemy; // 已满则顶掉最末位（最低优先级）
            }
        }

        // ④ 无怪时点击标记的障碍也攻击
        if (targets.length === 0 && markedObstacle && !markedObstacle.isDead
            && Vec3.distance(pos, marked.position) <= range) {
            return [marked];
        }
        return targets;
    }

    private areaDamageTargeted(): void {
        if (!this._config || !this._bulletParent) return;

        const auraMult = this._auraMultiplier;
        const baseDamage = Math.round(this._config.damage * auraMult);
        const critChance = this._config.critChance || 0;
        const critMultiplier = this._config.critMultiplier || 1;

        const targets = this.collectTeslaTargetNodes();

        let attackedAny = false;
        for (const node of targets) {
            if (!node || !node.isValid) continue;
            const enemy = node.getComponent(Enemy);
            const ob = node.getComponent(Obstacle);
            if (enemy && !enemy.isDead) {
                let finalDamage = baseDamage;
                if (critChance > 0 && Math.random() < critChance) {
                    finalDamage = Math.round(finalDamage * critMultiplier);
                }
                enemy.takeDamage(finalDamage, this._towerType);
                if (this._config.slowFactor > 0 && this._config.slowDuration > 0) {
                    enemy.applySlow(this._config.slowFactor, this._config.slowDuration);
                }
                // 命中特效挂到目标父节点（持久层），避免目标节点销毁时特效被一起销毁
                EffectManager.playTeslaHit(node.parent!, node.position.clone(), 48, 48);
                attackedAny = true;
            } else if (ob && !ob.isDead) {
                ob.takeDamage(baseDamage);
                // 障碍不挂 debuff 特效，仅播命中爆点；挂父节点避免障碍被摧毁时特效消失
                EffectManager.playTeslaHit(node.parent!, node.position.clone(), 48, 48);
                attackedAny = true;
            }
        }

        // A06: 特斯拉塔中心攻击动画（Ball41-44/51-54/61-64 按等级）——打怪或打障碍都播放
        if (attackedAny) {
            EffectManager.playTeslaFire(this.node, Vec3.ZERO, this._level, 60);
        }
    }

    /**
     * A06（连续攻击）：每帧刷新特斯拉电弧光束。
     * 对当前锁定的每个目标维持一条「持久」电弧（创建后持续刷新朝向/长度以跟随移动目标），
     * 目标离开射程/死亡/不再被锁定时移除对应光束 → 视觉上表现为持续放电，而非攻击间隔里一闪一闪。
     */
    private refreshTeslaBeams(dt: number): void {
        if (this._towerType !== TowerType.TESLA) return;
        // 光束直接挂在塔的父节点下，用局部坐标计算：
        // findTarget 的射程判断就是拿 this.node.position 与 enemy.position 直接比距离，
        // 两者必然处于同一局部空间，无需任何 convertToNodeSpaceAR 世界坐标换算。
        const arcParent = this.node.parent;
        if (!arcParent || !arcParent.isValid) return;

        const from = this.node.position.clone();
        const targets = this.collectTeslaTargetNodes();
        const liveTargets = new Set<Node>();

        for (const node of targets) {
            if (!node || !node.isValid) continue;
            liveTargets.add(node);
            const to = node.position.clone();

            let beam = this._teslaBeams.get(node);
            if (!beam || !beam.isValid) {
                beam = EffectManager.createTeslaBeam(arcParent, from, to, this._level);
                if (beam) this._teslaBeams.set(node, beam);
            }
            if (beam) EffectManager.updateTeslaBeam(beam, from, to, dt);
        }

        // 移除已失效（死亡/离场/不再锁定）目标的光束
        for (const [t, beam] of this._teslaBeams) {
            if (!t || !t.isValid || !liveTargets.has(t)) {
                if (beam && beam.isValid) beam.destroy();
                this._teslaBeams.delete(t);
            }
        }
    }

    /** 清除全部特斯拉电弧光束（出售/升级/销毁时调用，避免残留到下一关） */
    private clearTeslaBeams(): void {
        for (const beam of this._teslaBeams.values()) {
            if (beam && beam.isValid) beam.destroy();
        }
        this._teslaBeams.clear();
    }
}