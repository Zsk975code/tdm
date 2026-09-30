import {
    _decorator, Component, Node, Sprite, UITransform, Label, Color, Graphics,
    Layers, EventTouch, Vec3, HorizontalTextAlignment, VerticalTextAlignment, Overflow,
} from 'cc';
const { ccclass } = _decorator;

import { SpriteManager } from '../Utils/SpriteManager';
import { applyTextOutline } from '../Utils/UIText';
import { AudioManager } from '../Utils/AudioManager';
import { DeveloperData } from '../Data/DeveloperData';
import { UIManager } from './UIManager';
import { destroyChildren } from '../Utils/NodeUtil';

const WHITE = new Color(235, 242, 250, 255);
const CYAN = new Color(120, 215, 255, 255);
const PANEL_BG = new Color(40, 52, 62, 250);
const TRACK_BG = new Color(34, 40, 50, 255);
const TRACK_BORDER = new Color(120, 140, 170, 255);
const FILL = new Color(110, 205, 242, 255);
/** 开发者模式开关：开/关两种底色，配合文字形成明显的开关状态 */
const DEV_ON = new Color(70, 160, 100, 255);
const DEV_OFF = new Color(72, 80, 96, 255);
const DEV_BORDER = new Color(20, 30, 40, 255);

@ccclass('SettingsPanel')
export class SettingsPanel extends Component {

    onLoad(): void {
        if (SpriteManager.isReady()) {
            this.buildUI();
            return;
        }
        // 素材未就绪：等预加载 Promise 完成后再构建，避免用 0 延时自轮询空转
        void SpriteManager.preloadAll().then(() => {
            if (this.node && this.node.isValid) this.buildUI();
        });
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
                  fontSize: number, color: Color, x = 0, y = 0): Label {
        const n = this.mk(parent, name, w, h, x, y);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.color = color;
        applyTextOutline(l, 2, color);
        l.horizontalAlign = HorizontalTextAlignment.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        l.overflow = Overflow.NONE;
        return l;
    }

    /** 复用主菜单背景，保持风格统一 */
    private setBgIcon(node: Node, sf: ReturnType<typeof SpriteManager.getUIFrame> | null, w: number, h: number): void {
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

        // 背景（复用主菜单背景）
        const bg = this.mk(view, 'BG', 1920, 1080, 0, 0);
        this.setBgIcon(bg, SpriteManager.getUIFrame('main_menu_bg'), 1920, 1080);

        // 半透明遮罩
        this.rect(view, 'Overlay', 1920, 1080, new Color(0, 0, 0, 120), 0, 0);

        // 主面板
        const panel = this.rect(view, 'Panel', 720, 620, PANEL_BG, 0, 0, TRACK_BORDER);

        this.label(panel, 'Title', 600, 40, '游戏设置', 38, CYAN, 0, 250);

        // ── 音乐音量 ──
        this.label(panel, 'BgmLabel', 240, 36, '音乐音量', 30, WHITE, -200, 130);
        const bgmVal = this.label(panel, 'BgmVal', 140, 36, '', 28, CYAN, 250, 130);
        this.makeSlider(panel, 20, 130, 380, 26, AudioManager.getBgmVolume(), (v) => {
            AudioManager.setBgmVolume(v);
            bgmVal.string = `${Math.round(v * 100)}%`;
        });
        bgmVal.string = `${Math.round(AudioManager.getBgmVolume() * 100)}%`;

        // ── 音效音量 ──
        this.label(panel, 'SfxLabel', 240, 36, '音效音量', 30, WHITE, -200, 30);
        const sfxVal = this.label(panel, 'SfxVal', 140, 36, '', 28, CYAN, 250, 30);
        this.makeSlider(panel, 20, 30, 380, 26, AudioManager.getSfxVolume(), (v) => {
            AudioManager.setSfxVolume(v);
            // 拖动时即时试听反馈音量：用节流接口，避免 TOUCH_MOVE 每帧刷出几十次音效（音频轰炸）
            AudioManager.playSfxThrottled(AudioManager.SFX.UI_CLICK, 0.15);
            sfxVal.string = `${Math.round(v * 100)}%`;
        });
        sfxVal.string = `${Math.round(AudioManager.getSfxVolume() * 100)}%`;

        // ── 开发者模式开关 ──
        this.label(panel, 'DevLabel', 240, 36, '开发者模式', 30, WHITE, -200, -70);
        const devBtn = this.makeButton(panel, 90, -70, 260, 56,
            '', DEV_OFF, () => {
                DeveloperData.instance.setDevModeEnabled(!DeveloperData.instance.devModeEnabled);
                this.refreshDevButton(devBtn);
            });
        this.refreshDevButton(devBtn);   // 初始显示与已保存的开关一致

        this.label(panel, 'DevHint', 600, 28,
            '开启后游戏中显示「开发」按钮，可呼出开发者技能面板', 20,
            new Color(190, 205, 225, 255), 0, -120);

        // ── 返回按钮 ──
        this.makeButton(panel, 0, -240, 240, 64, '返回', new Color(70, 110, 90), () => {
            UIManager.instance?.showMainMenu();
        });
    }

