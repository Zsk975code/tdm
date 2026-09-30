import {
    _decorator, Component, Node, Sprite, UITransform, Label, Color, Graphics,
    Layers, Overflow, HorizontalTextAlignment, VerticalTextAlignment,
} from 'cc';
const { ccclass } = _decorator;

import { ALL_TOWER_TYPES, TOWER_CONFIGS, TowerType } from '../Data/TowerData';
import { ALL_ENEMY_TYPES, ENEMY_CONFIGS, EnemyType } from '../Data/EnemyData';
import { ObstacleType, OBSTACLE_DEFS } from '../Data/LevelData';
import { MissionType } from '../Data/MissionData';
import { destroyChildren } from '../Utils/NodeUtil';
import {
    TOWER_FLAVOR, ENEMY_FLAVOR, OBSTACLE_FLAVOR, OBSTACLE_LABEL,
    MISSION_LABEL, MISSION_FLAVOR,
} from '../Data/CodexData';
import { SpriteManager } from '../Utils/SpriteManager';
import { applyTextOutline } from '../Utils/UIText';
import { CodexManager, CodexKind } from '../Utils/CodexManager';
import { UIManager } from './UIManager';

const TABS: { kind: CodexKind; label: string }[] = [
    { kind: 'towers', label: '防御塔' },
    { kind: 'enemies', label: '敌人' },
    { kind: 'obstacles', label: '障碍' },
    { kind: 'missions', label: '隐藏任务' },
];

const TAB_W = 220;
const TAB_H = 62;

const LOCKED = new Color(120, 130, 150, 255);
const GOLD = new Color(255, 215, 90, 255);
const CYAN = new Color(120, 215, 255, 255);
const WHITE = new Color(235, 242, 250, 255);
const DIM = new Color(180, 195, 215, 255);

@ccclass('CodexPanel')
export class CodexPanel extends Component {

    private _tab: number = 0;
    private _selected: number = 0;
    private gridNode: Node = null!;
    private detailNode: Node = null!;
    private counterLabel: Label = null!;
    private tabBtns: Node[] = [];

    onLoad(): void {
        if (!SpriteManager.isReady()) {
            // 等素材预加载完成再构建，避免空图/黑屏（不用 0 延时自轮询空转）
            void SpriteManager.preloadAll().then(() => {
                if (this.node && this.node.isValid) this.buildUI();
            });
            return;
        }
        this.buildUI();
        this.setTab(0);
    }

    /** 每次打开时刷新（反映最新解锁进度） */
    public refresh(): void {
        if (this.gridNode) this.setTab(this._tab);
    }

    // ───────────────── 基础节点工具 ─────────────────
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

    private rect(parent: Node, name: string, w: number, h: number, color: Color, x = 0, y = 0, border?: Color): Node {
        const n = this.mk(parent, name, w, h, x, y);
        const g = n.addComponent(Graphics);
        g.lineWidth = 2;
        g.fillColor = color;
        if (border) g.strokeColor = border;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        if (border) g.stroke();
        return n;
    }

    private label(parent: Node, name: string, w: number, h: number, text: string,
                  fontSize: number, color: Color, x = 0, y = 0,
                  align: HorizontalTextAlignment = HorizontalTextAlignment.CENTER): Label {
        const n = this.mk(parent, name, w, h, x, y);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.color = color;
        applyTextOutline(l, 2, color);
        l.horizontalAlign = align;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        l.overflow = Overflow.NONE;
        return l;
    }

    private setIcon(node: Node, sf: ReturnType<typeof SpriteManager.getUIFrame> | null, w: number, h: number): void {
        const sp = node.getComponent(Sprite) || node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        if (sf) sp.spriteFrame = sf;
    }

