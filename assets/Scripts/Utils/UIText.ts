import { Label, Color } from 'cc';

/** 浅色字用的深棕描边：在深底/地图上拉出对比 */
export const TEXT_OUTLINE_DARK = new Color(54, 38, 22, 255);

/** 深色字用的浅色描边：与奶油底同系，避免描边与字身糊成黑块 */
export const TEXT_OUTLINE_LIGHT = new Color(255, 250, 236, 255);

/** 兼容旧引用（默认深棕描边） */
export const TEXT_OUTLINE_COLOR = TEXT_OUTLINE_DARK;

/**
 * 给 Label 加一层描边，使其在不同背景上都清晰可读。
 *
 * 关键：描边色要**与字色相反**才能既保对比、又不糊字。
 * - 深色字（奶油浅底上）：用浅色细描边——描边融进浅底，字身反而更干净；
 *   若沿用深色描边，深描边会填满小字的笔画缝隙，糊成一团黑块。
 * - 浅色字（深底/地图上）：用深棕描边，拉出边界。
 *
 * 注意：Cocos 3.8 描边已合并进 Label 自身（Label.outlineWidth / Label.outlineColor），
 * 不要再挂独立的 LabelOutline 组件，否则会触发 'LabelOutline.width is deprecated' 警告。
 * 但必须记得打开开关 Label.enableOutline = true，只设 outlineWidth 是不会显示描边的。
 *
 * @param width     描边像素宽度（浅色字按此值，深色字会自动收窄）
 * @param fillColor 字身颜色，用于决定描边色；缺省按浅色字处理（深棕描边）
 */
export function applyTextOutline(lb: Label, width = 2, fillColor?: Color): void {
    let outlineColor = TEXT_OUTLINE_DARK;
    let w = width;
    if (fillColor) {
        const lum = 0.2126 * fillColor.r + 0.7152 * fillColor.g + 0.0722 * fillColor.b;
        if (lum < 150) {
            // 深色字：描边改浅色并收窄，避免糊字
            outlineColor = TEXT_OUTLINE_LIGHT;
            w = Math.max(1, width - 1);
        }
    }
    // 关键开关：不打开它，outlineWidth/outlineColor 都不生效（3.8 描边由 Label 自身渲染）
    lb.enableOutline = true;
    lb.outlineWidth = w;
    lb.outlineColor = outlineColor;
}
