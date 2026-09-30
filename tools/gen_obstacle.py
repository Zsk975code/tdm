"""复刻 out/obstacle_preview.html 的 canvas 绘制，导出真实冰原障碍 PNG。
映射（与预览 ITEMS 一致）：
  obstacle_small_01 = 树木 1x1
  obstacle_small_02 = 冰晶 1x1
  obstacle_small_03 = 小岩石 1x1
  obstacle_wide_01  = 针叶树篱 2x1
  obstacle_wide_02  = 中等岩石 2x1
  obstacle_wide_03  = 冰棱脊 2x1
  obstacle_big      = 雪堡 2x2
  obstacle_big_b2   = 雪松林丘 2x2
  obstacle_chest_small = 宝箱 1x1
  obstacle_chest_big   = 宝箱 2x2
输出 out/obstacle_kit/*.png
"""
import os, math
from PIL import Image, ImageDraw, ImageFilter

CELL = 56
OUT = os.path.join(os.path.dirname(__file__), '..', 'out', 'obstacle_kit')
os.makedirs(OUT, exist_ok=True)


def P(*v):
    return tuple(int(round(x)) for x in v)


def ell(d, cx, cy, rx, ry, **kw):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], **kw)


def poly(d, pts, **kw):
    d.polygon([P(*p) for p in pts], **kw)


def rng(s):
    x = math.sin(s * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)


def glow(size, cx, cy, r, color, alpha, blur=10):
    g = Image.new('RGBA', size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (alpha,))
    return g.filter(ImageFilter.GaussianBlur(blur))


def blob(cx, cy, r, seed, n=9, flat=1.0):
    pts = []
    for i in range(n):
        a = i / n * 2 * math.pi
        rr = r * (0.82 + 0.22 * rng(seed * 17 + i))
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * flat))
    return pts


# ---- 树木 1x1 ----
def draw_tree(img, ox, oy, c, seed):
    d = ImageDraw.Draw(img)
    cx, cy = ox + c / 2, oy + c / 2
    d.rectangle([cx - c * 0.07, cy + c * 0.02, cx + c * 0.07, cy + c * 0.36], fill=(131, 90, 50), outline=(94, 63, 34), width=2)
    for dx, dy, r in [(0, -0.10, 0.26), (-0.17, 0.01, 0.18), (0.17, 0.01, 0.18)]:
        ell(d, cx + dx * c, cy + dy * c, r * c, r * c, fill=(70, 168, 95), outline=(44, 107, 62), width=2)
    for dx, dy, r in [(0, -0.24, 0.13), (-0.15, -0.10, 0.08), (0.16, -0.07, 0.07)]:
        ell(d, cx + dx * c, cy + dy * c, r * c, r * c, fill=(238, 245, 251))


# ---- 冰晶 1x1 ----
def draw_ice(img, ox, oy, c, seed):
    cx, cy = ox + c / 2, oy + c / 2
    img.alpha_composite(glow(img.size, cx, cy, c * 0.42, (150, 210, 255), 120, 10))
    d = ImageDraw.Draw(img)
    poly(d, [(cx, cy - c * 0.34), (cx + c * 0.16, cy), (cx, cy + c * 0.34), (cx - c * 0.16, cy)],
         fill=(190, 230, 255, 235), outline=(234, 246, 255), width=2)
    d.rectangle([cx - c * 0.24, cy - c * 0.05, cx + c * 0.24, cy + c * 0.05], fill=(210, 240, 255, 230))
    poly(d, [(cx, cy - c * 0.22), (cx + c * 0.05, cy - c * 0.08), (cx, cy - c * 0.02), (cx - c * 0.05, cy - c * 0.08)], fill=(255, 255, 255))


