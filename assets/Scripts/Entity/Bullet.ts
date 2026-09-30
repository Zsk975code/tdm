import { _decorator, Component, Node, Vec3, Color, Graphics, Layers, Sprite, SpriteFrame, tween, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

import { Enemy } from './Enemy';
import { Obstacle } from './Obstacle';
import { TowerType, TOWER_COLORS } from '../Data/TowerData';
import { COMBAT_SCALE } from '../Data/VisualScale';
import { DeveloperData } from '../Data/DeveloperData';
import { SpriteManager } from '../Utils/SpriteManager';
import { EffectManager } from '../Utils/EffectManager';
import { MapManager } from '../Core/MapManager';
import { destroyChildren } from '../Utils/NodeUtil';

@ccclass('Bullet')
export class Bullet extends Component {
    // ── 子弹对象池（N2）：避免高频创建/销毁节点带来的 GC 压力 ──
    private static readonly POOL_MAX = 64;
    private static _pool: Node[] = [];

    // 穿透子弹兜底上限：出界判定之外的双保险，防止方向异常时无限飞行残留
    private static readonly PENETRATE_MAX_TRAVEL = 2400;
    private static readonly PENETRATE_MAX_LIFE = 6;

    /** 从对象池取一个子弹节点（池空时新建）。父节点、位置由调用方决定 */
    public static spawn(parent: Node, pos: Vec3, name: string): Bullet {
        let node: Node | null = null;
        while (this._pool.length > 0) {
            const n = this._pool.pop()!;
            if (n && n.isValid) {
                node = n;
                break;
            }
        }
        if (!node) {
            node = new Node(name);
            node.layer = Layers.Enum.UI_2D;
        } else {
            node.name = name;
            node.removeFromParent();
        }
        node.setPosition(pos);
        parent.addChild(node);
        node.active = true;
        const comp = node.getComponent(Bullet) || node.addComponent(Bullet);
        // 重置回收标志：否则从池中复用的节点会永久无法再次回收
        comp._isRecycled = false;
        // 默认置为存活：万一调用方漏调 init/initPeriodic，子弹仍会走超时/出界兜底回收，
        // 而不会因 _isAlive 残留 false 而静止滞留在场上
        comp._isAlive = true;
        return comp;
    }

    /** 关卡切换时清空对象池：销毁池中节点，杜绝跨关卡残留与失效引用 */
    public static clearPool(): void {
        while (this._pool.length > 0) {
            const n = this._pool.pop();
            if (n && n.isValid) n.destroy();
        }
    }

    private target: Node | null = null;
    private damage: number = 0;
    private speed: number = 300;
    private towerType: TowerType = TowerType.EMITTER;
    private slowFactor: number = 0;
    private slowDuration: number = 0;
    private aoeRadius: number = 0;
    private aoeFalloffMin: number = 1.0;
    private direction: Vec3 = new Vec3();
    private _isAlive: boolean = true;
    private _isPeriodic: boolean = false;
    // 子弹飞行逐帧动画（瓶子/凝滞器每级 2 帧，飞行中循环切换）
    private _bulletSpriteNode: Node | null = null;
    private _bulletAniFrames: (SpriteFrame | null)[] = [];
    private _bulletAniIdx: number = 0;
    private _bulletAniTimer: number = 0;
    private _maxTravel: number = 0;
    private _traveled: number = 0;
    private _lifeTime: number = 0;
    // 回收标志：必须与 _isAlive 解耦。
    // 若用 _isAlive 兼作 removeSelf 的防重入守卫，hit() 先置 _isAlive=false 后
    // 再调 removeSelf() 会被守卫直接拦截 → 命中的子弹永远不回池也不销毁 → 残留场上。
    private _isRecycled: boolean = false;

    // 穿透模式（光电棱镜塔、火箭塔用，走直线 + checkPenetrateHit 碰撞）
    private _penetrate: boolean = false;
    // 命中敌人后即消失（光棱主子弹/碎片用；火箭穿透不消失）
    private _disappearOnHit: boolean = false;
    // 三级分裂能力
    private _canSplit: boolean = false;
    // 主子弹已折射分裂过（保证只分裂一次，避免穿透多个敌人时指数级分裂）
    private _splitDone: boolean = false;
    // 是否命中过任意敌人（棱镜：区分“主动撞障碍消失”与“打怪误伤建筑不消失”）
    private _hasHitEnemy: boolean = false;
    // 标记为分裂子子弹（不可再分裂）
    private _isSplitChild: boolean = false;
    // 塔等级（用于按等级取材投射物帧 P*11/21/31）
    private _towerLevel: number = 0;
    // 子弹自转角速度（度/秒）：仅光棱/火炮子弹以自身中心旋转，0 表示不自转
    private _spinSpeed: number = 0;
    // 已命中敌人uuid集合（防止穿透时重复命中）
    private _hitEnemyUuids: string[] = [];
    // 上一帧位置（穿透模式用于线段-圆碰撞，避免高速隧穿漏判）
    private _prevPos: Vec3 = new Vec3();
    // 发射塔位置与射程（限制追踪/重新索敌范围，避免子弹飞出塔射程打怪）
    private _originPos: Vec3 = new Vec3();
    private _fireRange: number = 0;
    // 持续伤害（暮色长弓）：命中施加的 DoT 参数
    private _dotDps: number = 0;
    private _dotDuration: number = 0;
    private _isPenetrate: boolean = false;

    public get isAlive(): boolean {
        return this._isAlive;
    }

    public init(
        towerType: TowerType,
        damage: number,
        speed: number,
        target: Node | null,
        slowFactor: number = 0,
        slowDuration: number = 0,
        aoeRadius: number = 0,
        aoeFalloffMin: number = 1.0,
        towerLevel: number = 0,
        isSplitChild: boolean = false,
        splitDir: Vec3 | null = null,
        dotDps: number = 0,
        dotDuration: number = 0,
        isPenetrate: boolean = false,
    ): void {
        this.towerType = towerType;
        this.damage = damage;
        this.speed = speed;
        this.target = target;
        this.slowFactor = slowFactor;
        this.slowDuration = slowDuration;
        this.aoeRadius = aoeRadius;
        this.aoeFalloffMin = aoeFalloffMin;
        this._isAlive = true;
        this._isRecycled = false;
        this._isSplitChild = isSplitChild;
        this._towerLevel = towerLevel;
        this._hitEnemyUuids = [];
        // 重置模式字段，防止对象池复用时属性残留（N1）
        this._isPeriodic = false;
        this._penetrate = false;
        this._disappearOnHit = false;
        this._canSplit = false;
        this._splitDone = false;
        this._hasHitEnemy = false;
        this._maxTravel = 0;
        this._traveled = 0;
        this._dotDps = dotDps;
        this._dotDuration = dotDuration;
        this._isPenetrate = isPenetrate;
        this.node.setScale(1, 1);
        // 俯视视角：光棱(冰风扇)/瓶子/凝滞器/火箭子弹均不自转，仅火炮(星星)弹保留自转
        this._spinSpeed = (towerType === TowerType.ARTILLERY) ? 420 : 0;
        this._lifeTime = 0;

        // 光电棱镜塔：直线（不追踪）子弹，命中首个敌人后「折射」分裂（仅三级），主弹不消失、继续直线穿透
        if (towerType === TowerType.PRISM) {
            this._penetrate = true;   // 走直线 + checkPenetrateHit 碰撞
            // 只有三级（level=2）且非子子弹时具备「折射」分裂能力
            this._canSplit = (towerLevel >= 2) && !isSplitChild;
            // 所有棱镜子弹（主弹 / 分裂碎片 / 一二级）均沿直线穿透，命中不消失，仅飞出场地才回收
            this._disappearOnHit = false;
            // 主弹命中首个敌人后折射分裂一次（_splitDone 保证只分裂一次），随后继续直线穿透
            this._splitDone = false;

            if (splitDir) {
                this.direction = splitDir.clone();   // 分裂子子弹沿用随机方向
            } else if (target && target.isValid) {
                const dir = new Vec3();
                Vec3.subtract(dir, target.position, this.node.position);
                const len = dir.length();
                if (len > 0.001) {
                    this.direction = dir.normalize();
                } else {
                    this.direction = new Vec3(1, 0, 0);
                }
            } else {
                this.direction = new Vec3(1, 0, 0);
            }
        } else if (towerType === TowerType.COAGULATOR) {
            // 凝滞塔（便便）子弹：追踪目标，需朝飞行方向旋转贴图
            if (target && target.isValid) {
                const dir = new Vec3();
                Vec3.subtract(dir, target.position, this.node.position);
                const len = dir.length();
                this.direction = len > 0.001 ? dir.normalize() : new Vec3(1, 0, 0);
            } else {
                this.direction = new Vec3(1, 0, 0);
            }
        } else if (towerType === TowerType.ROCKET) {
            // 火箭塔：直线发射（不追踪），穿透飞行，遇到目标/障碍时溅射（不消散）
            this._penetrate = true;
            if (splitDir) {
                this.direction = splitDir.clone();
            } else if (target && target.isValid) {
                const dir = new Vec3();
                Vec3.subtract(dir, target.position, this.node.position);
                const len = dir.length();
                this.direction = len > 0.001 ? dir.normalize() : new Vec3(1, 0, 0);
            } else {
                this.direction = new Vec3(1, 0, 0);
            }
        } else if (towerType === TowerType.ARCHER) {
            // 暮色长弓·多重箭：N 支独立直线箭呈扇形飞出（不追踪），每支命中首个敌人即消失（伪群攻），
            // 会被路径上的单位/障碍阻挡；穿云箭为穿透主箭（2×伤害·2×素材·命中物品挂毒）
            this._penetrate = true;                 // 走直线 + checkPenetrateHit 碰撞
            this._disappearOnHit = !isPenetrate;     // 普通箭命中即消失；穿云箭穿透
            if (splitDir) {
                this.direction = splitDir.clone();  // 扇形中各箭的飞行方向由发射方给定
            } else if (target && target.isValid) {
                const dir = new Vec3();
                Vec3.subtract(dir, target.position, this.node.position);
                const len = dir.length();
                this.direction = len > 0.001 ? dir.normalize() : new Vec3(1, 0, 0);
            } else {
                this.direction = new Vec3(1, 0, 0);
            }
        }

        this.createVisuals();
        this.rotateToDirection();
    }

    public initPeriodic(
        towerType: TowerType,
        damage: number,
        speed: number,
        dirX: number,
        dirY: number,
        range: number,
        slowFactor: number = 0,
        slowDuration: number = 0,
    ): void {
        this.towerType = towerType;
        this.damage = damage;
        this.speed = speed;
        this.target = null;
        this.slowFactor = slowFactor;
        this.slowDuration = slowDuration;
        this.aoeRadius = 0;
        this._isAlive = true;
        this._isRecycled = false;
        this._isPeriodic = true;
        this._maxTravel = range;
        this._traveled = 0;
        this._lifeTime = 0;
        // 重置模式字段，防止对象池复用时属性残留（N1）
        this._penetrate = false;
        this._disappearOnHit = false;
        this._canSplit = false;
        this._splitDone = false;
        this._hasHitEnemy = false;
        this._isSplitChild = false;
        this._hitEnemyUuids = [];

        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        this.direction = new Vec3(dirX / len, dirY / len, 0);

        this.createVisuals();
        this.rotateToDirection();
    }

    private createVisuals(): void {
        // 子弹走对象池复用：每次复用都会重建视觉，必须"销毁"旧子节点，
        // removeAllChildren 只脱离不销毁 → 高频复用下持续泄漏孤儿节点
        destroyChildren(this.node);

        // ── 子弹：优先使用素材 Sprite，否则回退到 Graphics ──
        this._bulletSpriteNode = null;
        this._bulletAniFrames = [];
        this._bulletAniIdx = 0;
        this._bulletAniTimer = 0;

        const frames = SpriteManager.isReady()
            ? SpriteManager.getBulletFrames(this.towerType, this._towerLevel, this._isSplitChild)
            : [];
        const sf = frames.length > 0 ? frames[0] : null;

        if (sf) {
            // 清除对象池复用/早期兜底残留的 Graphics 绘制，避免与贴图叠加
            const staleG = this.node.getComponent(Graphics);
            if (staleG) this.node.removeComponent(Graphics);
            // 按内容包围盒适配：贴图含大量透明 padding，
            // 直接铺满画布会让弹体视觉尺寸缩水到几像素（rocket 尤其明显）
            this._bulletSpriteNode = SpriteManager.setNodeSpriteFitted(this.node, sf, this.getVisualContentSize());
            if (frames.length > 1) {
                this._bulletAniFrames = frames;
                this._bulletAniIdx = 0;
                this._bulletAniTimer = 0;
            }
        } else {
            // 无素材兜底：必须确保 Graphics 存在（对象池新建节点未挂 Graphics，
            // 且上一次走贴图分支时 Graphics 已被移除），否则子弹会不可见
            const r = this._isSplitChild ? 2 : (this.aoeRadius > 0 ? 4 : 3);
            let g = this.node.getComponent(Graphics);
            if (!g) g = this.node.addComponent(Graphics);
            g.clear();
            g.fillColor = TOWER_COLORS[this.towerType] || Color.WHITE;
            g.circle(0, 0, r);
            g.fill();
        }
        // 穿云箭素材放大 2 倍（与普通毒箭区分）
        this.node.setScale(this._isPenetrate ? 2 : 1, this._isPenetrate ? 2 : 1);
    }

    /**
     * 按塔类型选择子弹的**内容长边**显示尺寸（像素）。
     * 这里指的是去掉透明 padding 后的实际图形大小，画布尺寸由
     * SpriteManager.setNodeSpriteFitted 按包围盒反算，保持素材原始宽高比。
     */
    private getVisualContentSize(): number {
        // 随塔身统一放大（COMBAT_SCALE），保证子弹与放大后的塔协调
        return this.getBaseVisualContentSize() * COMBAT_SCALE;
    }

    /** 原始（缩放前）内容长边尺寸 */
    private getBaseVisualContentSize(): number {
        switch (this.towerType) {
            case TowerType.PRISM:
                // 光电棱镜塔（冰风扇）：分裂子子弹为小火花，明显小于主弹体
                return this._isSplitChild ? 14 : 26;
            case TowerType.ARTILLERY:
                // 火炮（星星）弹体
                return 24;
            case TowerType.ROCKET: {
                // 火箭弹复用 rocket_fire_{tens}1（内容长边随等级 66/72/78）。
                // 不用硬编码：硬编码值一旦与素材不符（且 _towerLevel 为 0 基）会让某级子弹异常偏小。
                // 与发射器/雪花塔一致，直接取该素材实测内容长边。
                const lv = Math.min(this._towerLevel, 2) + 1;
                return SpriteManager.getContentLongEdge(`Art/Effects/rocket_fire_${lv}1`);
            }
            case TowerType.EMITTER: {
                // 发射器：竖直等离子弹，长边为高度。按等级取该等级首帧内容长边。
                const lv = Math.min(this._towerLevel, 2) + 1;
                return SpriteManager.getContentLongEdge(`Art/Bullets/emitter_${lv}1`);
            }
            case TowerType.SNOW:
                // 雪花塔：细长横带弹体，长边为宽度（约 1 格宽，不宜超出过多）
                return 62;
            case TowerType.TESLA:
                return 26;
            case TowerType.RADIATION:
                return 34;
            case TowerType.COAGULATOR:
                // 凝固剂：瘦长竖条，长边为高度
                return 28;
            case TowerType.ARCHER:
                // 暮色长弓：单支毒箭弹体（多重箭由发射逻辑一次生成 N 支）
                return 22;
            default:
                return 28;
        }
    }

    /** 让子弹贴图朝飞行方向旋转 */
    private rotateToDirection(): void {
        const d = this.direction;
        const len = d.x * d.x + d.y * d.y;
        if (len < 0.0001) return;
        if (this.towerType === TowerType.ARCHER) {
            // 弓箭塔箭矢素材默认"上边为前向"，按飞行角度旋转定向（与瓶子/凝滞器/火箭/光棱一致）
            const theta = Math.atan2(d.y, d.x) * (180 / Math.PI); // 世界角（Cocos y 向上）：东=0,北=90,西=180,南=-90/270
            this.node.angle = theta - 90;
            return;
        }
        // 火炮(星星)子弹以自身中心自转，不随飞行方向定向，交给 update 自转处理
        if (this.towerType === TowerType.ARTILLERY) {
            return;
        }
        // 瓶子/凝滞器/火箭/光棱：素材默认"上边为前向"，减 90° 让头部指向飞行方向
        // （便便子弹 coagulator 同为竖置上向素材，此前未减 90° 导致飞行方向反向）
        // 光棱棱镜弹以此一次性朝向飞行方向（不持续自转），呈现"分裂一枚棱镜飞出去"
        // 火箭 Lv1 用真火箭弹图(rocket_11)，Lv2/Lv3 用火光帧(rocket_fire_21/31)，
        // 二者前向均为"上边朝前"，故统一 -90 让弹头/火光/棱镜尖端朝飞行方向
        // 瓶子/凝滞器/火箭/光棱：素材默认"上边为前向"，减 90° 让头部/尖端指向飞行方向（与发射器一致）
        const aimOffset = (this.towerType === TowerType.EMITTER
            || this.towerType === TowerType.COAGULATOR
            || this.towerType === TowerType.ROCKET
            || this.towerType === TowerType.PRISM
            || this.towerType === TowerType.ARCHER) ? -90 : 0;
        this.node.angle = Math.atan2(d.y, d.x) * (180 / Math.PI) + aimOffset;
    }

    /** 给子弹精灵染色（分裂碎片按色相区分，让多弹头可辨） */
    public setTint(c: Color): void {
        if (this._bulletSpriteNode && this._bulletSpriteNode.isValid) {
            const sp = this._bulletSpriteNode.getComponent(Sprite);
            if (sp) sp.color = c.clone();
        }
    }

    update(dt: number): void {
        if (!this._isAlive) return;
        if (DeveloperData.instance.paused) return;

        const scaledDt = dt * DeveloperData.instance.speedMultiplier;

        // 子弹自转：仅火炮(星星)以自身中心持续旋转（光棱等俯视弹体不自转）
        if (this._spinSpeed !== 0) {
            this.node.angle += this._spinSpeed * scaledDt;
        }

        // 子弹飞行逐帧切换（瓶子/凝滞器每级 2 帧，形成飞行呼吸感）
        if (this._bulletAniFrames.length > 1 && this._bulletSpriteNode && this._bulletSpriteNode.isValid) {
            this._bulletAniTimer -= scaledDt;
            if (this._bulletAniTimer <= 0) {
                this._bulletAniTimer = 0.09;
                this._bulletAniIdx = (this._bulletAniIdx + 1) % this._bulletAniFrames.length;
                const sp = this._bulletSpriteNode.getComponent(Sprite);
                if (sp) sp.spriteFrame = this._bulletAniFrames[this._bulletAniIdx];
            }
        }

        // 穿透模式：直线飞行 + 碰撞检测（不追踪目标）
        if (this._penetrate) {
            // 棱镜主子弹：正向上直线飞行，命中即分裂（不追踪目标，避免偏离“正向上”）
            const moveDist = this.speed * scaledDt;
            this._traveled += moveDist;
            this._lifeTime += scaledDt;
            this._prevPos.set(this.node.position);
            this.node.setPosition(
                this.node.position.x + this.direction.x * moveDist,
                this.node.position.y + this.direction.y * moveDist,
                0,
            );

            this.checkPenetrateHit();

            // 兜底：出界 / 超出行程 / 超时，一律回收，杜绝穿透子弹（含分裂子子弹）无限飞行残留
            const outOfBounds = Math.abs(this.node.position.x) > 2000 || Math.abs(this.node.position.y) > 2000;
            if (outOfBounds
                || this._traveled > Bullet.PENETRATE_MAX_TRAVEL
                || this._lifeTime > Bullet.PENETRATE_MAX_LIFE) {
                this.removeSelf();
            }
            return;
        }

        // 周期散射模式
        if (this._isPeriodic) {
            const moveDist = this.speed * scaledDt;
            this._traveled += moveDist;
            this.node.setPosition(
                this.node.position.x + this.direction.x * moveDist,
                this.node.position.y + this.direction.y * moveDist,
                0,
            );

            this.checkPeriodicHit();

            if (this._traveled >= this._maxTravel) {
                this.removeSelf();
            }
            return;
        }

        // 普通追踪模式（每帧避免临时对象分配）
        if (this.target && this.target.isValid) {
            const targetPos = this.target.position;
            const currentPos = this.node.position;
            const dx = targetPos.x - currentPos.x;
            const dy = targetPos.y - currentPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 10) {
                this.hit();
                return;
            }

            this.direction.x = dx / dist;
            this.direction.y = dy / dist;
            this.direction.z = 0;
            this.rotateToDirection();
        } else if (this.target) {
            // 目标在命中前已消亡：子弹无处可击，立即消散，避免遗留
            this.removeSelf();
            return;
        }

        // 追踪弹保险：超过安全飞行时间仍未命中则强制消散，杜绝子弹遗留
        this._lifeTime += scaledDt;
        if (this._lifeTime > 2.0) {
            this.removeSelf();
            return;
        }

        this.node.setPosition(
            this.node.position.x + this.direction.x * this.speed * scaledDt,
            this.node.position.y + this.direction.y * this.speed * scaledDt,
            0,
        );

        if (Math.abs(this.node.position.x) > 2000 || Math.abs(this.node.position.y) > 2000) {
            this.removeSelf();
        }
    }

    /** 记录发射塔位置与射程（光棱主子弹用于限制追踪/重新索敌不超出塔范围） */
    public setFireContext(origin: Vec3, range: number): void {
        this._originPos.set(origin.x, origin.y, 0);
        this._fireRange = range;
    }

    // 重新锁定最近的存活敌人（仅限塔射程内，避免子弹飞出范围去追远处怪）
    private findNearestEnemy(): Node | null {
        const parent = this.node.parent;
        const enemyLayer = parent?.parent?.getChildByName('EnemyLayer');
        if (!enemyLayer) return null;
        let best: Node | null = null;
        let bestDist = Infinity;
        const pos = this.node.position;
        for (const child of enemyLayer.children) {
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;
            // 仅锁定塔射程内的敌人
            if (Vec3.distance(this._originPos, child.position) > this._fireRange) continue;
            const dist = Vec3.distance(pos, child.position);
            if (dist < bestDist) {
                bestDist = dist;
                best = child;
            }
        }
        return best;
    }

    // 点到线段距离（用于穿透子弹的线段-圆碰撞，防高速隧穿漏判）
    private segDistToPoint(p: Vec3, a: Vec3, b: Vec3): number {
        const abx = b.x - a.x, aby = b.y - a.y;
        const apx = p.x - a.x, apy = p.y - a.y;
        const ab2 = abx * abx + aby * aby;
        let t = ab2 > 1e-8 ? (apx * abx + apy * aby) / ab2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const cx = a.x + abx * t, cy = a.y + aby * t;
        const dx = p.x - cx, dy = p.y - cy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 穿透子弹碰撞检测：命中敌人但不销毁自身
    private checkPenetrateHit(): void {
        if (!this._isAlive) return;
        const pos = this.node.position;
        const parent = this.node.parent;
        if (!parent) return;

        const enemyLayer = parent.parent?.getChildByName('EnemyLayer');
        if (!enemyLayer) return;

        for (const child of enemyLayer.children) {
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;

            // 跳过已命中的敌人
            const uuid = child.uuid;
            if (this._hitEnemyUuids.indexOf(uuid) >= 0) continue;

            // 线段-圆碰撞：用上一帧→当前帧的线段，避免高速子弹隧穿漏判
            const dist = this.segDistToPoint(child.position, this._prevPos, pos);
            // 命中判定随怪物体型（hitRadius）走：怪变大、判定点同步增大，更易命中
            const hitRadius = enemy ? enemy.hitRadius : 20;
            if (dist <= hitRadius) {
                // 跳过已处理过的敌人
                this._hitEnemyUuids.push(uuid);

                if (this.aoeRadius > 0) {
                    // 火箭（溅射穿透）：触发溅射伤害，不消散，继续沿直线飞
                    this.aoeHit();
                    // 标记已命中敌人：之后若误伤建筑则视为附带穿透（与棱镜塔一致）
                    this._hasHitEnemy = true;
                    continue;
                }

                // 棱镜 / 暮色长弓：命中特效 + 单体伤害 + 持续伤害 + 减速 + （三级折射）分裂
                this.playHitEffect(child);
                enemy.takeDamage(this.damage, this.towerType);
                if (this._dotDps > 0) enemy.applyDot(this._dotDps, this._dotDuration, this.towerType);
                this._hasHitEnemy = true;   // 标记已命中敌人（棱镜用于障碍判定）
                if (this.slowFactor > 0 && this.slowDuration > 0) {
                    enemy.applySlow(this.slowFactor, this.slowDuration, this.towerType === 'coagulator' ? 'coagulator' : this.towerType === 'prism' ? 'frost' : 'default');
                }
                if (this._canSplit && !this._splitDone) {
                    this.spawnSplit(enemy, 1);
                    this._splitDone = true;
                }
                // 棱镜子弹（主弹 / 碎片 / 一二级）命中后均不消失，继续沿直线飞（飞出场地才回收）
                if (this._disappearOnHit) {
                    this.removeSelf();
                    break;
                }
            }
        }

        // 障碍处理
        const mm = MapManager.instance;
        if (mm) {
            for (const n of mm.getObstacleNodes()) {
                if (!n || !n.isValid) continue;
                const ob = n.getComponent(Obstacle);
                if (!ob || ob.isDead) continue;
                if (Vec3.distance(pos, n.position) <= 20) {
                    if (this.aoeRadius > 0) {
                        // 火箭：碰到障碍即溅射
                        if (this._hitEnemyUuids.indexOf(n.uuid) >= 0) continue;
                        this._hitEnemyUuids.push(n.uuid);
                        this.aoeHit();
                        // 主动打障碍（尚未命中任何敌人）→ 爆炸后不穿透、消散；
                        // 打怪时误伤建筑（已命中敌人）→ 视为附带、穿透，与棱镜塔一致
                        if (!this._hasHitEnemy) {
                            this.removeSelf();
                            break;
                        }
                    } else {
                        // 棱镜：撞到障碍造成伤害；
                        // 主弹：仅“主动”撞障碍（尚未命中过任何敌人）才消失；打怪误伤建筑则视为附带、穿透；
                        // 分裂碎片：一律穿透、不消失（无论主动撞墙还是擦墙）
                        // 穿云箭：穿透障碍，伤害同时挂毒，不消散
                        ob.takeDamage(this.damage);
                        if (this._isPenetrate) {
                            ob.applyDot(this._dotDps, this._dotDuration, this.towerType);
                        } else if (!this._hasHitEnemy && !this._isSplitChild) {
                            this.removeSelf();
                        }
                    }
                    break;
                }
            }
        }
    }

    /**
     * 命中分裂：在命中敌人处朝主弹飞行方向 ±15° 扇形内随机射出 splitCount 枚子弹。
     * 通用机制，可被后续“子母弹塔”等复用：子子弹继承母子弹的塔型/伤害/减速，
     * 并标记 isSplitChild 阻止二次分裂，避免指数爆炸。
     */
    private spawnSplit(hitEnemy: Enemy, splitCount: number = 2): void {
        const parent = this.node.parent;
        if (!parent) return;

        const splitDamage = Math.round(this.damage * 0.5);
        const ex = hitEnemy.node.position.x;
        const ey = hitEnemy.node.position.y;
        // 在敌人命中半径外生成：offset=半径+余量，否则碎片落在敌人圈内会当帧被同一敌人秒吞
        const hitR = (hitEnemy && hitEnemy.hitRadius) ? hitEnemy.hitRadius : 20;
        const offset = hitR + 18;
        const srcUuid = hitEnemy.node.uuid;            // 源敌人，避免碎片立刻回头命中它
        // 两枚碎片用冷色区分（青/蓝），呼应棱镜光谱身份
        const hues = [new Color(120, 230, 255), new Color(130, 170, 255)];

        for (let i = 0; i < splitCount; i++) {
            // 沿主弹飞行方向 ±15° 扇形内随机折射（不再是全随机），碎片更可能继续打同道敌人
            const baseAng = Math.atan2(this.direction.y, this.direction.x);
            const spread = (15 * Math.PI) / 180;
            const ang = baseAng + (Math.random() * 2 - 1) * spread;
            const dir = new Vec3(Math.cos(ang), Math.sin(ang), 0);
            const spawnPos = new Vec3(ex + dir.x * offset, ey + dir.y * offset, 0);
            const bullet = Bullet.spawn(parent, spawnPos, 'SplitBullet');
            bullet.init(
                this.towerType,            // 继承塔型（棱镜 / 后续子母弹）
                splitDamage,
                this.speed * 0.8,
                null, // 无目标，直线飞行
                this.slowFactor,
                this.slowDuration,
                0,
                1.0,
                this._towerLevel,
                true,    // 标记为子子弹，不再分裂
                dir,     // ±15° 扇形折射方向飞行
            );
            // 排除源敌人：碎片不会立刻回头打同一敌人，能真正散开去打其他敌人
            bullet._hitEnemyUuids = [srcUuid];
            bullet.setTint(hues[i % hues.length]);
        }
    }

    /** 通用命中特效：按子弹塔型播放命中爆点（P*01-02 挂在敌人身上） */
    private playHitEffect(hitNode: Node): void {
        switch (this.towerType) {
            case TowerType.EMITTER:
                EffectManager.playEmitterHit(hitNode, Vec3.ZERO);
                break;
            case TowerType.PRISM:
                EffectManager.playPrismHit(hitNode, Vec3.ZERO);
                break;
            case TowerType.ARTILLERY:
                EffectManager.playArtilleryHit(hitNode, Vec3.ZERO);
                break;
            case TowerType.COAGULATOR:
                EffectManager.playCoagulatorHit(hitNode, Vec3.ZERO);
                break;
            case TowerType.ARCHER:
                EffectManager.playArcherHit(hitNode, Vec3.ZERO, this.direction);
                break;
            default:
                break;
        }
    }

    private hit(): void {
        if (!this._isAlive) return;
        this._isAlive = false;

        if (this.aoeRadius > 0) {
            this.aoeHit();
        } else if (this.target && this.target.isValid) {
            this.singleHit();
        }

        this.removeSelf();
    }

    private singleHit(): void {
        if (!this.target || !this.target.isValid) return;
        const enemy = this.target.getComponent(Enemy);
        if (enemy && !enemy.isDead) {
            this.playHitEffect(this.target);
            enemy.takeDamage(this.damage, this.towerType);
            if (this._dotDps > 0) enemy.applyDot(this._dotDps, this._dotDuration, this.towerType);
            if (this.slowFactor > 0 && this.slowDuration > 0) {
                enemy.applySlow(this.slowFactor, this.slowDuration, this.towerType === 'coagulator' ? 'coagulator' : this.towerType === 'prism' ? 'frost' : 'default');
            }
        }
        // 障碍物：被手动标记攻击时承受伤害
        const obstacle = this.target.getComponent(Obstacle);
        if (obstacle && !obstacle.isDead) {
            obstacle.takeDamage(this.damage);
        }
    }

    private aoeHit(): void {
        const pos = this.node.position;
        const parent = this.node.parent;
        if (!parent) return;

        const enemyLayer = parent.parent?.getChildByName('EnemyLayer');
        if (!enemyLayer) return;

        // Spawn explosion effect at hit position (A02)
        if (this.towerType === TowerType.ARTILLERY) {
            EffectManager.playArtilleryExplosion(parent, pos, 120);
        } else {
            this.spawnExplosion(pos, parent);
        }

        for (const child of enemyLayer.children) {
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;
            const dist = Vec3.distance(pos, child.position);
            if (dist <= this.aoeRadius) {
                if (this.towerType === TowerType.ARTILLERY) {
                    // 火炮：命中爆点挂在子弹层（与落点大爆炸同层，且后于爆炸创建→渲染在其之上），
                    // 否则会被 120px 的落点爆炸盖住，看不到命中反馈。
                    // ⚠️ 必须用与落点相同的坐标空间（= 子弹层局部坐标，此处 child.position 与落点 pos 同一空间）。
                    //    早期误用 child.getWorldPosition()：画布带缩放/偏移时世界坐标 ≠ 局部坐标，
                    //    会把爆点整体推偏（越靠外越偏，表现为"死亡后右上角一堆爆炸"）。
                    EffectManager.playArtilleryHit(parent, new Vec3(child.position.x, child.position.y, 0), 26);
                } else {
                    this.playHitEffect(child);
                }
                const ratio = dist / Math.max(this.aoeRadius, 1);
                const dmgMult = 1.0 - (1.0 - this.aoeFalloffMin) * ratio;
                const finalDmg = Math.round(this.damage * dmgMult);
                enemy.takeDamage(finalDmg, this.towerType);
                if (this.slowFactor > 0 && this.slowDuration > 0) {
                    enemy.applySlow(this.slowFactor, this.slowDuration, this.towerType === 'coagulator' ? 'coagulator' : this.towerType === 'prism' ? 'frost' : 'default');
                }
            }
        }

        // 溅射范围同样会波及障碍物（含被手动标记的目标）
        this.damageObstaclesNear(pos, this.aoeRadius, this.damage);
    }

    /** 对范围内所有存活障碍物造成伤害 */
    private damageObstaclesNear(pos: Vec3, radius: number, damage: number): void {
        const mm = MapManager.instance;
        if (!mm) return;
        for (const n of mm.getObstacleNodes()) {
            if (!n || !n.isValid) continue;
            const ob = n.getComponent(Obstacle);
            if (!ob || ob.isDead) continue;
            if (Vec3.distance(pos, n.position) <= radius) {
                ob.takeDamage(damage);
            }
        }
    }

    /** Spawn a brief explosion sprite animation at the given world position */
    private spawnExplosion(worldPos: Vec3, parent: Node): void {
        EffectManager.playExplosion(parent, worldPos);
    }

    private checkPeriodicHit(): void {
        if (!this._isAlive) return;
        const pos = this.node.position;
        const parent = this.node.parent;
        if (!parent) return;

        const enemyLayer = parent.parent?.getChildByName('EnemyLayer');
        if (!enemyLayer) return;

        for (const child of enemyLayer.children) {
            const enemy = child.getComponent(Enemy);
            if (!enemy || enemy.isDead) continue;
            const dist = Vec3.distance(pos, child.position);
            if (dist <= 20) {
                this.playHitEffect(child);
                enemy.takeDamage(this.damage, this.towerType);
                if (this.slowFactor > 0 && this.slowDuration > 0) {
                    enemy.applySlow(this.slowFactor, this.slowDuration, this.towerType === 'coagulator' ? 'coagulator' : this.towerType === 'prism' ? 'frost' : 'default');
                }
                this.removeSelf();
                return;
            }
        }

        // 周期散射波及障碍物（命中即消散，与命中敌人一致）
        const mm = MapManager.instance;
        if (mm) {
            for (const n of mm.getObstacleNodes()) {
                if (!n || !n.isValid) continue;
                const ob = n.getComponent(Obstacle);
                if (!ob || ob.isDead) continue;
                if (Vec3.distance(pos, n.position) <= 20) {
                    ob.takeDamage(this.damage);
                    this.removeSelf();
                    return;
                }
            }
        }
    }

    private removeSelf(): void {
        // 防重入用独立的 _isRecycled，不能用 _isAlive
        // （hit() 会先把 _isAlive 置 false 再调本方法，用 _isAlive 守卫会导致节点既不回池也不销毁 → 子弹残留）
        if (this._isRecycled) return;
        this._isRecycled = true;
        this._isAlive = false;
        const node = this.node;
        if (!node || !node.isValid) return;
        // 优先回收入对象池，池满时才销毁
        if (Bullet._pool.length < Bullet.POOL_MAX) {
            node.removeFromParent();
            node.active = false;
            Bullet._pool.push(node);
        } else {
            node.destroy();
        }
    }
}
