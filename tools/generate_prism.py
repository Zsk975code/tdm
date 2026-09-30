# -*- coding: utf-8 -*-
"""
根据草图重画 prism（光棱塔）全套素材：
- 底座：银白金属圆盘（像硬币平台），中间有三角凹槽供三棱镜坐落。
- 塔身：尖朝上的三棱镜（三角锥），水晶质感，带明暗面与彩虹折射边。
- 攻击：光束从上方汇聚到塔顶 → 三棱镜被点亮并折射出彩虹 → 从塔尖刷出晶体子弹。
- 子弹：小型多面晶体（双锥形），随塔旋转后尖头朝飞行方向。
- 命中/减速：彩虹折射爆点 + 棱镜光环。

所有文件名不变，仅替换 .png 内容（保留 .meta）。
"""
import os
import shutil
import math
from PIL import Image, ImageDraw, ImageFilter

ART = r"d:/code/tower-defense/assets/resources/Art"
TOWER_DIR = os.path.join(ART, "Towers")
BULLET_DIR = os.path.join(ART, "Bullets")
EFFECT_DIR = os.path.join(ART, "Effects")
BACKUP = r"d:/code/tower-defense/_prism_backup"

# ── 配色（RGB，不带 alpha，绘制时再加） ─────────────────
CRYSTAL_LIGHT = (215, 248, 255)
CRYSTAL_MID   = (130, 220, 255)
CRYSTAL_DARK  = (60, 140, 200)
CRYSTAL_EDGE  = (240, 252, 255)
METAL_DARK    = (80, 92, 108)
METAL_MID     = (150, 164, 182)
METAL_LIGHT   = (216, 226, 238)
RING_GLOW     = (80, 190, 240)
CORE_GLOW     = (180, 240, 255)
WHITE         = (255, 255, 255)
RAINBOW = [
    (255, 80, 80), (255, 150, 50), (255, 220, 60),
    (80, 230, 120), (60, 200, 255), (120, 120, 255), (210, 80, 255),
]


def backup():
    if os.path.exists(BACKUP):
        print("backup skipped (already exists)")
        return
    os.makedirs(BACKUP)
    for d in (TOWER_DIR, BULLET_DIR, EFFECT_DIR):
        for f in os.listdir(d):
            if f.startswith("prism") and f.endswith(".png"):
                shutil.copy2(os.path.join(d, f), os.path.join(BACKUP, f))
    print("backup ->", BACKUP)


def canvas(size):
    if isinstance(size, int):
        size = (size, size)
    return Image.new("RGBA", size, (0, 0, 0, 0))


def glow(size, cx, cy, r, color, alpha=255, blur=None):
    if isinstance(size, int):
        size = (size, size)
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if isinstance(color, tuple) and len(color) == 3:
        color = color + (alpha,)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    b = blur if blur is not None else max(1, int(r * 0.7))
    return layer.filter(ImageFilter.GaussianBlur(b))


def with_alpha(rgb, a):
    return rgb + (a,)


def save(img, path):
    img.save(path)
    print("wrote", os.path.basename(path), img.size)


# ── 底座（圆盘硬币平台，中间三角凹槽） ──────────────────
def make_base(level):
    s = 56
    img = canvas(s)
    cx, cy = 28, 34
    outer = {1: 17, 2: 19, 3: 21}[level]

    # 柔和蓝色底盘辉光
    img = Image.alpha_composite(img, glow(s, cx, cy, outer + 7, RING_GLOW, 80, blur=8))

    d = ImageDraw.Draw(img)
    # 外圈暗金属
    d.ellipse([cx - outer, cy - outer, cx + outer, cy + outer], fill=METAL_DARK)
    # 中圈亮金属
    d.ellipse([cx - outer + 2, cy - outer + 2, cx + outer - 2, cy + outer - 2], fill=METAL_MID)
    # 内圈盘面
    inner = outer - 5
    d.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=METAL_DARK)
    d.ellipse([cx - inner + 1, cy - inner + 1, cx + inner - 1, cy + inner - 1], fill=METAL_LIGHT)

    # 同心圆环纹理
    for i in range(1, 4 if level >= 2 else 2):
        rr = inner - i * (2 if level == 1 else 3)
        if rr > 4:
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=METAL_MID, width=1)

    # 中心三角凹槽（三棱镜底座）
    tri_r = 8 + level
    tri = [(cx, cy - tri_r), (cx - tri_r * 0.9, cy + tri_r * 0.6), (cx + tri_r * 0.9, cy + tri_r * 0.6)]
    d.polygon(tri, fill=(100, 120, 140, 130), outline=METAL_DARK)

    # 核心光点
    img = Image.alpha_composite(img, glow(s, cx, cy, 4, CORE_GLOW, 200, blur=3))
    return img


