import { Node, Layers, Sprite, SpriteFrame, UITransform, Vec3, Color, tween, Label, HorizontalTextAlignment, VerticalTextAlignment, Overflow, UIOpacity, Component } from 'cc';
import { SpriteManager } from './SpriteManager';
import { COMBAT_SCALE } from '../Data/VisualScale';
import { applyTextOutline } from './UIText';

/**
 * 统一特效管理器 — 集中管理所有帧序列特效和视觉反馈。
 * 
 * 使用前必须调用 init() 绑定一个持久 Component（如 GameManager）作为清理调度器。
 * 否则所有特效的 scheduleOnce 可能因调用组件被销毁而失效，导致动画节点残留。
 */
export class EffectManager {
    // 持久调度器：使用一个生命周期覆盖整个关卡的 Component 来执行 scheduleOnce
    // 避免 Enemy/Bullet 等短生命组件销毁后清理回调丢失
    private static _scheduler: Component | null = null;
    // 特效层：所有临时特效节点的统一父节点（便于统一清理）
    private static _fxLayer: Node | null = null;
    /**
     * 在场特效节点登记表。
     *
     * 特效节点挂在调用方传入的父节点上（敌人层 / 塔节点 / 地图节点等），
     * 退出关卡时这些父节点虽会被 clearLayer 销毁，但仍有部分特效挂在关卡之外的持久节点上，
     * 或其自毁定时器晚于关卡清理 → 残留到主菜单 / 下一关。故统一登记，退出时一次性销毁。
     */
    private static _activeFx: Set<Node> = new Set();

    /** 登记一个在场特效节点（超过阈值时顺带剔除已销毁的引用，避免集合无限增长） */
    private static trackFx(node: Node): void {
        if (this._activeFx.size > 128) {
            for (const n of this._activeFx) {
                if (!n || !n.isValid) this._activeFx.delete(n);
            }
        }
        this._activeFx.add(node);
    }

    /** 统一清场：销毁所有仍在场的特效节点（退出关卡 / 重开关卡 / 回主菜单时调用） */
    public static clearAll(): void {
        for (const n of this._activeFx) {
            if (n && n.isValid) {
                this.stopTweens(n);
                n.children.forEach(c => this.stopTweens(c));
                n.destroy();
            }
        }
        this._activeFx.clear();
    }

    /**
     * 初始化特效管理器，必须在使用特效前调用。
     * @param scheduler 持久存在的 Component（推荐传入 GameManager）
     */
    public static init(scheduler: Component): void {
        this._scheduler = scheduler;
        this._fxLayer = scheduler.node;
    }