# ---- 小岩石 1x1 ----
def draw_rock_c(img, ox, oy, c, seed):
    cx, cy = ox + c / 2, oy + c / 2 + c * 0.04
    d = ImageDraw.Draw(img)
    poly(d, blob(cx, cy, c * 0.40, seed), fill=(124, 147, 166), outline=(63, 80, 97), width=3)
    ell(d, cx, cy - c * 0.22, c * 0.30, c * 0.16, fill=(238, 245, 251))
    d.line([cx - c * 0.10, cy - c * 0.05, cx + c * 0.05, cy + c * 0.10], fill=(77, 95, 115), width=2)


# ---- 中等岩石 2x1 ----
def draw_rock_wide(img, ox, oy, W, H, seed):
    cx, cy = ox + W / 2, oy + H * 0.52
    d = ImageDraw.Draw(img)
    pts = blob(cx, cy, 0, seed)  # placeholder
    pts = []
    n = 10
    for i in range(n):
        a = i / n * 2 * math.pi
        rr = 0.85 + 0.15 * rng(seed * 7 + i)
        pts.append((cx + math.cos(a) * W * 0.42 * rr, cy + math.sin(a) * H * 0.38 * rr))
    poly(d, pts, fill=(124, 147, 166), outline=(63, 80, 97), width=3)
    ell(d, cx, cy - H * 0.22, W * 0.34, H * 0.14, fill=(238, 245, 251))


# ---- 针叶树篱 2x1 ----
def draw_hedge(img, ox, oy, W, H, seed):
    d = ImageDraw.Draw(img)
    ell(d, ox + W / 2, oy + H * 0.90, W * 0.46, H * 0.10, fill=(233, 241, 248))
    baseY = oy + H * 0.60
    n = 5
    for i in range(n):
        ell(d, ox + W * (i + 0.5) / n, baseY, H * 0.30, H * 0.30, fill=(63, 157, 82), outline=(44, 107, 62), width=2)
    for i in range(n - 1):
        ell(d, ox + W * (i + 1) / n, baseY - H * 0.12, H * 0.22, H * 0.22, fill=(63, 157, 82), outline=(44, 107, 62), width=2)
    d.rectangle([ox + W * 0.12, baseY + H * 0.20, ox + W * 0.88, baseY + H * 0.40], fill=(122, 82, 48))
    for i in range(n):
        ell(d, ox + W * (i + 0.5) / n, baseY - H * 0.24, H * 0.15, H * 0.15, fill=(238, 245, 251))
    for i in range(n - 1):
        ell(d, ox + W * (i + 1) / n, baseY - H * 0.34, H * 0.10, H * 0.10, fill=(238, 245, 251))


# ---- 冰棱脊 2x1 ----
def draw_ice_ridge(img, ox, oy, W, H, seed):
    cx = ox + W / 2
    img.alpha_composite(glow(img.size, cx, oy + H * 0.6, W * 0.5, (150, 210, 255), 90, 12))
    d = ImageDraw.Draw(img)
    pts = [(ox + W * 0.04, oy + H * 0.9)]
    peaks = 4
    for i in range(0, peaks + 1):
        x = ox + W * (i + 0.5) / peaks
        h = (0.55 if i % 2 else 0.85)
        pts.append((x, oy + H * 0.9 - H * h * 0.7))
        pts.append((x + (W / peaks) * 0.5, oy + H * 0.9 - H * 0.15))
    pts.append((ox + W * 0.96, oy + H * 0.9))
    poly(d, pts, fill=(190, 230, 255, 235), outline=(234, 246, 255), width=2)
    for i in range(peaks):
        x = ox + W * (i + 0.5) / peaks
        ell(d, x, oy + H * 0.9 - H * 0.4, 2.5, 2.5, fill=(255, 255, 255))


