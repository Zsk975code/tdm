# -*- coding: utf-8 -*-
"""把重画后的 prism 素材拼成预览图，输出到 D:/code/tower-defense/out/PRISM。"""
import os
from PIL import Image, ImageDraw, ImageFont

ART = r"d:/code/tower-defense/assets/resources/Art"
OUT_DIR = r"d:/code/tower-defense/out/PRISM"
os.makedirs(OUT_DIR, exist_ok=True)

ITEMS = [
    ("Towers/prism_base_lv1.png", "base1"),
    ("Towers/prism_base_lv2.png", "base2"),
    ("Towers/prism_base_lv3.png", "base3"),
    ("Towers/prism_lv1.png", "lv1"),
    ("Towers/prism_lv2.png", "lv2"),
    ("Towers/prism_lv3.png", "lv3"),
    ("Towers/prism_attack_12.png", "atk12"),
    ("Towers/prism_attack_13.png", "atk13"),
    ("Towers/prism_attack_22.png", "atk22"),
    ("Towers/prism_attack_23.png", "atk23"),
    ("Towers/prism_attack_32.png", "atk32"),
    ("Towers/prism_attack_33.png", "atk33"),
    ("Bullets/prism.png", "bullet"),
    ("Bullets/prism_11.png", "b11"),
    ("Bullets/prism_21.png", "b21"),
    ("Bullets/prism_31.png", "b31"),
    ("Effects/prism_hit_01.png", "hit1"),
    ("Effects/prism_hit_02.png", "hit2"),
    ("Effects/prism_slow.png", "slow"),
]

CELL = 96
COL = 6
PAD = 6
ROWS = (len(ITEMS) + COL - 1) // COL


def draw_grid_preview():
    w, h = COL * CELL, ROWS * CELL
    canvas = Image.new("RGBA", (w, h), (32, 36, 44, 255))
    d = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 13)
    except Exception:
        font = ImageFont.load_default()

    for i, (rel, label) in enumerate(ITEMS):
        r, c = divmod(i, COL)
        x0, y0 = c * CELL, r * CELL
        img = Image.open(os.path.join(ART, rel)).convert("RGBA")
        iw, ih = img.size
        scale = (CELL - 2 * PAD) / max(iw, ih)
        nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
        img = img.resize((nw, nh), Image.LANCZOS)
        px = x0 + (CELL - nw) // 2
        py = y0 + (CELL - nh) // 2
        canvas.alpha_composite(img, (px, py))
        d.rectangle([x0 + 1, y0 + 1, x0 + CELL - 2, y0 + CELL - 2], outline=(90, 100, 120, 255))
        d.text((x0 + 4, y0 + CELL - 16), label, fill=(210, 220, 235, 255), font=font)
    return canvas


def draw_combo_preview():
    """展示 base+待机+攻击帧的组合效果（底座在下，塔身在上，模拟游戏中叠放）。"""
    cell = 96
    groups = [
        ("Lv1 idle", "Towers/prism_base_lv1.png", "Towers/prism_lv1.png"),
        ("Lv1 charge", "Towers/prism_base_lv1.png", "Towers/prism_attack_12.png"),
        ("Lv1 fire", "Towers/prism_base_lv1.png", "Towers/prism_attack_13.png"),
        ("Lv3 idle", "Towers/prism_base_lv3.png", "Towers/prism_lv3.png"),
        ("Lv3 charge", "Towers/prism_base_lv3.png", "Towers/prism_attack_32.png"),
        ("Lv3 fire", "Towers/prism_base_lv3.png", "Towers/prism_attack_33.png"),
    ]
    col = 3
    row = (len(groups) + col - 1) // col
    w, h = col * cell, row * cell
    canvas = Image.new("RGBA", (w, h), (32, 36, 44, 255))
    d = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 13)
    except Exception:
        font = ImageFont.load_default()

    for i, (label, base, body) in enumerate(groups):
        c, r = divmod(i, col)
        x0, y0 = c * cell, r * cell
        base_img = Image.open(os.path.join(ART, base)).convert("RGBA")
        body_img = Image.open(os.path.join(ART, body)).convert("RGBA")
        # 缩放到格子内
        for img in (base_img, body_img):
            iw, ih = img.size
            scale = (cell - 2 * PAD) / max(iw, ih)
            img = img.resize((max(1, int(iw * scale)), max(1, int(ih * scale))), Image.LANCZOS)
        # 叠放：底座和塔身都居中
        bx = x0 + (cell - base_img.width) // 2
        by = y0 + (cell - base_img.height) // 2
        tx = x0 + (cell - body_img.width) // 2
        ty = y0 + (cell - body_img.height) // 2
        canvas.alpha_composite(base_img, (bx, by))
        canvas.alpha_composite(body_img, (tx, ty))
        d.rectangle([x0 + 1, y0 + 1, x0 + cell - 2, y0 + cell - 2], outline=(90, 100, 120, 255))
        d.text((x0 + 4, y0 + cell - 16), label, fill=(210, 220, 235, 255), font=font)
    return canvas


def main():
    grid = draw_grid_preview()
    grid.convert("RGB").save(os.path.join(OUT_DIR, "prism_preview.png"))
    print("grid preview ->", os.path.join(OUT_DIR, "prism_preview.png"), grid.size)

    combo = draw_combo_preview()
    combo.convert("RGB").save(os.path.join(OUT_DIR, "prism_combo_preview.png"))
    print("combo preview ->", os.path.join(OUT_DIR, "prism_combo_preview.png"), combo.size)


if __name__ == "__main__":
    main()