    /** 安全 scheduleOnce：始终使用持久调度器 */
    private static scheduleCleanup(fn: () => void, delaySec: number): void {
        if (this._scheduler && this._scheduler.isValid) {
            this._scheduler.scheduleOnce(fn, delaySec);
            return;
        }
        // 降级：无有效持久调度器时用浏览器定时器，保证特效节点必然销毁、不残留
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            window.setTimeout(() => { try { fn(); } catch (_) { /* 节点已销毁时忽略 */ } }, delaySec * 1000);
        }
    }

    /** 安全停止指定目标上的所有 tween */
    private static stopTweens(target: any): void {
        try {
            if (target) tween(target).stop();
        } catch (_) { /* 目标已销毁时忽略 */ }
    }

    /**
     * 战斗视觉统一倍率：以塔为中心的命中/开火特效按此放大，与放大后的塔身协调。
     * 范围型特效（辐射光环 / 雪爆）按射程绘制，不调用本方法。
     */
    private static sc(v: number): number { return v * COMBAT_SCALE; }

    /** 创建临时特效节点并挂载 Sprite */
    private static makeEffectNode(
        name: string,
        parent: Node,
        worldPos: Vec3,
        width: number,
        height: number,
    ): { node: Node; sprite: Sprite } {
        const fxNode = new Node(name);
        fxNode.layer = Layers.Enum.UI_2D;
        fxNode.setPosition(worldPos);
        // 兼容 CC 3.8.8 编辑模式可能不自动创建 UITransform
        const uiTransform = fxNode.getComponent(UITransform) || fxNode.addComponent(UITransform);
        uiTransform.setContentSize(width, height);
        const sprite = fxNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        parent.addChild(fxNode);
        this.trackFx(fxNode);
        return { node: fxNode, sprite };
    }

    /** 在 parentNode 上 schedule 延迟销毁 */

    // ── 帧序列特效（模板方法） ──

    /**
     * 播放 N 帧效果序列，自动创建节点和销毁。
     * @returns 特效节点 (若无可用的 sprite frame 则返回 null)
     */
    public static playEffectSeq(
        parentNode: Node,           // 特效挂载的父节点
        worldPos: Vec3,
        sequenceName: string,       // SpriteManager.getEffectSeq(name) 的 key
        interval: number,           // 每帧间隔（秒）
        width: number = 48,
        height: number = 48,
    ): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFramesFitted(parentNode, worldPos, SpriteManager.getEffectSeq(sequenceName), interval, Math.max(width, height));
    }

    /** 通用：用显式帧序列创建特效节点并自动销毁 */
    private static playFrames(
        parentNode: Node,
        worldPos: Vec3,
        frames: (SpriteFrame | null)[],
        interval: number,
        width: number = 48,
        height: number = 48,
    ): Node | null {
        if (!frames[0]) return null;

        const { node, sprite } = this.makeEffectNode('Fx_seq', parentNode, worldPos, width, height);
        sprite.spriteFrame = frames[0];

        const dur = SpriteManager.playFrameSequence(sprite, frames, interval);

        this.scheduleCleanup(() => {
            this.stopTweens(node);
            if (node && node.isValid) node.destroy();
        }, dur);

        return node;
    }

    /** 与 playFrames 相同，但按「内容长边」适配尺寸（抵消透明 padding，避免动画视觉偏小变形） */
    private static playFramesFitted(
        parentNode: Node,
        worldPos: Vec3,
        frames: (SpriteFrame | null)[],
        interval: number,
        contentSize: number,
    ): Node | null {
        if (!frames[0]) return null;

        const { node, sprite } = this.makeEffectNodeFitted('Fx_seq', parentNode, worldPos, contentSize, frames[0]);
        sprite.spriteFrame = frames[0];

        const dur = SpriteManager.playFrameSequence(sprite, frames, interval);

        this.scheduleCleanup(() => {
            this.stopTweens(node);
            if (node && node.isValid) node.destroy();
        }, dur);

        return node;
    }

    /** 同 makeEffectNode，但用 setNodeSpriteFitted（内容尺寸适配）创建精灵 */
    private static makeEffectNodeFitted(
        name: string,
        parentNode: Node,
        worldPos: Vec3,
        contentSize: number,
        frame0: SpriteFrame,
    ): { node: Node; sprite: Sprite } {
        const node = new Node(name);
        node.layer = parentNode.layer;
        node.parent = parentNode;
        node.setPosition(worldPos.x, worldPos.y, worldPos.z);
        this.trackFx(node);
        const sprite = node.addComponent(Sprite);
        // 按首个 frame 的内容包围盒反算尺寸（所有帧同画布）
        SpriteManager.setNodeSpriteFitted(node, frame0, contentSize, name);
        return { node, sprite };
    }

    /** A03: 辐射塔攻击光环（按等级） */
    public static playRadiationBeam(parentNode: Node, worldPos: Vec3, level: number, size: number, fireRate: number): Node | null {
        if (!SpriteManager.isReady()) return null;
        // 按等级把单圈动画时长对齐到攻击间隔：dur = 4.5*interval = fireRate，
        // 使视觉脉冲节奏与伤害节奏 1:1 无缝（Lv1/2/3 各不同）。
        const interval = fireRate / 4.5;
        const node = this.playFrames(parentNode, worldPos, SpriteManager.getRadiationBeamFrames(level), interval, size, size);
        // 淡入 + 末尾淡出：绿环从塔心柔和涌出、收尾不突兀
        if (node && node.isValid) {
            const ui = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
            ui.opacity = 0;
            const dur = 4.5 * interval;
            const fadeIn = 0.14;
            const fadeOut = 0.2;
            tween(ui)
                .to(fadeIn, { opacity: 255 })
                .delay(Math.max(0, dur - fadeIn - fadeOut))
                .to(fadeOut, { opacity: 0 })
                .start();
        }
        return node;
    }

    /** A06: 特斯拉命中敌人爆炸（PBall01-02，挂在敌人身上） */
    public static playTeslaHit(parentNode: Node, worldPos: Vec3, width: number = 48, height: number = 48): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getTeslaHitFrames(), 0.1, this.sc(width), this.sc(height));
    }

    /** A06: 特斯拉塔中心攻击动画（Ball41-44/51-54/61-64 按等级，从塔中心出现） */
    public static playTeslaFire(parentNode: Node, worldPos: Vec3, level: number, size: number = 60): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getTeslaFireFrames(level), 0.08, this.sc(size), this.sc(size));
    }

    /**
     * A06（连续攻击）：创建一条持久特斯拉电弧光束节点（不自动销毁，由调用方管理生命周期）。
     * 返回节点后通过 updateTeslaBeam 每帧跟随目标刷新朝向/长度，实现「连续放电」而非一闪一闪。
     * @returns 光束节点（无素材时返回 null）
     */
    public static createTeslaBeam(
        arcParent: Node,
        from: Vec3,
        to: Vec3,
        level: number,
    ): Node | null {
        if (!SpriteManager.isReady()) return null;
        const frames = SpriteManager.getTeslaBeamFrames(level);
        if (!frames[0]) return null;

        const { node } = this.makeEffectNode('Fx_tesla_beam', arcParent, from, this.sc(56), Vec3.distance(from, to));
        const sprite = node.getComponent(Sprite);
        if (sprite) sprite.spriteFrame = frames[0];
        // 锚点改到底部中心：光束从塔端向怪端贯穿，避免 center-anchor 下中点/长度刷新失效导致光条卡塔上
        const ui = node.getComponent(UITransform);
        if (ui) { ui.anchorX = 0.5; ui.anchorY = 0; }
        // 帧循环状态（持久电弧逐帧闪烁，而非静止单帧）
        (node as any)._teslaBeamFrames = frames;
        (node as any)._teslaBeamT = 0;
        (node as any)._teslaBeamIdx = 0;
        return node;
    }

    /** A06（连续攻击）：每帧刷新持久电弧的朝向、长度，并循环切换帧使其「连续放电闪烁」 */
    public static updateTeslaBeam(node: Node, from: Vec3, to: Vec3, dt: number = 0): void {
        if (!node || !node.isValid) return;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) {
            // 距离过近：隐藏而非销毁，避免近距离目标时反复创建/销毁
            node.active = false;
            return;
        }
        node.active = true;
        // 节点固定在塔端（anchorY=0），旋转后光条从塔端向怪端延伸
        node.setPosition(from.x, from.y, 0);
        node.angle = Math.atan2(dy, dx) * (180 / Math.PI) - 90; // 竖条长轴向上(90°)，旋转到目标方向

        // 逐帧闪烁：每 ~0.06s 切到下一帧
        const frames = (node as any)._teslaBeamFrames as (SpriteFrame | null)[] | undefined;
        if (frames && frames.length > 0) {
            (node as any)._teslaBeamT += dt;
            if ((node as any)._teslaBeamT >= 0.06) {
                (node as any)._teslaBeamT -= 0.06;
                (node as any)._teslaBeamIdx = ((node as any)._teslaBeamIdx + 1) % frames.length;
                const sp = node.getComponent(Sprite);
                const f = frames[(node as any)._teslaBeamIdx];
                if (sp && f) sp.spriteFrame = f;
            }
        }

        // 最后强制拉伸到「塔↔怪距离」：切换 spriteFrame 可能把渲染尺寸重置回纹理原始大小，
        // 故每帧在切帧之后重设 CUSTOM 并写入 contentSize，保证光束长度始终等于实际距离
        const sp = node.getComponent(Sprite);
        if (sp && sp.sizeMode !== Sprite.SizeMode.CUSTOM) sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const ui = node.getComponent(UITransform);
        if (ui) ui.setContentSize(this.sc(56), len);
    }

    // ── 其他塔：命中爆点 + 塔中心攻击/落点动画 ──
    /** 发射器命中爆点（emitter_hit_01/02，发射器自带 2 帧等离子爆） */
    public static playEmitterHit(parentNode: Node, worldPos: Vec3, size: number = 26): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getEmitterHitFrames(), 0.09, this.sc(size), this.sc(size));
    }
    /** 光棱塔(重设计)命中爆点（prism_hit_01/02，彩虹棱镜碎片爆裂） */
    public static playPrismHit(parentNode: Node, worldPos: Vec3, size: number = 34): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getPrismHitFrames(), 0.09, this.sc(size), this.sc(size));
    }
    /** 星星塔命中爆点（PStar01-02） */
    public static playArtilleryHit(parentNode: Node, worldPos: Vec3, size: number = 26): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getArtilleryHitFrames(), 0.09, this.sc(size), this.sc(size));
    }
    /** 星星塔炮击落点爆炸（PStar-11~16，240×240 → 显示 120） */
    public static playArtilleryExplosion(parentNode: Node, worldPos: Vec3, size: number = 120): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getArtilleryExplosionFrames(), 0.09, this.sc(size), this.sc(size));
    }
    /** 便便塔命中爆点（PShit01-02） */
    public static playCoagulatorHit(parentNode: Node, worldPos: Vec3, size: number = 26): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getCoagulatorHitFrames(), 0.09, this.sc(size), this.sc(size));
    }
    /** 弓箭塔命中：物理穿刺爆点（碎片飞溅）——即“第一次打到敌人身上”的动画本身；
        残留箭已按需求移除（DoT 期间直接复用该命中动画常驻，不另插箭）。 */
    public static playArcherHit(parentNode: Node, worldPos: Vec3, dir: Vec3 = new Vec3(0, -1, 0), size: number = 22): void {
        if (!SpriteManager.isReady()) return;
        // 命中爆点（物理碎片，非魔法火焰）
        this.playFrames(parentNode, worldPos, SpriteManager.getArcherHitFrames(), 0.08, this.sc(size), this.sc(size));
    }
    /** 火箭塔塔中心发射（PRocket11-15/21-25/31-35 按等级5帧） */
    public static playRocketFire(parentNode: Node, worldPos: Vec3, level: number, size: number): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getRocketFireFrames(level), 0.06, this.sc(size), this.sc(size));
    }
    /** 雪球塔塔中心雪爆（PSnow11-15/21-25/31-35 按等级5帧）。size 为统一显示尺寸（与辐射塔 playRadiationBeam 一致，固定尺寸不跳动） */
    public static playSnowFire(parentNode: Node, worldPos: Vec3, level: number, size: number): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getSnowFireFrames(level), 0.07, size, size);
    }
    /** 雪花塔定身特效（PSnow-11，定身期间挂在敌人身上循环播放） */
    public static playSnowFreeze(parentNode: Node, contentSize: number = 44): Node | null {
        if (!SpriteManager.isReady()) return null;
        const frame = SpriteManager.getSnowFreezeFrame();
        if (!frame) return null;
        // 按内容包围盒适配：PSnow-11 内容仅 76×28（横带），直接铺正方形会压扁变形
        return SpriteManager.setNodeSpriteFitted(parentNode, frame, this.sc(contentSize), 'SnowFreeze');
    }

    /** A03: 辐射塔命中敌人爆炸（9 帧，挂在敌人身上） */
    public static playRadiationHit(parentNode: Node, worldPos: Vec3, width: number = 36, height: number = 36): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getRadiationHitFrames(), 0.08, this.sc(width), this.sc(height));
    }

    /** 冷凝塔攻击光环（condenser_beam_11-14/21-24/31-34，按等级，冰霜环外扩脉冲） */
    public static playCondenserBeam(parentNode: Node, worldPos: Vec3, level: number, size: number, fireRate: number): Node | null {
        if (!SpriteManager.isReady()) return null;
        // 单圈动画时长对齐攻击间隔，与辐射塔一致（4 帧 → fireRate/4.5）
        const interval = fireRate / 4.5;
        const node = this.playFrames(parentNode, worldPos, SpriteManager.getCondenserBeamFrames(level), interval, size, size);
        if (node && node.isValid) {
            const ui = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
            ui.opacity = 0;
            const dur = 4.5 * interval;
            const fadeIn = 0.14;
            const fadeOut = 0.2;
            tween(ui)
                .to(fadeIn, { opacity: 255 })
                .delay(Math.max(0, dur - fadeIn - fadeOut))
                .to(fadeOut, { opacity: 0 })
                .start();
        }
        return node;
    }

    /** 冷凝塔命中敌人冰晶爆点（condenser_hit_01-03，3 帧，挂在敌人身上） */
    public static playCondenserHit(parentNode: Node, worldPos: Vec3, width: number = 36, height: number = 36): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getCondenserHitFrames(), 0.08, this.sc(width), this.sc(height));
    }

    /** 雪花塔定身命中：雪花爆点（TSnow/Snow00-01，专属素材，挂在敌人身上） */
    public static playFrostHit(parentNode: Node, worldPos: Vec3, width: number = 44, height: number = 44): Node | null {
        if (!SpriteManager.isReady()) return null;
        return this.playFrames(parentNode, worldPos, SpriteManager.getSnowHitFrames(), 0.07, this.sc(width), this.sc(height));
    }

    /**
     * 播放单帧闪光效果，自动销毁。
     */
    public static playFlashEffect(
        parentNode: Node,
        worldPos: Vec3,
        frameName: string,          // SpriteManager.getEffectFrame(name) 的 key
        duration: number,
        width: number = 70,
        height: number = 70,
    ): Node | null {
        if (!SpriteManager.isReady()) return null;
        const sf = SpriteManager.getEffectFrame(frameName);
        if (!sf) return null;

        const { node, sprite } = this.makeEffectNode(`Fx_${frameName}`, parentNode, worldPos, this.sc(width), this.sc(height));
        sprite.spriteFrame = sf;

        this.scheduleCleanup(() => {
            if (node && node.isValid) node.destroy();
        }, duration);

        return node;
    }

    // ── A01: 敌人死亡帧序列 ──
    //    已内嵌在 Enemy.ts 中（需要直接操作 enemy sprite），此处不封装。

    // ── A02: 爆炸帧序列 ──
    public static playExplosion(parentNode: Node, worldPos: Vec3): void {
        this.playEffectSeq(parentNode, worldPos, 'explosion', 0.1, this.sc(48), this.sc(48));
    }

    // ── A05: 分裂帧序列（split_effect 已切分为独立帧 0~5）──
    public static playSplitEffect(parentNode: Node, worldPos: Vec3): void {
        const frames = SpriteManager.getSplitEffectFrames();
        this.playFrames(parentNode, worldPos, frames, 0.08, this.sc(48), this.sc(48));
    }

    // ── B02: 塔建造帧序列 ──
    public static playBuildEffect(parentNode: Node, worldPos: Vec3): void {
        this.playEffectSeq(parentNode, worldPos, 't_build', 0.08, this.sc(64), this.sc(64));
    }

    // ── B03: 敌人生成帧序列 ──
    public static playSpawnEffect(parentNode: Node, worldPos: Vec3): void {
        this.playEffectSeq(parentNode, worldPos, 'e_spawn', 0.08, 48, 48);
    }

    // ── B06: 金币飞入 ──
    public static playCoinFly(
        parentNode: Node,
        worldPos: Vec3,
        goldAmount: number,
    ): void {
        if (!SpriteManager.isReady()) return;
        const frames = SpriteManager.getEffectSeq('coin_fly');
        if (!frames[0]) return;

        // 容器节点
        const container = new Node('CoinFly');
        container.layer = Layers.Enum.UI_2D;
        container.setPosition(worldPos);
        parentNode.addChild(container);
        this.trackFx(container);   // 容器内含精灵与金币文字，整组登记以便统一清理

        // 帧序列精灵
        const { node: fxNode, sprite } = this.makeEffectNode('Fx_coin_fly', container, Vec3.ZERO, 32, 32);
        sprite.spriteFrame = frames[0];
        SpriteManager.playFrameSequence(sprite, frames, 0.06);

        // 金币文字标签
        const labelNode = new Node('GoldLabel');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.setPosition(0, 20, 0);
        const labelTransform = labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform);
        labelTransform.setContentSize(60, 20);
        const label = labelNode.addComponent(Label);
        label.string = `+${goldAmount}G`;
        label.fontSize = 14;
        label.color = Color.YELLOW;
        applyTextOutline(label, 2);
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Overflow.NONE;
        container.addChild(labelNode);

        // tween 动画：上浮 + 缩小 + 淡出
        const uiOpacity = container.addComponent(UIOpacity);
        uiOpacity.opacity = 255;
        tween(container)
            .to(0.6, { position: new Vec3(worldPos.x, worldPos.y + 50, 0) })
            .start();
        tween(fxNode)
            .to(0.5, { scale: new Vec3(0.3, 0.3, 1) })
            .start();
        tween(labelNode)
            .delay(0.3)
            .to(0.4, { scale: new Vec3(0.5, 0.5, 1) })
            .start();

        this.scheduleCleanup(() => {
            this.stopTweens(container);
            this.stopTweens(fxNode);
            this.stopTweens(labelNode);
            if (container && container.isValid) container.destroy();
        }, 1.2);
    }

    /**
     * B04: 实体红色闪烁反馈（tween 两轮）
     */
    public static playRedFlash(node: Node, onComplete?: () => void): void {
        // 精灵通常挂在子节点（setNodeSprite 创建子节点），故用 getComponentInChildren 才能命中
        const sprite = node.getComponentInChildren(Sprite);
        if (!sprite) {
            onComplete?.();
            return;
        }
        const originalColor = sprite.color.clone();
        tween(sprite)
            .to(0.08, { color: Color.RED })
            .to(0.08, { color: originalColor })
            .to(0.08, { color: Color.RED })
            .to(0.08, { color: originalColor })
            .call(() => onComplete?.())
            .start();
    }

    // ── A07: 升级闪光 ──
    public static playUpgradeFlash(parentNode: Node, worldPos: Vec3): void {
        this.playFlashEffect(parentNode, worldPos, 'upgrade_flash', 0.5, 70, 70);
    }

    // ── A06: 闪电电弧 (Graphics 绑定在 Tower) ──
    //    仍由 Tower 自行处理，因为需要访问 Graphics 和塔的坐标

    // ── 清理 ──
    /** 清除特效管理器状态（关卡切换时调用） */
    public static cleanup(): void {
        this._scheduler = null;
        this._fxLayer = null;
    }
}
