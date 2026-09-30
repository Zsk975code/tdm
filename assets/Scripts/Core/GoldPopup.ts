import { _decorator, Component, Label, Color } from 'cc';
const { ccclass } = _decorator;

import { DeveloperData } from '../Data/DeveloperData';

/** 障碍摧毁时上飘淡出的 "+Ng" 文本 */
@ccclass('GoldPopup')
export class GoldPopup extends Component {
    private _t = 0;
    private _dur = 0.9;
    private _startY = 0;
    private _label: Label | null = null;

    start(): void {
        this._label = this.getComponent(Label);
        this._startY = this.node.position.y;
    }

    update(dt: number): void {
        // 暂停时冻结上飘动画（与游戏逻辑一致）
        if (DeveloperData.instance.paused) return;
        if (this._t >= this._dur) return;
        this._t += dt;
        const k = Math.min(1, this._t / this._dur);
        const x = this.node.position.x;
        this.node.setPosition(x, this._startY + k * 50, 0);
        if (this._label) {
            const c = this._label.color;
            this._label.color = new Color(c.r, c.g, c.b, Math.floor(255 * (1 - k)));
        }
        if (k >= 1 && this.node.isValid) this.node.destroy();
    }
}