    /** 刷新开发者开关的显示（开=绿底「已开启」，关=灰底「已关闭」） */
    private refreshDevButton(btn: Node): void {
        const on = DeveloperData.instance.devModeEnabled;
        this.setButtonColor(btn, on ? DEV_ON : DEV_OFF);
        this.setButtonText(btn, on ? '已开启' : '已关闭');
    }

    /** 重绘按钮底色（SettingsPanel 的按钮底色是画在自身节点上的 Graphics） */
    private setButtonColor(btn: Node, color: Color): void {
        const g = btn.getComponent(Graphics);
        const ut = btn.getComponent(UITransform);
        if (!g || !ut) return;
        const w = ut.width, h = ut.height;
        g.clear();
        g.lineWidth = 2;
        g.fillColor = color;
        g.strokeColor = DEV_BORDER;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        g.stroke();
    }

    // ───────────────── 滑块 ─────────────────
    private makeSlider(parent: Node, x: number, y: number, w: number, h: number,
                       initial: number, onChange: (v: number) => void): void {
        const track = this.rect(parent, 'SliderTrack', w, h, TRACK_BG, x, y, TRACK_BORDER);

        // 填充条：锚点置左，从左侧向外增长
        const fill = this.mk(track, 'Fill', Math.max(1, w * initial), h, -w / 2, 0);
        fill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
        const fg = fill.addComponent(Graphics);
        fg.fillColor = FILL;
        fg.rect(0, -h / 2, Math.max(1, w * initial), h);
        fg.fill();

        const knob = this.rect(track, 'Knob', 28, 28, new Color(200, 244, 255, 255), -w / 2 + w * initial, 0, TRACK_BORDER);

        const setSlider = (v: number) => {
            const fw = Math.max(1, w * v);
            const fut = fill.getComponent(UITransform)!;
            fut.setContentSize(fw, h);
            fg.clear();
            fg.fillColor = FILL;
            fg.rect(0, -h / 2, fw, h);
            fg.fill();
            knob.setPosition(-w / 2 + fw, 0);
        };
        setSlider(initial);

        const onSlide = (e: EventTouch) => {
            const ut = track.getComponent(UITransform)!;
            const p = ut.convertToNodeSpaceAR(new Vec3(e.getUILocation().x, e.getUILocation().y, 0));
            let v = (p.x + w / 2) / w;
            v = Math.max(0, Math.min(1, v));
            setSlider(v);
            onChange(v);
        };
        track.on(Node.EventType.TOUCH_START, onSlide, this);
        track.on(Node.EventType.TOUCH_MOVE, onSlide, this);
    }

    // ───────────────── 按钮 ─────────────────
    private makeButton(parent: Node, x: number, y: number, w: number, h: number,
                       text: string, color: Color, onClick: () => void): Node {
        const btn = this.rect(parent, 'Btn_' + text, w, h, color, x, y, new Color(20, 30, 40, 255));
        const label = this.mk(btn, 'Label', w - 16, h - 12, 0, 0);
        const l = label.addComponent(Label);
        l.string = text;
        l.fontSize = 30;
        l.color = WHITE;
        applyTextOutline(l, 2, l.color);
        l.horizontalAlign = HorizontalTextAlignment.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;

        btn.on(Node.EventType.TOUCH_START, () => btn.setScale(0.94, 0.94, 1));
        const release = () => btn.setScale(1, 1, 1);
        btn.on(Node.EventType.TOUCH_END, () => { release(); onClick(); });
        btn.on(Node.EventType.TOUCH_CANCEL, release);
        return btn;
    }

    private setButtonText(btn: Node, text: string): void {
        const l = btn.getChildByName('Label')?.getComponent(Label);
        if (l) l.string = text;
    }
}
