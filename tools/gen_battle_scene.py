"""重做战斗内三张核心素材 v3（方舟几何风）：
   radish(120x120)         -> 方形「蓝色防御点」：盾牌标志 + 蓝框辉光
   spawn_marker(112x112)   -> 方形「红色出怪口」：警告三角(⚠) + 红框辉光
   level_bg(1920x1080)     -> 深色战场背景（去圆形元素，仅直线网格+底部直带+暗角）
配套预览 battle_scene_preview.html。
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFilter

ART = 'D:/code/tower-defense/assets/resources/Art/UI'
OUT = 'D:/code/tower-defense/out/battle_scene'
os.makedirs(OUT, exist_ok=True)


def vgrad(w, h, top, bot):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (w, y)], fill=c)
    return img


def vignette(img, strength=0.45):
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse([-int(w * 0.05), -int(h * 0.05), int(w * 1.05), int(h * 1.05)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(200))
    inv = Image.eval(mask, lambda p: 255 - p)
    dark = Image.new('RGBA', (w, h), (0, 0, 0, int(150 * strength)))
    dark.putalpha(inv)
    return Image.alpha_composite(img, dark)


def chamfer(cx, cy, half, ch):
    """倒角正方形（八边形）顶点列表，营造方舟切角科技框。"""
    x0, x1 = cx - half, cx + half
    y0, y1 = cy - half, cy + half
    return [(x0 + ch, y0), (x1 - ch, y0), (x1, y0 + ch), (x1, y1 - ch),
            (x1 - ch, y1), (x0 + ch, y1), (x0, y1 - ch), (x0, y0 + ch)]


def square_halo(img, cx, cy, color, sizes):
    """以倒角方形描边做辉光层（外淡内浓）。"""
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    r, g, b = color[:3]
    for half, ch, a in sizes:
        ImageDraw.Draw(layer).polygon(chamfer(cx, cy, half, ch),
                                      outline=(r, g, b, a), fill=(0, 0, 0, 0))
    return Image.alpha_composite(img, layer)


def gen_radish():
    """方形蓝色防御点：蓝切角框 + 方形辉光 + 中心盾牌标志。"""
    S = 120
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    cx = cy = S // 2
    # 方形辉光（外淡内浓）
    img = square_halo(img, cx, cy, (90, 175, 255),
                      [(58, 16, 35), (53, 14, 70), (48, 12, 110)])
    d = ImageDraw.Draw(img)
    # 外框
    d.polygon(chamfer(cx, cy, 52, 15), fill=(14, 24, 42, 255), outline=(80, 150, 200, 255))
    # 内面板
    d.polygon(chamfer(cx, cy, 43, 11), fill=(9, 16, 30, 255))
    # 切角高光
    d.line([(cx - 40, cy - 30), (cx - 30, cy - 40)], fill=(120, 190, 240, 180), width=2)
    d.line([(cx + 40, cy - 30), (cx + 30, cy - 40)], fill=(120, 190, 240, 180), width=2)
    # 盾牌标志（上置醒目）
    sx, sy, hw, top, bot = cx, cy + 1, 17, cy - 20, cy + 22
    shield = [(sx - hw, top), (sx + hw, top), (sx + hw, cy + 2), (sx, bot), (sx - hw, cy + 2)]
    d.polygon(shield, fill=(70, 160, 245, 255), outline=(150, 215, 255, 255))
    # 盾牌内高光
    hw2 = 10
    shield2 = [(sx - hw2, top + 6), (sx + hw2, top + 6), (sx + hw2, cy - 2), (sx, bot - 7), (sx - hw2, cy - 2)]
    d.polygon(shield2, fill=(150, 215, 255, 255))
    d.polygon(shield2, outline=(220, 245, 255, 230))
    img.save(os.path.join(OUT, 'radish.png'))


def gen_spawn():
    """方形红色出怪口：红切角框 + 方形辉光 + 中心警告三角(⚠)。"""
    S = 112
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    cx = cy = S // 2
    img = square_halo(img, cx, cy, (255, 95, 80),
                      [(55, 15, 35), (50, 13, 70), (45, 11, 110)])
    d = ImageDraw.Draw(img)
    d.polygon(chamfer(cx, cy, 50, 14), fill=(34, 12, 16, 255), outline=(200, 80, 80, 255))
    d.polygon(chamfer(cx, cy, 41, 10), fill=(24, 10, 14, 255))
    d.line([(cx - 38, cy - 28), (cx - 28, cy - 38)], fill=(235, 130, 120, 180), width=2)
    d.line([(cx + 38, cy - 28), (cx + 28, cy - 38)], fill=(235, 130, 120, 180), width=2)
    # 警告三角(⚠)
    tw = 20
    tri = [(cx, cy - 20), (cx + tw, cy + 16), (cx - tw, cy + 16)]
    d.polygon(tri, fill=(230, 60, 55, 255), outline=(255, 170, 150, 255))
    # 感叹号
    d.rectangle([cx - 3, cy - 12, cx + 3, cy + 4], fill=(255, 240, 230, 255))
    d.ellipse([cx - 4, cy + 9, cx + 4, cy + 17], fill=(255, 240, 230, 255))
    img.save(os.path.join(OUT, 'spawn_marker.png'))


def gen_level_bg():
    """第一章 · 平原类生物群系背景（草地）。
    低饱和草绿渐变 + 稀疏草点纹理 + 浅土色网格 + 顶部天光柔带 + 底部柔和沉降，
    统一为自然草原调，不刺眼、不突兀。"""
    w, h = 1920, 1080
    # 草地纵向渐变：顶部受光略亮、底部略沉
    img = vgrad(w, h, (104, 156, 92), (66, 116, 68))
    d = ImageDraw.Draw(img)
    # 草地细纹理：稀疏浅色草点（极低透明），避免纯色死板
    random.seed(7)
    for _ in range(1100):
        x = random.randint(0, w)
        y = random.randint(0, h)
        d.point((x, y), fill=(150, 192, 126, random.randint(8, 22)))
    # 直线网格（浅草/土色，低透明，与草地统一）
    step = 64
    for x in range(0, w, step):
        d.line([(x, 0), (x, h)], fill=(120, 160, 104, 22))
    for y in range(0, h, step):
        d.line([(0, y), (w, y)], fill=(120, 160, 104, 22))
    # 顶部天光柔带（草原与天际交接，渐变无硬边）
    top = Image.new('RGBA', (w, 240), (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    for y in range(240):
        t = 1 - y / 240
        td.line([(0, y), (w, y)], fill=(186, 218, 168, int(38 * t)))
    img.paste(top, (0, 0), top)
    # 底部柔和沉降（渐变，无硬边），制造纵深
    band = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bh = 240
    for y in range(h - bh, h):
        t = (y - (h - bh)) / bh
        bd.line([(0, y), (w, y)], fill=(38, 72, 44, int(92 * t)))
    img = Image.alpha_composite(img, band)
    # 暗角收敛柔和，避免四角过暗显突兀
    img = vignette(img, 0.22)
    img.save(os.path.join(OUT, 'level_bg.png'))


def gen_preview():
    bg = Image.open(os.path.join(OUT, 'level_bg.png')).convert('RGBA').resize((1000, 562))
    radish = Image.open(os.path.join(OUT, 'radish.png')).convert('RGBA').resize((170, 170))
    spawn = Image.open(os.path.join(OUT, 'spawn_marker.png')).convert('RGBA').resize((160, 160))
    canvas = Image.new('RGBA', (1000, 562), (12, 18, 30, 255))
    canvas.alpha_composite(bg, (0, 0))
    canvas.alpha_composite(spawn, (150, 200))
    canvas.alpha_composite(radish, (415, 196))
    canvas.save(os.path.join(OUT, 'battle_scene_preview.png'))

    html = """<!doctype html><html><head><meta charset="utf-8">
