import { _decorator, Component, Node, Sprite, Graphics, UITransform, Label, Color, tween, Vec3, Layers, ScrollView, Mask } from 'cc';
import { SpriteManager } from '../Utils/SpriteManager';
import { applyTextOutline } from '../Utils/UIText';
import { UIManager } from './UIManager';
import {
    LEVEL_CONFIGS, getFileLevels, getLevelConfig, getAllLevelConfigs,
    getLevelStars, getLevelStarKey, LevelConfig,
} from '../Data/LevelData';
import { getLevelMissions } from '../Data/MissionData';
import { MissionManager } from '../Core/MissionManager';
import { destroyChildren } from '../Utils/NodeUtil';

const { ccclass, property } = _decorator;

@ccclass('LevelSelect')
export class LevelSelect extends Component {
    public onSelectLevel: ((index: number) => void) | null = null;
    public onBack: (() => void) | null = null;

    onLoad() {
        // 默认回调指向 UIManager 单例（外部未注入时也能正常进入关卡/返回）
        if (!this.onSelectLevel) this.onSelectLevel = (i: number) => UIManager.instance?.startGame(i);
        if (!this.onBack) this.onBack = () => UIManager.instance?.showMainMenu();
        this.buildUI();
    }

    /** 重新读取进度并重建（UIManager.showLevelSelect 会调用） */
    public refresh(): void {
        this.buildUI();
    }

    /** 统一创建 UI 节点：必须设 layer=UI_2D，否则 UI 相机不渲染（黑屏） */
    private mk(parent: Node, name: string, w: number, h: number, x = 0, y = 0): Node {
        const n = new Node(name);
        n.layer = Layers.Enum.UI_2D;
        const ut = n.addComponent(UITransform);
        ut.setContentSize(w, h);
        ut.setAnchorPoint(0.5, 0.5);
        n.parent = parent;
        n.setPosition(x, y);
        return n;
    }