# ── 三棱镜塔身（尖朝上） ───────────────────────────────
def make_body(level, attack=None):
    s = 56
    img = canvas(s)
    cx, cy = 28, 30
    scale = {1: 0.82, 2: 1.0, 3: 1.16}[level]

    # 顶点、底边左右、底边中点
    top = (cx, cy - 22 * scale)
    bl = (cx - 14 * scale, cy + 11 * scale)
    br = (cx + 14 * scale, cy + 11 * scale)
    bm = (cx, cy + 11 * scale)

    # 整体柔和辉光
    img = Image.alpha_composite(img, glow(s, cx, cy, 18 * scale, CRYSTAL_MID, 55, blur=10))

    d = ImageDraw.Draw(img)
    # 左暗面
    d.polygon([top, bl, bm], fill=with_alpha(CRYSTAL_DARK, 200))
    # 右亮面
    d.polygon([top, br, bm], fill=with_alpha(CRYSTAL_LIGHT, 210))
    # 中间高光脊
    ridge = [(top[0], top[1] + 2), (bm[0] - 1, bm[1] - 2), (bm[0] + 1, bm[1] - 2)]
    d.polygon(ridge, fill=with_alpha(WHITE, 115))

    # 轮廓棱线
    d.line([top, bl], fill=with_alpha(CRYSTAL_EDGE, 230), width=1)
    d.line([top, br], fill=with_alpha(CRYSTAL_EDGE, 230), width=1)
    d.line([bl, br], fill=with_alpha(CRYSTAL_EDGE, 230), width=1)
    d.line([top, bm], fill=with_alpha(WHITE, 180), width=1)

    # 顶部高光
    img = Image.alpha_composite(img, glow(s, top[0], top[1], 3, WHITE, 240, blur=2))

    # 彩虹折射边（lv2+ 沿右棱）
    if level >= 2:
        for i, col in enumerate(RAINBOW[3:6]):
            t = i / 2.0
            px = top[0] + (br[0] - top[0]) * (0.55 + 0.25 * t)
            py = top[1] + (br[1] - top[1]) * (0.55 + 0.25 * t)
            img = Image.alpha_composite(img, glow(s, int(px), int(py), 3, col, 180, blur=2))

    # 攻击特效：光照汇聚 / 彩虹爆发
    if attack == "12":
        # 从上方射下的光束汇聚到塔顶
        beam_top = (top[0], top[1] - 26)
        for w, a in [(4, 90), (2, 160)]:
            d.line([beam_top, (top[0], top[1] - 2)], fill=with_alpha(WHITE, a), width=w)
        # 塔顶聚光球
        img = Image.alpha_composite(img, glow(s, top[0], top[1] - 4, 8, WHITE, 200, blur=5))
        img = Image.alpha_composite(img, glow(s, top[0], top[1] - 4, 13, CORE_GLOW, 110, blur=8))
    elif attack == "13":
        # 三棱镜被点亮，折射出彩虹光束向上射出
        img = Image.alpha_composite(img, glow(s, top[0], top[1] - 6, 10, WHITE, 230, blur=4))
        # 彩虹光束：从塔顶向上散开
        for i, col in enumerate(RAINBOW):
            off = (i - 3) * 1.6
            x1 = top[0] + off * 0.5
            y1 = top[1] - 3
            x2 = top[0] + off * 2.2
            y2 = top[1] - 28
            d.line([(x1, y1), (x2, y2)], fill=with_alpha(col, 180), width=2)
        # 底部也泛出彩虹光晕
        img = Image.alpha_composite(img, glow(s, bm[0], bm[1], 10, RAINBOW[4], 90, blur=7))

    return img