<style>body{background:#0b1018;color:#cfe2f2;font-family:system-ui,Segoe UI,Arial;margin:0;padding:24px}
h2{color:#7fd0ff;font-weight:600} .row{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;margin:18px 0}
.card{background:#121c2c;border:1px solid #25394f;border-radius:10px;padding:14px;text-align:center}
.card img{display:block} .lab{margin-top:8px;color:#9fb6cc;font-size:13px}
.bg{display:block;border:1px solid #25394f;border-radius:10px;max-width:100%%}</style></head>
<body>
<h2>战斗内核心素材 v3（方舟几何风）</h2>
<img class="bg" src="battle_scene_preview.png">
<div class="row">
  <div class="card"><img src="radish.png" width="160"><div class="lab">radish · 蓝色防御点(盾牌)</div></div>
  <div class="card"><img src="spawn_marker.png" width="150"><div class="lab">spawn_marker · 红色出怪口(警告)</div></div>
  <div class="card"><img src="level_bg.png" width="300"><div class="lab">level_bg · 战场背景(1920x1080)</div></div>
</div>
</body></html>"""
    with open(os.path.join(OUT, 'battle_scene_preview.html'), 'w', encoding='utf-8') as f:
        f.write(html)


if __name__ == '__main__':
    gen_radish()
    gen_spawn()
    gen_level_bg()
    gen_preview()
    print('battle_scene assets ->', OUT)