    // ───────────────── 布局 ─────────────────
    private buildUI(): void {
        const view = this.node;
        let ut = view.getComponent(UITransform);
        if (!ut) ut = view.addComponent(UITransform);
        ut.setContentSize(1920, 1080);
        ut.setAnchorPoint(0.5, 0.5);
        destroyChildren(view);

        // 背景（复用主菜单背景，保持风格统一）
        const bg = this.mk(view, 'BG', 1920, 1080, 0, 0);
        const bgSf = SpriteManager.getUIFrame('main_menu_bg');
        this.setIcon(bg, bgSf, 1920, 1080);

        // 主面板
        this.rect(view, 'Panel', 1840, 1000, new Color(16, 24, 38, 248), 0, 0, new Color(70, 100, 140, 255));

        // 标题 + 计数
        this.label(view, 'Title', 400, 60, '图 鉴', 46, GOLD, 0, 462);
        this.counterLabel = this.label(view, 'Counter', 900, 30, '', 20, DIM, 0, 414);

        // 关闭按钮
        const close = this.rect(view, 'CloseBtn', 64, 64, new Color(60, 40, 40, 255), 882, 462, new Color(200, 90, 90, 255));
        this.label(close, 'X', 40, 40, '✕', 30, new Color(255, 220, 220, 255));
        close.on(Node.EventType.TOUCH_END, () => UIManager.instance?.showMainMenu());

        // 标签页
        const gap = 18, startX = -((TABS.length - 1) * (TAB_W + gap)) / 2;
        TABS.forEach((t, i) => {
            const btn = this.rect(view, 'Tab' + i, TAB_W, TAB_H, new Color(30, 42, 62, 255), startX + i * (TAB_W + gap), 352, new Color(70, 100, 140, 255));
            this.label(btn, 'TabLbl' + i, TAB_W - 16, 40, t.label, 24, WHITE);
            btn.on(Node.EventType.TOUCH_END, () => this.setTab(i));
            this.tabBtns.push(btn);
        });

        // 卡片网格容器（左）—— 撑满标签行以下到面板底部的纵向空间
        this.gridNode = this.mk(view, 'Grid', 1120, 730, -330, -85);
        // 详情面板（右）
        this.detailNode = this.rect(view, 'Detail', 640, 770, new Color(22, 32, 50, 250), 565, -105, new Color(70, 100, 140, 200));
    }