    private buildUI() {
        // SpriteManager 异步预加载，未 ready 时等预加载 Promise 完成再构建，避免空图/黑屏
        if (!SpriteManager.isReady()) {
            void SpriteManager.preloadAll().then(() => {
                if (this.node && this.node.isValid) this.buildUI();
            });
            return;
        }

        const view = this.node;
        let ut = view.getComponent(UITransform);
        if (!ut) ut = view.addComponent(UITransform);
        ut.setContentSize(1920, 1080);
        ut.setAnchorPoint(0.5, 0.5);
        // 每次打开选关都会 refresh → 重建整屏；必须销毁旧 UI，removeAllChildren 只脱离不销毁会累积泄漏
        destroyChildren(view);

        const vw = 1920;
        const vh = 1080;

        // ── 全屏背景：level_select_bg ──
        const bgNode = this.mk(view, 'BG', vw, vh, 0, 0);
        const bgSf = SpriteManager.getUIFrame('level_select_bg');
        const bgSprite = bgNode.addComponent(Sprite);
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgSprite.type = Sprite.Type.SIMPLE;
        if (bgSf) bgSprite.spriteFrame = bgSf;

        // ── 标题 ──
        const title = this.mk(view, 'Title', 600, 64, 0, vh / 2 - 90);
        const tl = title.addComponent(Label);
        tl.string = '选择关卡';
        tl.fontSize = 52;
        tl.color = new Color(255, 255, 255, 255);
        applyTextOutline(tl, 3);
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;

        // ── 关卡列表：地图文件夹 → 内置 → 编辑器自定义 ──
        const fileCount = getFileLevels().length;
        const builtinCount = LEVEL_CONFIGS.length;
        const total = getAllLevelConfigs().length;
        const levels: Array<{ config: LevelConfig; index: number }> = [];
        for (let i = 0; i < total; i++) {
            const cfg = getLevelConfig(i);
            if (cfg) levels.push({ config: cfg, index: i });
        }

        // 解锁规则（列表顺序：地图文件 → 内置 → 自制）：
        // - 地图文件夹关卡：放入即玩，不受解锁链限制（方便创作者边改边测）
        // - 内置关卡：顺序解锁，其中首个内置关卡恒解锁，其余需前一关已通关（星级>0）
        // - 编辑器自制关卡：直接可玩
        const unlocked = (idx: number): boolean => {
            if (idx < 0) return false;
            if (idx <= fileCount) return true;
            if (idx < fileCount + builtinCount) {
                const prev = getLevelConfig(idx - 1);
                if (!prev) return true;
                return getLevelStars(getLevelStarKey(prev)) > 0;
            }
            return true;
        };

        /** 卡片副标题：标明关卡来源 */
        const sourceLabel = (idx: number, cfg: LevelConfig): string => {
            if (idx < fileCount) return `📁 ${cfg.sourceFile || '地图文件'}`;
            if (idx < fileCount + builtinCount) return '内置关卡';
            return '✏ 编辑器自制';
        };

        // ── 关卡卡片网格（4 列，竖向 ScrollView，支持任意关卡数量）──
        const cardW = 380;
        const cardH = 200;
        const gapX = 60;
        const gapY = 60;
        const cols = 4;
        const rows = Math.max(1, Math.ceil(levels.length / cols));
        const gridW = cols * cardW + (cols - 1) * gapX;
        const gridH = rows * cardH + (rows - 1) * gapY;

        // 滚动视口高度（预留标题与返回按钮空间），关卡多时自动滚动
        const viewH = 760;
        const viewCenterY = (vh / 2 - 130) - viewH / 2;

        // ScrollView（带 Mask 裁剪的视口 + content 内容节点）
        const scroll = this.mk(view, 'LevelScroll', gridW, viewH, 0, viewCenterY);
        const maskNode = this.mk(scroll, 'LevelView', gridW, viewH, 0, 0);
        const mask = maskNode.addComponent(Mask);
        const content = this.mk(maskNode, 'LevelContent', gridW, gridH, 0, 0);
        const sv = scroll.addComponent(ScrollView);
        sv.content = content;
        sv.vertical = true;
        sv.horizontal = false;
        sv.inertia = true;
        sv.elastic = true;

        const startX = -gridW / 2 + cardW / 2;
        const startY = gridH / 2 - cardH / 2;

        levels.forEach((item, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (cardW + gapX);
            const y = startY - row * (cardH + gapY);
            this.makeLevelCard(
                content, x, y, cardW, cardH, item.index, item.config,
                unlocked(item.index), sourceLabel(item.index, item.config)
            );
        });

        // ── 返回按钮（左下）──
        this.makeButton(view, -vw / 2 + 160, -vh / 2 + 80, '返回', () => {
            this.onBack?.();
        });
    }

