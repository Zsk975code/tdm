import { SpriteFrame, builtinResMgr } from 'cc';

export class ResUtil {
    private static _whiteFrame: SpriteFrame | null = null;

    public static getWhiteFrame(): SpriteFrame {
        if (this._whiteFrame) return this._whiteFrame;

        const keys = ['ui-sprite-frame', 'ui_sprite_frame', 'default_sprite_splash_frame'];
        for (const key of keys) {
            try {
                const frame = builtinResMgr.get<SpriteFrame>(key);
                if (frame) {
                    this._whiteFrame = frame;
                    return frame;
                }
            } catch (_) {}
        }

        throw new Error('[ResUtil] Cannot get built-in SpriteFrame');
    }
}