# ---- 雪松单棵 ----
def draw_pine(img, cx, baseY, w, h, seed):
    d = ImageDraw.Draw(img)
    for i in range(3):
        topY = baseY - h * (0.35 + i * 0.30)
        botY = baseY - h * (i * 0.30)
        hw = w * (1 - i * 0.22)
        poly(d, [(cx, topY), (cx + hw, botY), (cx - hw, botY)], fill=(63, 157, 82), outline=(44, 107, 62), width=2)
    d.rectangle([cx - w * 0.06, baseY - h * 0.05, cx + w * 0.06, baseY + h * 0.18], fill=(122, 82, 48))
    poly(d, [(cx, baseY - h * 0.62), (cx + w * 0.16, baseY - h * 0.45), (cx - w * 0.16, baseY - h * 0.45)], fill=(238, 245, 251))


# ---- 雪堡 2x2 ----
def draw_fort(img, ox, oy, W, H):
    d = ImageDraw.Draw(img)
    cx = ox + W / 2
    baseY = oy + H * 0.90
    ell(d, cx, baseY, W * 0.46, H * 0.08, fill=(233, 241, 248))
    bw = W * 0.60; bx = cx - bw / 2; by = oy + H * 0.34; bh = H * 0.52
    d.rectangle([bx, by, bx + bw, by + bh], fill=(207, 224, 239), outline=(138, 160, 182), width=3)
    merl = bw / 7
    for i in range(7):
        if i % 2 == 0:
            d.rectangle([bx + i * merl, by - merl * 0.9, bx + i * merl + merl, by], fill=(233, 241, 248))
    tw = W * 0.26; tx = cx - tw / 2; ty = oy + H * 0.18; th = H * 0.30
    d.rectangle([tx, ty, tx + tw, ty + th + merl], fill=(219, 233, 245), outline=(138, 160, 182), width=3)
    tm = tw / 4
    for i in range(4):
        if i % 2 == 0:
            d.rectangle([tx + i * tm, ty - tm * 0.9, tx + i * tm + tm, ty], fill=(233, 241, 248))
    d.line([cx, ty - tm, cx, ty - H * 0.10], fill=(107, 119, 135), width=2)
    poly(d, [(cx, ty - H * 0.10), (cx + W * 0.10, ty - H * 0.06), (cx, ty - H * 0.02)], fill=(231, 85, 79))
    for fx in (bx + bw * 0.16, bx + bw * 0.72):
        d.rectangle([fx, by + bh * 0.3, fx + bw * 0.12, by + bh * 0.3 + bh * 0.18], fill=(255, 224, 138), outline=(138, 160, 182), width=2)
    dr = bw * 0.12
    d.rectangle([cx - dr, by + bh * 0.55, cx + dr, by + bh], fill=(122, 82, 48), outline=(94, 58, 28), width=2)
    ell(d, cx, by + bh * 0.55, dr, dr, fill=(122, 82, 48), outline=(94, 58, 28), width=2)


# ---- 雪松林丘 2x2 ----
def draw_grove(img, ox, oy, W, H, seed):
    d = ImageDraw.Draw(img)
    poly(d, [(ox + W * 0.06, oy + H * 0.86), (ox + W * 0.5, oy + H * 0.16), (ox + W * 0.94, oy + H * 0.86)],
         fill=(223, 234, 245), outline=(174, 191, 208), width=2)
    ell(d, ox + W * 0.5, oy + H * 0.30, W * 0.30, H * 0.10, fill=(244, 249, 253))
    draw_pine(img, ox + W * 0.22, oy + H * 0.58, W * 0.20, H * 0.34, 1)
    draw_pine(img, ox + W * 0.50, oy + H * 0.46, W * 0.24, H * 0.46, 2)
    draw_pine(img, ox + W * 0.78, oy + H * 0.60, W * 0.18, H * 0.30, 3)


# ---- 宝箱（金袋） ----
def star(d, x, y, R, color):
    pts = []
    for i in range(8):
        a = i / 8 * 2 * math.pi
        rr = (R * 0.45 if i % 2 else R)
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    poly(d, pts, fill=color)