    private makeLevelCard(
        parent: Node, x: number, y: number,
        w: number, h: number, index: number, lv: LevelConfig,
        unlocked: boolean, source: string = ''
    ) {
        const cup = getLevelStars(getLevelStarKey(lv));

        const card = this.mk(parent, 'Card_' + index, w, h, x, y);
        const cardSf = SpriteManager.getUIFrame('panel_level_card');
        const sp = card.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        sp.spriteFrame = cardSf;
        // 兜底奶油底：精灵未重新导入时卡片无背景，白字会浮空看不清
        if (!cardSf) {
            const g = card.addComponent(Graphics);
            g.fillColor = new Color(233, 217, 184, 245);
            g.rect(-w / 2, -h / 2, w, h);
            g.fill();
        }
        if (!unlocked) sp.color = new Color(120, 120, 120, 255);

        // 来源（左上）
        if (source) {
            const src = this.mk(card, 'Source', 170, 24, -92, -86);
            const srl = src.addComponent(Label);
            srl.string = source;
            srl.fontSize = 15;
            srl.color = unlocked ? new Color(190, 210, 245, 255) : new Color(150, 150, 150, 255);
            applyTextOutline(srl, 2);
            srl.horizontalAlign = Label.HorizontalAlign.LEFT;
        }

        // 难度（右上）：按波数/敌人/模式/生命推算 1~5 档
        if (unlocked) {
            const diff = this.diffOf(lv);
            const dSf = SpriteManager.getUIFrame('diff_' + diff);
            if (dSf) {
                const dn = this.mk(card, 'Diff', 28, 28, w / 2 - 26, -h / 2 + 28);
                const ds = dn.addComponent(Sprite);
                ds.sizeMode = Sprite.SizeMode.CUSTOM;
                ds.type = Sprite.Type.SIMPLE;
                ds.spriteFrame = dSf;
            }
        }

        // 缩略图（左侧框）：真实关卡 path / towerSpots 程序化绘制（每关不同）
        if (unlocked) {
            this.makeThumb(card, lv, 162, 138, -95, 19);
        }

        // 右侧：编号 + 关卡名
        const num = this.mk(card, 'Num', 150, 70, 88, 40);
        const nl = num.addComponent(Label);
        nl.string = String(index + 1);
        nl.fontSize = 44;
        nl.color = unlocked ? new Color(255, 240, 200) : new Color(200, 200, 200);
        applyTextOutline(nl, 2);
        nl.horizontalAlign = Label.HorizontalAlign.CENTER;

        const name = this.mk(card, 'Name', 170, 40, 88, 4);
        const nal = name.addComponent(Label);
        nal.string = lv.name;
        nal.fontSize = 22;
        nal.color = new Color(255, 255, 255, 255);
        applyTextOutline(nal, 2);
        nal.horizontalAlign = Label.HorizontalAlign.CENTER;

        // 星级：3 颗普通(金/灰) + 第 4 颗隐藏彩星(粉)
        const starFull = SpriteManager.getUIFrame('star_full');
        const starEmpty = SpriteManager.getUIFrame('star_empty');
        const starSecret = SpriteManager.getUIFrame('star_secret');
        const lk = getLevelStarKey(lv);
        const hasHidden = unlocked && getLevelMissions(lk).length > 0;
        const hiddenDone = hasHidden && MissionManager.isAllHiddenCompleted(lk);
        const starCount = hasHidden ? 4 : 3;
        const sw = 26, gap = 6, totalW = starCount * sw + (starCount - 1) * gap;
        const sx0 = 88 - totalW / 2 + sw / 2;
        for (let k = 0; k < starCount; k++) {
            const sn = this.mk(card, 'Star' + k, sw, sw, sx0 + k * (sw + gap), -50);
            const ss = sn.addComponent(Sprite);
            ss.sizeMode = Sprite.SizeMode.CUSTOM;
            ss.type = Sprite.Type.SIMPLE;
            if (k < 3) {
                const sf = (unlocked && k < cup) ? starFull : starEmpty;
                if (sf) ss.spriteFrame = sf;
            } else {
                // 第 4 颗：隐藏彩星（粉色），完成点亮、未完成暗显作提示
                if (starSecret) ss.spriteFrame = starSecret;
                ss.color = hiddenDone ? new Color(255, 255, 255) : new Color(110, 110, 120, 255);
            }
        }

        // 锁定：居中锁图标
        if (!unlocked) {
            const lSf = SpriteManager.getUIFrame('lock');
            if (lSf) {
                const ln = this.mk(card, 'Lock', 56, 56, 0, -6);
                const ls = ln.addComponent(Sprite);
                ls.sizeMode = Sprite.SizeMode.CUSTOM;
                ls.type = Sprite.Type.SIMPLE;
                ls.spriteFrame = lSf;
            }
        }

        if (!unlocked) return; // 锁定卡片不可交互

        card.on(Node.EventType.TOUCH_START, () => card.setScale(0.96, 0.96, 1));
        card.on(Node.EventType.TOUCH_END, () => {
            card.setScale(1, 1, 1);
            this.onSelectLevel?.(index);
        });
        card.on(Node.EventType.TOUCH_CANCEL, () => card.setScale(1, 1, 1));
        card.on(Node.EventType.MOUSE_ENTER, () => {
            tween(card).to(0.12, { scale: new Vec3(1.06, 1.06, 1) }).start();
        });
        card.on(Node.EventType.MOUSE_LEAVE, () => {
            tween(card).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
        });
    }