# ── 子弹（小型双锥晶体，尖头朝上，引擎旋转后朝飞行方向） ──
def make_bullet(w, h, level):
    img = canvas((w, h))
    cx, cy = w * 0.5, h * 0.5
    size = 6 + level * 1.5

    # 双锥：上尖 - 中宽 - 下尖（竖直放置，旋转后尖头朝前）
    points = [
        (cx, cy - size * 1.1),      # 上尖
        (cx + size * 0.75, cy),     # 右中
        (cx, cy + size * 1.1),      # 下尖
        (cx - size * 0.75, cy),     # 左中
    ]
    d = ImageDraw.Draw(img)
    # 右亮面
    d.polygon([points[0], points[1], points[2]], fill=with_alpha(CRYSTAL_LIGHT, 220))
    # 左暗面
    d.polygon([points[0], points[3], points[2]], fill=with_alpha(CRYSTAL_DARK, 200))
    # 中竖脊线
    d.line([points[0], points[2]], fill=with_alpha(WHITE, 200), width=1)
    # 外轮廓
    d.line(points + [points[0]], fill=with_alpha(CRYSTAL_EDGE, 230), width=1)

    # 彩虹高光（等级越高越明显）
    hue = RAINBOW[(level * 2) % len(RAINBOW)]
    img = Image.alpha_composite(img, glow((w, h), int(cx + size * 0.3), int(cy - size * 0.3), 3, hue, 180, blur=2))
    # 外发光
    img = Image.alpha_composite(img, glow((w, h), int(cx), int(cy), size + 3, CORE_GLOW, 90, blur=5))
    return img


# ── 命中（彩虹折射星爆） ───────────────────────────────
def make_hit(frame):
    s = 72
    img = canvas(s)
    cx, cy = s // 2, s // 2
    spread = 1.0 if frame == 1 else 1.45
    img = Image.alpha_composite(img, glow(s, cx, cy, 10 * spread, WHITE, 220, blur=4))
    d = ImageDraw.Draw(img)
    n = len(RAINBOW)
    for i, col in enumerate(RAINBOW):
        ang = math.radians(i * (360 / n) + frame * 15)
        for k in range(3):
            a2 = ang + math.radians((k - 1) * 18)
            dist = (15 + frame * 10) * spread
            px = cx + math.cos(a2) * dist
            py = cy + math.sin(a2) * dist
            sz = 3 + frame
            d.polygon([(px, py - sz), (px + sz, py), (px, py + sz), (px - sz, py)],
                      fill=with_alpha(col, 200))
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=with_alpha(WHITE, 255))
    return img


# ── 减速覆盖层（半透明棱镜光环，套敌人身上） ────────────
def make_slow():
    s = 80
    img = canvas(s)
    cx, cy = s // 2, s // 2
    img = Image.alpha_composite(img, glow(s, cx, cy, 30, CRYSTAL_MID, 45, blur=12))
    d = ImageDraw.Draw(img)
    # 彩虹环
    n = len(RAINBOW)
    for i, col in enumerate(RAINBOW):
        a0 = math.radians(i * (360 / n))
        a1 = math.radians((i + 1) * (360 / n))
        pts = []
        steps = 6
        for j in range(steps + 1):
            a = a0 + (a1 - a0) * j / steps
            pts.append((cx + math.cos(a) * 28, cy + math.sin(a) * 28))
        for j in range(steps):
            d.line([pts[j], pts[j + 1]], fill=with_alpha(col, 170), width=3)
    # 中心三棱镜小图标
    tri = [(cx, cy - 10), (cx - 9, cy + 6), (cx + 9, cy + 6)]
    d.polygon(tri, fill=with_alpha(CRYSTAL_LIGHT, 90))
    d.polygon(tri, outline=with_alpha(WHITE, 180), width=1)
    d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=with_alpha(WHITE, 160))
    return img


def main():
    backup()
    # 底座
    for lv in (1, 2, 3):
        save(make_base(lv), os.path.join(TOWER_DIR, f"prism_base_lv{lv}.png"))
    # 待机塔身
    for lv in (1, 2, 3):
        save(make_body(lv), os.path.join(TOWER_DIR, f"prism_lv{lv}.png"))
    # 攻击帧
    for lv in (1, 2, 3):
        save(make_body(lv, "12"), os.path.join(TOWER_DIR, f"prism_attack_{lv}2.png"))
        save(make_body(lv, "13"), os.path.join(TOWER_DIR, f"prism_attack_{lv}3.png"))
    # 子弹
    save(make_bullet(55, 58, 1), os.path.join(BULLET_DIR, "prism.png"))
    for lv, sz in ((1, 48), (2, 48), (3, 48)):
        save(make_bullet(sz, sz, lv), os.path.join(BULLET_DIR, f"prism_{lv}1.png"))
    # 命中
    save(make_hit(1), os.path.join(EFFECT_DIR, "prism_hit_01.png"))
    save(make_hit(2), os.path.join(EFFECT_DIR, "prism_hit_02.png"))
    # 减速层
    save(make_slow(), os.path.join(EFFECT_DIR, "prism_slow.png"))
    print("ALL PRISM ASSETS REGENERATED")


if __name__ == "__main__":
    main()