def draw_chest(img, ox, oy, c, seed):
    cx, cy = ox + c / 2, oy + c / 2
    rx, ry = c * 0.40, c * 0.40
    d = ImageDraw.Draw(img)
    ell(d, cx, cy + c * 0.06, rx, ry, fill=(230, 185, 78), outline=(138, 94, 24), width=3)
    poly(d, [(cx - rx * 0.8, cy - ry * 0.55), (cx, cy - ry * 1.15), (cx + rx * 0.8, cy - ry * 0.55),
             (cx + rx * 0.7, cy - ry * 0.35), (cx, cy - ry * 0.85), (cx - rx * 0.7, cy - ry * 0.35)],
         fill=(185, 126, 38), outline=(138, 94, 24), width=2)
    d.line([cx, cy - ry * 0.95, cx, cy + ry * 0.1], fill=(138, 94, 24), width=2)
    star(d, cx + rx * 0.25, cy + ry * 0.1, c * 0.10, (255, 243, 196))
    star(d, cx - rx * 0.35, cy + ry * 0.35, c * 0.07, (255, 243, 196))


# ---- 生成 ----
ITEMS = [
    ('obstacle_small_01', CELL, CELL, lambda im, x, y, w, h, s: draw_tree(im, x, y, CELL, s), 1),
    ('obstacle_small_02', CELL, CELL, lambda im, x, y, w, h, s: draw_ice(im, x, y, CELL, s), 2),
    ('obstacle_small_03', CELL, CELL, lambda im, x, y, w, h, s: draw_rock_c(im, x, y, CELL, s), 3),
    ('obstacle_wide_01', CELL * 2, CELL, lambda im, x, y, w, h, s: draw_hedge(im, x, y, w, h, s), 1),
    ('obstacle_wide_02', CELL * 2, CELL, lambda im, x, y, w, h, s: draw_rock_wide(im, x, y, w, h, s), 2),
    ('obstacle_wide_03', CELL * 2, CELL, lambda im, x, y, w, h, s: draw_ice_ridge(im, x, y, w, h, s), 3),
    ('obstacle_big', CELL * 2, CELL * 2, lambda im, x, y, w, h, s: draw_fort(im, x, y, w, h), 0),
    ('obstacle_big_b2', CELL * 2, CELL * 2, lambda im, x, y, w, h, s: draw_grove(im, x, y, w, h, s), 7),
    ('obstacle_chest_small', CELL, CELL, lambda im, x, y, w, h, s: draw_chest(im, x, y, CELL, s), 0),
    ('obstacle_chest_big', CELL * 2, CELL * 2, lambda im, x, y, w, h, s: draw_chest(im, x, y, CELL * 2, s), 0),
]

cards = ''
for fn, w, h, fnc, seed in ITEMS:
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    fnc(im, 0, 0, w, h, seed)
    im.save(os.path.join(OUT, fn + '.png'))
    cards += f'<div class="c"><img src="{os.path.join(OUT, fn + ".png").replace(chr(92), "/")}"><div class="l">{fn}</div></div>\n'
    print('gen', fn)

html = f'''<html><head><meta charset="utf-8"><style>
body{{background:#9fe6d4;font-family:sans-serif;padding:20px;color:#16384a}}
h1{{font-size:18px}} .wrap{{display:flex;flex-wrap:wrap;gap:16px;margin-top:14px}}
.c{{background:rgba(20,40,60,.15);border-radius:10px;padding:10px;text-align:center}}
.c img{{max-width:200px}} .l{{font-weight:700;margin-top:6px;color:#0d2a36;font-size:13px}}
</style></head><body><h1>冰原障碍 · 自绘复刻（gen_obstacle.py 导出，待导入）</h1>
<div class="wrap">{cards}</div></body></html>'''
with open(os.path.join(OUT, '..', 'obstacle_kit_preview.html'), 'w', encoding='utf-8') as f:
    f.write(html)
print('done ->', os.path.abspath(OUT))
