#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_scene_assets.py —— 程序生成「明亮卡通冒险风」选关页 + 场景素材（自绘）。
贴合新主题（奇幻世界地图卡通风）：奶油/木质 + 草木绿 + 深棕描边 + 金色点缀。

分组：
  1) 选关页（Art/UI/）：panel_level_card, star_full, star_empty, star_secret,
     lock, diff_1..diff_5
  2) 场景素材：
     - Art/UI/  : cell_empty, cell_path, cell_tower_spot,
                  obstacle_big, obstacle_big_b2,
                  obstacle_small_01/02/03, obstacle_chest_small, obstacle_chest_big,
                  obstacle_wide_01/02/03
     - Art/Road/ : road_straight_h/v, road_corner_NE/NW/SE/SW,
                  road_T_N/S/E/W, road_cross, road_end_N/S/E/W, road_single

输出到 out/scene_assets/ 并预览；同时按同名覆盖到资源目录（保留 .meta / uuid）。
"""
import os, math, shutil
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.path.join(ROOT, 'out', 'scene_assets')
os.makedirs(OUT, exist_ok=True)
PREVIEW = os.path.join(OUT, 'preview.html')

UI_DIR = os.path.join(ROOT, 'assets', 'resources', 'Art', 'UI')
ROAD_DIR = os.path.join(ROOT, 'assets', 'resources', 'Art', 'Road')
os.makedirs(UI_DIR, exist_ok=True)
os.makedirs(ROAD_DIR, exist_ok=True)

# ── 调色板（与 gen_ui_kit.py 统一）──
INK = (74, 52, 30)
CREAM = (245, 232, 198)
CREAM_HI = (255, 250, 236)
WOOD = (176, 128, 78)
WOOD_D = (132, 92, 56)
GOLD = (246, 202, 98)
GOLD_HI = (255, 236, 180)
GOLD_TX = (150, 104, 24)

# 草地
GRASS_TOP = (152, 200, 106)
GRASS_BOT = (104, 164, 78)
GRASS_EDGE = (70, 120, 54)
GRASS_TUFT = (86, 146, 64)
# 泥土路
DIRT_TOP = (210, 174, 118)
DIRT_BOT = (178, 140, 92)
DIRT_EDGE = (120, 90, 60)
DIRT_HI = (236, 214, 170)
# 岩石
ROCK_TOP = (176, 172, 168)
ROCK_BOT = (126, 122, 120)
ROCK_EDGE = (70, 66, 64)
ROCK_HI = (220, 216, 212)
ROCK2_TOP = (160, 172, 158)
ROCK2_BOT = (112, 130, 116)
# 宝箱
CHEST_WOOD = (176, 120, 70)
CHEST_WOOD_D = (120, 80, 46)
CHEST_BAND = (240, 200, 96)


def get_font(sz):
    for p in (r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\arial.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def a(c, al):
    return (c[0], c[1], c[2], al)


def new(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def vgrad(w, h, c1, c2):
    img = Image.new('RGBA', (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b, 255)
    return img


def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def save(img, name, dest_dir=None):
    out = os.path.join(OUT, name)
    img.save(out)
    if dest_dir:
        # 同名覆盖（保留 .meta / uuid）
        shutil.copy(out, os.path.join(dest_dir, name))
    return name


# ── 草地瓦片 ──
def grass_tile(size=140):
    img = vgrad(size, size, GRASS_TOP, GRASS_BOT)
    d = ImageDraw.Draw(img)
    # 零星草丛（确定性分布，避免每格随机跳动）
    for (gx, gy, s) in [(22, 30, 1), (96, 26, 1), (60, 64, 1),
                        (30, 96, 1), (108, 100, 1), (78, 112, 1),
                        (50, 40, 1), (120, 60, 1)]:
        d.line([(gx, gy), (gx - 3 * s, gy - 8 * s)], fill=a(GRASS_TUFT, 160), width=2)
        d.line([(gx, gy), (gx + 3 * s, gy - 8 * s)], fill=a(GRASS_TUFT, 160), width=2)
        d.line([(gx, gy), (gx, gy - 10 * s)], fill=a(GRASS_TUFT, 160), width=2)
    # 极淡的内边，给出格子感（不喧宾夺主）
    rr(d, (1, 1, size - 2, size - 2), 6, outline=a(GRASS_EDGE, 26), width=1)
    return img


# ── 道路瓦片（草地底 + 泥土带，按方向连接，无缝拼接）──
def road_tile(dirs, size=140):
    img = grass_tile(size)
    d = ImageDraw.Draw(img)
    cx = cy = size // 2
    W = int(size * 0.46)          # 路带宽
    edge = W + 10
    half_e, half_f = edge / 2, W / 2

    def band(d2, w2, col):
        for dn in dirs:
            if dn == 'N':
                d2.rectangle([cx - w2, 0, cx + w2, cy], fill=col)
            elif dn == 'S':
                d2.rectangle([cx - w2, cy, cx + w2, size], fill=col)
            elif dn == 'E':
                d2.rectangle([cx, cy - w2, size, cy + w2], fill=col)
            elif dn == 'W':
                d2.rectangle([0, cy - w2, cx, cy + w2], fill=col)
        d2.ellipse([cx - w2, cy - w2, cx + w2, cy + w2], fill=col)

    band(d, half_e, a(DIRT_EDGE, 255))   # 路缘（深泥）
    band(d, half_f, a(DIRT_TOP, 255))    # 路面
    # 顶部高光（细）
    d.rectangle([cx - half_f + 3, cy - half_f + 3, cx + half_f - 3, cy - half_f + 7], fill=a(DIRT_HI, 200))
    return img


# ── 岩石 ──
def rock(size, top, bot, seed=0):
    img = new(size, size)
    d = ImageDraw.Draw(img)
    cx = cy = size // 2
    rx = size * 0.40 + (seed % 2) * 6
    ry = size * 0.34 + ((seed // 2) % 2) * 6
    # 阴影
    d.ellipse([cx - rx * 0.9, cy + ry * 0.5, cx + rx * 0.9, cy + ry * 1.05], fill=a((40, 50, 40), 60))
    # 主体（圆润多变形）
    pts = []
    n = 9
    for i in range(n):
        ang = i * 2 * math.pi / n + seed * 0.3
        jitter = 0.82 + 0.18 * ((i * 7 + seed * 3) % 5) / 4
        px = cx + math.cos(ang) * rx * jitter
        py = cy + math.sin(ang) * ry * jitter
        pts.append((px, py))
    d.polygon(pts, fill=a(bot, 255), outline=a(ROCK_EDGE, 255), width=4)
    # 高光块
    d.polygon([(cx - rx * 0.4, cy - ry * 0.3), (cx + rx * 0.1, cy - ry * 0.55),
               (cx + rx * 0.35, cy - ry * 0.1), (cx - rx * 0.1, cy + ry * 0.1)],
              fill=a(ROCK_HI, 150))
    # 斑点
    for (sx, sy) in [(-rx * 0.25, ry * 0.2), (rx * 0.3, ry * 0.35), (0, -ry * 0.15)]:
        d.ellipse([cx + sx - 5, cy + sy - 5, cx + sx + 5, cy + sy + 5], fill=a(top, 130))
    return img


# ── 宝箱 ──
def chest(size, big=False):
    img = new(size, size)
    d = ImageDraw.Draw(img)
    cx = size // 2
    w = int(size * 0.74)
    h = int(size * 0.56)
    x0 = cx - w // 2
    y0 = size // 2 - h // 2 + (10 if big else 6)
    # 阴影
    d.ellipse([x0 + 6, y0 + h - 6, x0 + w - 6, y0 + h + 14], fill=a((40, 50, 40), 60))
    # 箱体
    rr(d, (x0, y0 + h * 0.32, x0 + w, y0 + h), int(h * 0.18), fill=a(CHEST_WOOD, 255),
       outline=a(INK, 255), width=4)
    # 箱盖
    rr(d, (x0, y0, x0 + w, y0 + h * 0.5), int(h * 0.28), fill=a(CHEST_WOOD_D, 255),
       outline=a(INK, 255), width=4)
    # 金带
    band = int(w * 0.12)
    d.rectangle([x0 + w * 0.5 - band / 2, y0, x0 + w * 0.5 + band / 2, y0 + h], fill=a(CHEST_BAND, 255))
    d.rectangle([x0 + band * 0.5, y0, x0 + band * 1.6, y0 + h], fill=a(CHEST_BAND, 255))
    d.rectangle([x0 + w - band * 1.6, y0, x0 + w - band * 0.5, y0 + h], fill=a(CHEST_BAND, 255))
    # 锁
    lw = int(w * 0.18)
    d.rounded_rectangle([cx - lw / 2, y0 + h * 0.34, cx + lw / 2, y0 + h * 0.7],
                        int(lw * 0.3), fill=a(GOLD, 255), outline=a(INK, 255), width=3)
    d.ellipse([cx - 4, y0 + h * 0.46, cx + 4, y0 + h * 0.54], fill=a(INK, 255))
    # 高光
    rr(d, (x0 + 6, y0 + 4, x0 + w - 6, y0 + int(h * 0.18)), int(h * 0.1), fill=a(CREAM_HI, 110))
    return img


# ── 星级 ──
def star_poly(d, cx, cy, r, fill, outline, width=3):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.46
        pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
    d.polygon(pts, fill=fill, outline=outline, width=width)


def make_star_full(sz=64):
    img = new(sz, sz)
    d = ImageDraw.Draw(img)
    star_poly(d, sz // 2, sz // 2, sz * 0.42, a(GOLD, 255), a(INK, 255), 4)
    star_poly(d, sz // 2, sz // 2, sz * 0.24, a(GOLD_HI, 220), None, 0)
    return img


def make_star_empty(sz=64):
    img = new(sz, sz)
    d = ImageDraw.Draw(img)
    star_poly(d, sz // 2, sz // 2, sz * 0.42, a((223, 214, 188), 255), a(INK, 255), 4)
    star_poly(d, sz // 2, sz // 2, sz * 0.24, a((240, 234, 216), 255), a(WOOD, 200), 2)
    return img


def make_star_secret(sz=64):
    img = new(sz, sz)
    d = ImageDraw.Draw(img)
    # 神秘紫星 + 白问号
    star_poly(d, sz // 2, sz // 2, sz * 0.42, a((124, 96, 168), 255), a(INK, 255), 4)
    f = get_font(int(sz * 0.6))
    cx = sz // 2
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2)]:
        d.text((cx + dx, sz // 2 - 2 + dy), '?', font=f, fill=a((86, 64, 120), 255), anchor='mm')
    d.text((cx, sz // 2 - 2), '?', font=f, fill=a(CREAM_HI, 255), anchor='mm')
    return img


# ── 锁 ──
def make_lock(sz=64):
    img = new(sz, sz)
    d = ImageDraw.Draw(img)
    cx = sz // 2
    # 锁梁
    d.arc([cx - 16, 6, cx + 16, 40], 180, 360, fill=a(INK, 255), width=7)
    # 锁体
    bw, bh = 46, 38
    rr(d, (cx - bw // 2, 28, cx + bw // 2, 28 + bh), 8, fill=a(GOLD, 255),
       outline=a(INK, 255), width=4)
    rr(d, (cx - bw // 2 + 5, 31, cx + bw // 2 - 5, 28 + 14), 5, fill=a(GOLD_HI, 160))
    # 锁孔
    d.ellipse([cx - 6, 44, cx + 6, 56], fill=a(INK, 255))
    d.rectangle([cx - 3, 50, cx + 3, 60], fill=a(INK, 255))
    return img


# ── 难度徽章 ──
def make_diff(n, sz=64):
    tier = [(106, 176, 92), (150, 190, 90), (230, 190, 80), (230, 140, 70), (220, 90, 80)][n - 1]
    img = new(sz, sz)
    d = ImageDraw.Draw(img)
    r = sz * 0.42
    cx = cy = sz // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=a(tier, 255), outline=a(INK, 255), width=4)
    d.ellipse([cx - r + 4, cy - r + 4, cx + r - 4, cy - r + 10], fill=a(CREAM_HI, 90))
    f = get_font(int(sz * 0.52))
    # 浅色描边 + 深棕数字，确保在亮黄/亮绿盘上也清晰
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2)]:
        d.text((cx + dx, cy + 1 + dy), str(n), font=f, fill=a(CREAM_HI, 255), anchor='mm')
    d.text((cx, cy + 1), str(n), font=f, fill=a(INK, 255), anchor='mm')
    return img


# ── 选关卡片 ──
def make_level_card(w=260, h=340):
    img = new(w, h)
    d = ImageDraw.Draw(img)
    body = vgrad(w, h, (250, 240, 212), (234, 212, 170))
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), 22, fill=255)
    out = new(w, h)
    out.paste(body, (0, 0), mask)
    img = out
    d = ImageDraw.Draw(img)
    rr(d, (2, 2, w - 3, h - 3), 22, outline=a(INK, 255), width=4)
    rr(d, (8, 8, w - 9, h - 9), 18, outline=a(WOOD, 255), width=3)
    # 顶部高光
    rr(d, (14, 12, w - 15, 12 + int(h * 0.12)), 12, fill=a(CREAM_HI, 140))
    # 缩略图区占位框（奶油底）
    rr(d, (22, 26, w - 23, 26 + 180), 14, fill=a((236, 224, 196), 255), outline=a(WOOD, 255), width=3)
    # 四角木质铆钉
    for (px, py) in ((20, 20), (w - 20, 20), (20, h - 20), (w - 20, h - 20)):
        d.ellipse([px - 7, py - 7, px + 7, py + 7], fill=a(WOOD, 255), outline=a(INK, 255), width=2)
        d.ellipse([px - 3, py - 3, px + 1, py + 1], fill=a(CREAM_HI, 160))
    # 底部名牌条
    rr(d, (22, h - 70, w - 23, h - 30), 12, fill=a(CREAM, 255), outline=a(WOOD, 255), width=3)
    return img


# ── 塔位格 ──
def make_tower_spot(size=140):
    img = grass_tile(size)
    d = ImageDraw.Draw(img)
    cx = cy = size // 2
    r = size * 0.34
    # 虚线圆环（木质）
    seg = 28
    for i in range(seg):
        if i % 2 == 0:
            a0 = i * 360 / seg
            a1 = (i + 1) * 360 / seg
            d.arc([cx - r, cy - r, cx + r, cy + r], a0, a1, fill=a(WOOD, 220), width=5)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=a(INK, 90), width=2)
    # 中心 "+"（建造提示）
    d.line([cx - 12, cy, cx + 12, cy], fill=a(WOOD_D, 200), width=5)
    d.line([cx, cy - 12, cx, cy + 12], fill=a(WOOD_D, 200), width=5)
    return img


# ── 通用路径块（cell_path 兜底）──
def make_path_patch(size=140):
    img = grass_tile(size)
    d = ImageDraw.Draw(img)
    m = int(size * 0.10)
    rr(d, (m, m, size - m, size - m), int(size * 0.22), fill=a(DIRT_TOP, 255),
       outline=a(DIRT_EDGE, 255), width=5)
    rr(d, (m + 6, m + 6, size - m - 6, m + 14), int(size * 0.1), fill=a(DIRT_HI, 180))
    return img


def main():
    names = []

    # ── 1) 选关页 ──
    names.append(save(make_level_card(), 'panel_level_card.png', UI_DIR))
    names.append(save(make_star_full(), 'star_full.png', UI_DIR))
    names.append(save(make_star_empty(), 'star_empty.png', UI_DIR))
    names.append(save(make_star_secret(), 'star_secret.png', UI_DIR))
    names.append(save(make_lock(), 'lock.png', UI_DIR))
    for n in range(1, 6):
        names.append(save(make_diff(n), f'diff_{n}.png', UI_DIR))

    # ── 2) 场景：格子瓦片（Art/UI）──
    names.append(save(grass_tile(), 'cell_empty.png', UI_DIR))
    names.append(save(make_path_patch(), 'cell_path.png', UI_DIR))
    names.append(save(make_tower_spot(), 'cell_tower_spot.png', UI_DIR))

    # ── 2) 场景：障碍（Art/UI）──
    names.append(save(rock(140, ROCK_TOP, ROCK_BOT, 0), 'obstacle_small_01.png', UI_DIR))
    names.append(save(rock(140, ROCK2_TOP, ROCK2_BOT, 1), 'obstacle_small_02.png', UI_DIR))
    names.append(save(rock(140, ROCK_TOP, ROCK_BOT, 2), 'obstacle_small_03.png', UI_DIR))
    names.append(save(rock(280, ROCK_TOP, ROCK_BOT, 3), 'obstacle_big.png', UI_DIR))
    names.append(save(rock(280, ROCK2_TOP, ROCK2_BOT, 4), 'obstacle_big_b2.png', UI_DIR))
    names.append(save(rock(280, ROCK_TOP, ROCK_BOT, 1), 'obstacle_wide_01.png', UI_DIR))
    names.append(save(rock(280, ROCK2_TOP, ROCK2_BOT, 2), 'obstacle_wide_02.png', UI_DIR))
    names.append(save(rock(280, ROCK_TOP, ROCK_BOT, 3), 'obstacle_wide_03.png', UI_DIR))
    names.append(save(chest(140, False), 'obstacle_chest_small.png', UI_DIR))
    names.append(save(chest(280, True), 'obstacle_chest_big.png', UI_DIR))

    # ── 2) 场景：道路方向瓦片（Art/Road）──
    road_specs = {
        'road_straight_h': ['E', 'W'],
        'road_straight_v': ['N', 'S'],
        'road_corner_NE': ['N', 'E'],
        'road_corner_NW': ['N', 'W'],
        'road_corner_SE': ['S', 'E'],
        'road_corner_SW': ['S', 'W'],
        'road_T_N': ['S', 'E', 'W'],
        'road_T_S': ['N', 'E', 'W'],
        'road_T_E': ['N', 'S', 'W'],
        'road_T_W': ['N', 'S', 'E'],
        'road_cross': ['N', 'S', 'E', 'W'],
        'road_end_N': ['N'],
        'road_end_S': ['S'],
        'road_end_E': ['E'],
        'road_end_W': ['W'],
        'road_single': [],
    }
    for k, dirs in road_specs.items():
        names.append(save(road_tile(dirs), k + '.png', ROAD_DIR))

    print('generated:', len(names), 'files')
    print('UI ->', UI_DIR)
    print('Road ->', ROAD_DIR)

    # ── 预览 HTML ──
    sections = [
        ('选关页', ['panel_level_card', 'star_full', 'star_empty', 'star_secret', 'lock'] +
         [f'diff_{n}' for n in range(1, 6)]),
        ('格子瓦片', ['cell_empty', 'cell_path', 'cell_tower_spot']),
        ('障碍', ['obstacle_small_01', 'obstacle_small_02', 'obstacle_small_03',
                  'obstacle_big', 'obstacle_big_b2', 'obstacle_wide_01',
                  'obstacle_wide_02', 'obstacle_wide_03',
                  'obstacle_chest_small', 'obstacle_chest_big']),
        ('道路', list(road_specs.keys())),
    ]
    rows = ''
    for title, items in sections:
        rows += f'<h2>{title}</h2><div class="wrap">'
        for it in items:
            fp = f'{it}.png'
            rows += (f'<div class="c"><div class="ib"><img src="{fp}"></div>'
                     f'<div class="l">{it}</div></div>\n')
        rows += '</div>'
    html = f'''<!doctype html><html><head><meta charset="utf-8">
<title>明亮卡通冒险风 · 选关页 + 场景素材 预览</title>
<style>
body{{font-family:'Microsoft YaHei',sans-serif;background:#8fc2e8;color:#2c2418;margin:0;padding:22px}}
h1{{color:#3a2c18}} h2{{color:#3a2c18;margin-top:24px}}
.wrap{{display:flex;flex-wrap:wrap;gap:10px}}
.c{{background:rgba(255,255,255,.4);border:1px solid #b98;border-radius:12px;padding:10px;
  width:120px;text-align:center}}
.ib{{height:96px;display:flex;align-items:center;justify-content:center;background:
  linear-gradient(#bfe0a0,#9cc97e);border-radius:8px}}
.c img{{max-width:110px;max-height:90px}} .l{{font-weight:700;margin-top:6px;color:#3a2c18;font-size:13px}}
</style></head><body>
<h1>明亮卡通冒险风 · 选关页 + 场景素材（预览）</h1>
<p>已按同名覆盖到 assets/resources/Art/UI 与 Art/Road（.meta / uuid 不变，运行时经 SpriteManager 自动生效）。</p>
{rows}
</body></html>'''
    with open(PREVIEW, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print('preview ->', PREVIEW)


if __name__ == '__main__':
    main()