    /** 程序化绘制关卡缩略图（基于真实 path / towerSpots，每关不同） */
    private makeThumb(parent: Node, lv: LevelConfig, w: number, h: number, x: number, y: number): void {
        const node = this.mk(parent, 'Thumb', w, h, x, y);
        const pad = 6;
        const cols = Math.max(1, lv.cols), rows = Math.max(1, lv.rows);
        const cw = (w - 2 * pad) / cols, ch = (h - 2 * pad) / rows;
        const toPx = (c: number, r: number) => ({
            x: -w / 2 + pad + (c + 0.5) * cw,
            // row 0 在地图顶部（见 MapManager.gridToWorld），缩略图同样把 row 0 画在顶部，避免上下翻转
            y: h / 2 - pad - (r + 0.5) * ch,
        });
        // 冰原底 + 前景：路径 + 起终点 + 塔点（单个 Graphics 绘制）
        const g = node.addComponent(Graphics);
        g.fillColor = new Color(40, 56, 80, 150);
        g.roundRect(-w / 2 + pad * 0.5, -h / 2 + pad * 0.5, w - pad, h - pad, 6);
        g.fill();
        const path = lv.path || [];
        if (path.length) {
            g.strokeColor = new Color(150, 200, 240, 235);
            g.lineWidth = 3;
            const p0 = toPx(path[0].x, path[0].y);
            g.moveTo(p0.x, p0.y);
            for (let i = 1; i < path.length; i++) {
                const p = toPx(path[i].x, path[i].y);
                g.lineTo(p.x, p.y);
            }
            g.stroke();
            const s = toPx(path[0].x, path[0].y);
            g.fillColor = new Color(110, 220, 130, 255); g.circle(s.x, s.y, 5); g.fill();
            const e = toPx(path[path.length - 1].x, path[path.length - 1].y);
            g.fillColor = new Color(225, 110, 110, 255); g.circle(e.x, e.y, 5); g.fill();
        }
        const spots = lv.towerSpots || [];
        const step = Math.max(1, Math.floor(spots.length / 22));
        g.fillColor = new Color(200, 220, 245, 220);
        for (let i = 0; i < spots.length; i += step) {
            const p = toPx(spots[i].col, spots[i].row);
            g.circle(p.x, p.y, 2.5); g.fill();
        }
    }

    /** 推算难度 1(简单)~5(地狱)：波数/敌人数/模式/生命值加权 */
    private diffOf(lv: LevelConfig): number {
        let score = 0;
        const waves = lv.waves?.length || 0;
        let enemies = 0;
        (lv.waves || []).forEach(w => (w.enemies || []).forEach(e => { enemies += e.count; }));
        if (lv.mode === 'boss' || lv.mode === 'fortress') score += 2;
        if (waves >= 8) score += 2; else if (waves >= 5) score += 1;
        if (enemies >= 60) score += 2; else if (enemies >= 30) score += 1;
        if ((lv.lives ?? 10) <= 5) score += 1;
        return Math.max(1, Math.min(5, 1 + score));
    }

    private makeButton(parent: Node, x: number, y: number, text: string, onClick: () => void): Node {
        const btn = this.mk(parent, 'Btn_' + text, 240, 72, x, y);

        const normal = SpriteManager.getUIFrame('btn_normal');
        const hover = SpriteManager.getUIFrame('btn_hover');
        const sp = btn.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        sp.spriteFrame = normal;

        const label = this.mk(btn, 'Label', 220, 48, 0, 0);
        const t = label.addComponent(Label);
        t.string = text;
        t.fontSize = 32;
        t.color = new Color(255, 255, 255, 255);
        applyTextOutline(t, 2);
        t.horizontalAlign = Label.HorizontalAlign.CENTER;
        t.verticalAlign = Label.VerticalAlign.CENTER;

        btn.on(Node.EventType.TOUCH_START, () => btn.setScale(0.94, 0.94, 1));
        const release = () => { btn.setScale(1, 1, 1); sp.spriteFrame = normal; };
        btn.on(Node.EventType.TOUCH_END, () => { release(); onClick(); });
        btn.on(Node.EventType.TOUCH_CANCEL, release);
        btn.on(Node.EventType.MOUSE_ENTER, () => {
            if (hover) sp.spriteFrame = hover;
            tween(btn).to(0.12, { scale: new Vec3(1.05, 1.05, 1) }).start();
        });
        btn.on(Node.EventType.MOUSE_LEAVE, () => {
            if (normal) sp.spriteFrame = normal;
            tween(btn).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
        });
        return btn;
    }
}
