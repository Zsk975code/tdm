import { _decorator, Component, Node, Sprite, UITransform, Label, Color, UIOpacity, tween, Vec3, Layers } from 'cc';
import { SpriteManager } from '../Utils/SpriteManager';
import { applyTextOutline } from '../Utils/UIText';
import { UIManager } from './UIManager';
import { destroyChildren } from '../Utils/NodeUtil';

const { ccclass, property } = _decorator;

@ccclass('MainMenu')
export class MainMenu extends Component {
    /** 主界面背景/标题/按钮均使用项目 UI 素材，替代纯色 Graphics。
     *  按钮直接调用 UIManager 单例的界面切换方法（无需外部注入回调）。 */

    onLoad() {
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
        destroyChildren(view);

        const vw = 1920;
        const vh = 1080;

        // ── 全屏背景：main_menu_bg ──
        const bgNode = this.mk(view, 'BG', vw, vh, 0, 0);
        const bgSf = SpriteManager.getUIFrame('main_menu_bg');
        const bgSprite = bgNode.addComponent(Sprite);
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgSprite.type = Sprite.Type.SIMPLE;
        if (bgSf) bgSprite.spriteFrame = bgSf;

        // ── 标题 Logo：logo_title（600×120），顶部居中 ──
        const logoSf = SpriteManager.getUIFrame('logo_title');
        if (logoSf) {
            const logo = this.mk(view, 'Logo', 600, 120, 0, vh / 2 - 150);
            const ls = logo.addComponent(Sprite);
            ls.sizeMode = Sprite.SizeMode.CUSTOM;
            ls.type = Sprite.Type.SIMPLE;
            ls.spriteFrame = logoSf;
        }

        // ── 主按钮区：竖排 4 个九宫格按钮（240×72 显示尺寸）──
        const buttons: Array<{ label: string; onClick: () => void }> = [
            { label: '开始游戏', onClick: () => UIManager.instance?.showLevelSelect() },
            { label: '图 鉴', onClick: () => UIManager.instance?.showCodex() },
            { label: '编辑关卡', onClick: () => UIManager.instance?.showMapEditor() },
            { label: '游戏设置', onClick: () => UIManager.instance?.showSettings() },
            { label: '无尽模式', onClick: () => this.toast('无尽模式 · 敬请期待') },
        ];

        const startY = vh / 2 - 340;
        const gap = 100;
        buttons.forEach((b, i) => {
            this.makeButton(view, 0, startY - i * gap, b.label, b.onClick);
        });

        // ── 底部小字提示 ──
        const tip = this.mk(view, 'Tip', 900, 32, 0, -vh / 2 + 50);
        const tl = tip.addComponent(Label);
        tl.string = 'V1.0';
        tl.fontSize = 26;
        tl.color = new Color(255, 255, 255, 255);
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        // 深棕描边：3.8 描边由 Label 自身渲染，必须开 enableOutline 才生效
        tl.enableOutline = true;
        tl.outlineWidth = 3;
        tl.outlineColor = new Color(60, 42, 24, 255);
    }

    /** 240×72 九宫格按钮：btn_normal 常态 / btn_hover 悬停 */
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

    /** 屏幕中央弹出提示气泡，自动放大淡出后销毁（用于「敬请期待」等占位提示） */
    private toast(msg: string): void {
        const t = this.mk(this.node, 'Toast', 640, 96, 0, 60);
        const l = t.addComponent(Label);
        l.string = msg;
        l.fontSize = 44;
        l.color = new Color(255, 255, 255, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        applyTextOutline(l, 3, l.color);
        const ui = t.addComponent(UIOpacity);
        ui.opacity = 0;
        t.setScale(0.6, 0.6, 1);
        tween(t).to(0.18, { scale: new Vec3(1, 1, 1) }).start();
        tween(ui).to(0.18, { opacity: 255 }).delay(1.1).to(0.45, { opacity: 0 })
            .call(() => t.destroy()).start();
    }
}