    private setTab(i: number): void {
        this._tab = i;
        this._selected = 0;
        this.tabBtns.forEach((b, k) => {
            const active = k === i;
            // Graphics 改 fillColor 不会自动重绘，必须 clear 后重新绘制
            const g = b.getComponent(Graphics)!;
            g.clear();
            g.lineWidth = 2;
            g.fillColor = active ? new Color(50, 96, 140, 255) : new Color(30, 42, 62, 255);
            g.strokeColor = new Color(70, 100, 140, 255);
            g.rect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H);
            g.fill();
            g.stroke();
            const lbl = b.getChildByName('TabLbl' + k)!.getComponent(Label)!;
            lbl.color = active ? GOLD : WHITE;
        });
        this.renderGrid();
        this.updateCounter();
    }

    private updateCounter(): void {
        const kind = TABS[this._tab].kind;
        const total = this.ids(kind).length;
        const found = CodexManager.count(kind, total).found;
        this.counterLabel.string = `已收录 ${found} / ${total}`;
    }

    // ───────────────── 数据 ─────────────────
    private ids(kind: CodexKind): string[] {
        if (kind === 'towers') return ALL_TOWER_TYPES.slice();
        if (kind === 'enemies') return ALL_ENEMY_TYPES.slice();
        if (kind === 'obstacles') return Object.values(ObstacleType);
        return Object.values(MissionType);
    }

    private name(kind: CodexKind, id: string): string {
        if (kind === 'towers') return TOWER_CONFIGS[id as TowerType][0].name;
        if (kind === 'enemies') return ENEMY_CONFIGS[id as EnemyType].name;
        if (kind === 'obstacles') return OBSTACLE_LABEL[id as ObstacleType];
        return MISSION_LABEL[id as MissionType];
    }

    private icon(kind: CodexKind, id: string): ReturnType<typeof SpriteManager.getUIFrame> | null {
        if (kind === 'towers') return SpriteManager.getUIFrame('tower_icon_' + id);
        if (kind === 'enemies') return SpriteManager.getEnemyFrame(id, 0);
        if (kind === 'obstacles') return SpriteManager.getObstacleFrame(id as ObstacleType);
        return SpriteManager.getUIFrame('star_secret'); // 隐藏任务用粉色星作图标
    }

    // ───────────────── 网格 ─────────────────
    private renderGrid(): void {
        // 每次切页/点卡片都会重建网格：必须销毁旧卡片，removeAllChildren 只脱离不销毁会泄漏
        destroyChildren(this.gridNode);
        const ids = this.ids(TABS[this._tab].kind);
        const cols = 6, cw = 172, ch = 196, gx = 12, gy = 16;
        const totalW = cols * cw + (cols - 1) * gx;
        const x0 = -totalW / 2 + cw / 2;
        // 卡片在容器内垂直居中，避免出现大段空白带
        const nRows = Math.ceil(ids.length / cols);
        const blockH = nRows * ch + (nRows - 1) * gy;
        const top = blockH / 2 - ch / 2;
        ids.forEach((id, idx) => {
            const row = Math.floor(idx / cols), col = idx % cols;
            const x = x0 + col * (cw + gx);
            const y = top - row * (ch + gy);
            const discovered = CodexManager.isDiscovered(TABS[this._tab].kind, id);
            const card = this.rect(this.gridNode, 'Card' + idx, cw, ch,
                idx === this._selected ? new Color(40, 70, 100, 255) : new Color(28, 40, 58, 235),
                0, 0, idx === this._selected ? CYAN : new Color(60, 90, 130, 255));
            card.setPosition(x, y);
            if (discovered) {
                const ic = this.mk(card, 'Icon', 92, 92, 0, 46);
                this.setIcon(ic, this.icon(TABS[this._tab].kind, id), 92, 92);
                this.label(card, 'Name' + idx, cw - 12, 30, this.name(TABS[this._tab].kind, id), 17, WHITE, 0, -58);
            } else {
                this.label(card, 'Q', 76, 76, '？', 50, LOCKED, 0, 46);
                this.label(card, 'Name' + idx, cw - 12, 30, '未解锁', 15, LOCKED, 0, -58);
            }
            card.on(Node.EventType.TOUCH_END, () => {
                this._selected = idx;
                this.renderGrid();
                this.renderDetail();
            });
        });
        this.renderDetail();
    }

    // ───────────────── 详情 ─────────────────
    private renderDetail(): void {
        destroyChildren(this.detailNode);
        // 重建背景与边框（detailNode 自身已带一个 Graphics 组件，复用它）
        const bg = this.detailNode.getComponent(Graphics)!;
        bg.clear();
        bg.lineWidth = 2;
        bg.fillColor = new Color(22, 32, 50, 250);
        bg.strokeColor = new Color(70, 100, 140, 200);
        bg.rect(-320, -385, 640, 770);
        bg.fill();
        bg.stroke();

        const kind = TABS[this._tab].kind;
        const ids = this.ids(kind);
        const id = ids[this._selected] ?? ids[0];
        const discovered = CodexManager.isDiscovered(kind, id);

        // 大图标
        const icNode = this.mk(this.detailNode, 'DIcon', 150, 150, 0, 270);
        if (discovered) {
            this.setIcon(icNode, this.icon(kind, id), 150, 150);
        } else {
            this.label(this.detailNode, 'DQ', 120, 120, '？', 80, LOCKED, 0, 270);
        }

        if (!discovered) {
            this.label(this.detailNode, 'DLock', 560, 40, '？？？', 30, LOCKED, 0, 140);
            this.wrapLines(this.detailNode, '尚未解锁：在战斗中首次遭遇该条目后自动收录。', 580, 92, 20, DIM, 26);
            return;
        }

        // 标题
        this.label(this.detailNode, 'DTitle', 580, 44, this.name(kind, id), 30, GOLD, 0, 140);

        const lines: string[] = [];
        if (kind === 'towers') this.towerLines(id, lines);
        else if (kind === 'enemies') this.enemyLines(id, lines);
        else if (kind === 'obstacles') this.obstacleLines(id, lines);
        else this.missionLines(id, lines);

        // 解说（亮青色），统一在面板内左对齐（左边缘约 30px 留白）
        const flavorLines = this.wrapLines(this.detailNode, this.flavor(kind, id), 580, 88, 19, CYAN, 30);

        // 数值行（左对齐，与解说同一起始边）
        let y = 88 - flavorLines * 30 - 18;
        lines.forEach((ln, i) => {
            this.label(this.detailNode, 'L' + i, 580, 28, ln, 18, WHITE, 0, y, HorizontalTextAlignment.LEFT);
            y -= 30;
        });
    }

    private flavor(kind: CodexKind, id: string): string {
        if (kind === 'towers') return TOWER_FLAVOR[id as TowerType];
        if (kind === 'enemies') return ENEMY_FLAVOR[id as EnemyType];
        if (kind === 'obstacles') return OBSTACLE_FLAVOR[id as ObstacleType];
        return MISSION_FLAVOR[id as MissionType];
    }

    private towerLines(id: string, out: string[]): void {
        const cfgs = TOWER_CONFIGS[id as TowerType];
        const tags: string[] = [];
        const max = cfgs[cfgs.length - 1];
        if (max.slowFactor > 0 && max.freezeDuration === 0) tags.push(`减速 ${Math.round(max.slowFactor * 100)}% / ${max.slowDuration}s`);
        if (max.freezeDuration > 0) tags.push(`定身 ${max.freezeDuration}s`);
        if (max.aoeRadius > 0) tags.push(`范围伤害 半径${max.aoeRadius}`);
        if (max.auraRadius > 0) tags.push(`光环 +${Math.round(max.auraDamageBonus * 100)}%伤害`);
        if (max.critChance > 0) tags.push(`暴击 ${Math.round(max.critChance * 100)}% ×${max.critMultiplier}`);
        if (max.hitsAllInRange) tags.push('群体攻击');
        if (max.periodicAoeInterval > 0) tags.push(`持续AoE 每${max.periodicAoeInterval}s`);
        if (max.bulletCount > 1) tags.push(`多重弹道 ×${max.bulletCount}`);
        if (tags.length) out.push('特色：' + tags.join('，'));
        cfgs.forEach((c, i) => {
            out.push(`Lv${i + 1}　伤害 ${c.damage}　射程 ${c.range}　射速 ${c.fireRate}/s`);
            out.push(`↳ 建造/升级 ${c.cost} 金`);
        });
    }

    private enemyLines(id: string, out: string[]): void {
        const c = ENEMY_CONFIGS[id as EnemyType];
        out.push(`血量 ${c.hp}`);
        out.push(`速度 ${c.speed}`);
        out.push(`奖励 ${c.reward} 金`);
        out.push(`对防御点伤害 ${c.damage}`);
        if (c.splitCount > 0) out.push(`分裂：死亡裂解为 ${c.splitCount} 个${ENEMY_CONFIGS[c.splitType].name}`);
        if (c.goldPerHit) out.push(`受击掉金：每下 +${c.goldPerHit} 金`);
        if (c.healAmount > 0) out.push(`自疗：每 ${c.healInterval}s 恢复 ${c.healAmount}`);
    }

    private obstacleLines(id: string, out: string[]): void {
        const d = OBSTACLE_DEFS[id as ObstacleType];
        out.push(`占格 ${d.w}×${d.h}`);
        out.push(`血量 ${d.hp}`);
        out.push(`摧毁奖励 ${d.reward} 金`);
        out.push(`类型 ${d.isTreasure ? '宝箱（金袋）' : '岩石'}`);
    }

    private missionLines(id: string, out: string[]): void {
        const t = id as MissionType;
        out.push('类型代号：' + t);
        if (t === MissionType.HAVE_TOWER) out.push('例：场上保有 5 座 3 级发射器');
        else if (t === MissionType.KILL_BY_TOWER) out.push('例：用发射器累计消灭 50 个敌人');
        else if (t === MissionType.DESTROY_OBSTACLE) out.push('例：限时清除 (4,4) 处障碍');
        else if (t === MissionType.FORBID_TOWER) out.push('例：本局禁止建造火箭塔');
        else if (t === MissionType.FINISH_IN_TIME) out.push('例：120 秒内通关');
        else if (t === MissionType.LIMIT_TOWER) out.push('例：特斯拉塔不超过 3 座');
        else if (t === MissionType.EARN_GOLD) out.push('例：90 秒内累计 1000 金');
    }

    /** 按字数正常换行（尽量在标点处断开），文字框在面板内居中、左对齐；返回绘制的总行数 */
    private wrapLines(parent: Node, text: string, maxW: number, yStart: number, fontSize: number, color: Color, lineH: number): number {
        const maxChars = Math.max(8, Math.floor(maxW / fontSize));
        const PUNCT = /[，。；、！？：]/;
        let line = '';
        let y = yStart;
        let count = 0;
        const flush = (s: string) => {
            if (!s) return;
            this.label(parent, 'W' + count, maxW, lineH, s, fontSize, color, 0, y, HorizontalTextAlignment.LEFT);
            y -= lineH;
            count++;
        };
        for (const ch of text) {
            if (ch === '\n') { flush(line); line = ''; continue; }
            line += ch;
            const atEnd = line.length >= maxChars;
            const nearEnd = line.length >= maxChars - 1;
            if (atEnd || (nearEnd && PUNCT.test(ch))) { flush(line); line = ''; }
        }
        flush(line);
        return count;
    }
}
