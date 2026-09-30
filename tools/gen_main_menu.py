"""生成主菜单素材：奇幻世界地图复刻（同一大陆划分 7 群系，海洋环绕）。
配色对齐游戏暗色主题（墨绿/森林低饱和调），避免与暗色 UI 冲突。
产物：
  out/main_menu/main_menu_bg.png  —— 世界地图：海洋/山地/森林/湿地/平原/干旱/洞穴
  out/main_menu/title_main.png    —— 标题艺术字（透明底，仅预览用）
  out/main_menu_preview.html       —— 组合预览
按钮复用现有 btn_normal/hover（runtime 加字），本脚本不重复画按钮。
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

random.seed(11)
OUT = os.path.join(os.path.dirname(__file__), '..', 'out', 'main_menu')
os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080


def font(sz):
    from PIL import ImageFont
    for p in ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/arial.ttf']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def vgrad(w, h, top, bot):
    img = Image.new('RGBA', (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        col = (int(top[0] + (bot[0] - top[0]) * t),
               int(top[1] + (bot[1] - top[1]) * t),
               int(top[2] + (bot[2] - top[2]) * t), 255)
        for x in range(w):
            px[x, y] = col
    return img


# ---------- 大陆轮廓（径向噪声生成有机形状）----------
CCX, CCY, RX, RY = 1000, 440, 860, 430


def _contour(scale=1.0, dy=0.0):
    pts = []
    n = 240
    for i in range(n):
        a = 2 * math.pi * i / n
        r = (1 + 0.10 * math.sin(3 * a + 0.7) + 0.06 * math.sin(5 * a + 2.3)
             + 0.04 * math.sin(8 * a + 1.1) - 0.05 * math.cos(2 * a + 0.4))
        pts.append((CCX + RX * scale * r * math.cos(a),
                    CCY + RY * scale * r * math.sin(a) + dy))
    return pts


CONT = _contour()


def _ell(cx, cy, rx, ry):
    return [cx - rx, cy - ry, cx + rx, cy + ry]


# ---------- 群系装饰 ----------
def _pine(d, x, baseY, s):
    d.rectangle([x - s * 0.06, baseY - s * 0.5, x + s * 0.06, baseY], fill=(96, 68, 42))
    for i in range(3):
        top = baseY - s * (0.5 + i * 0.45)
        bot = baseY - s * (0.08 + i * 0.45)
        hw = s * (0.44 - i * 0.09)
        d.polygon([(x, top), (x - hw, bot), (x + hw, bot)], fill=(58, 110, 70), outline=(40, 86, 54))


def _snow_mtn(d, x, baseY, w, h):
    d.polygon([(x - w, baseY), (x, baseY - h), (x + w, baseY)],
              fill=(128, 122, 116), outline=(98, 92, 86))
    d.polygon([(x - w * 0.24, baseY - h * 0.7), (x, baseY - h), (x + w * 0.24, baseY - h * 0.7),
               (x + w * 0.12, baseY - h * 0.64), (x, baseY - h * 0.76), (x - w * 0.12, baseY - h * 0.64)],
              fill=(214, 222, 222))


def _house(d, x, baseY, s):
    d.rectangle([x - s, baseY - s * 0.9, x + s, baseY], fill=(226, 220, 200), outline=(170, 162, 144))
    d.polygon([(x - s * 1.2, baseY - s * 0.9), (x, baseY - s * 1.55), (x + s * 1.2, baseY - s * 0.9)],
              fill=(170, 84, 66), outline=(132, 62, 48))
    d.rectangle([x - s * 0.22, baseY - s * 0.52, x + s * 0.22, baseY], fill=(120, 92, 62))
    d.rectangle([x - s * 0.72, baseY - s * 0.78, x - s * 0.42, baseY - s * 0.5], fill=(140, 180, 196))


def _tower(d, x, baseY, s):
    d.rectangle([x - s * 0.7, baseY - s * 2.2, x + s * 0.7, baseY], fill=(176, 178, 182), outline=(136, 138, 144))
    for k in range(3):
        bx = x - s * 0.7 + k * s * 0.5
        d.rectangle([bx, baseY - s * 2.5, bx + s * 0.3, baseY - s * 2.2], fill=(160, 162, 168), outline=(130, 132, 138))
    d.rectangle([x - s * 0.22, baseY - s * 1.35, x + s * 0.22, baseY - s * 1.0], fill=(66, 72, 90))


def _river(d, pts, w0, w1):
    for i in range(len(pts) - 1):
        t = i / max(1, len(pts) - 1)
        d.line([pts[i], pts[i + 1]], fill=(70, 140, 176), width=int(w0 + (w1 - w0) * t), joint='curve')
    for i in range(len(pts) - 1):
        t = i / max(1, len(pts) - 1)
        d.line([pts[i], pts[i + 1]], fill=(118, 182, 206), width=max(2, int((w0 + (w1 - w0) * t) * 0.4)))


def _lake(d, cx, cy, rx, ry):
    d.ellipse(_ell(cx, cy, rx + 7, ry + 7), fill=(120, 180, 206))
    d.ellipse(_ell(cx, cy, rx, ry), fill=(70, 140, 176))


def _reed(d, x, y):
    for dx in (-5, 0, 5):
        d.line([(x + dx, y), (x + dx * 1.3, y - 26)], fill=(104, 134, 72), width=3)
        d.ellipse([x + dx * 1.3 - 4, y - 32, x + dx * 1.3 + 4, y - 24], fill=(168, 154, 96))


def _cactus(d, x, y, s):
    d.rounded_rectangle([x - s * 0.12, y - s, x + s * 0.12, y], 6, fill=(82, 140, 84), outline=(54, 104, 60))
    d.rounded_rectangle([x - s * 0.4, y - s * 0.7, x - s * 0.12, y - s * 0.3], 7, fill=(82, 140, 84), outline=(54, 104, 60))
    d.rounded_rectangle([x + s * 0.12, y - s * 0.78, x + s * 0.4, y - s * 0.38], 7, fill=(82, 140, 84), outline=(54, 104, 60))


def _dune(d, cx, cy, w, h):
    d.arc([cx - w, cy - h, cx + w, cy + h], 200, 340, fill=(182, 162, 116), width=6)
    d.arc([cx - w * 0.7, cy - h * 0.5, cx + w * 0.7, cy + h * 0.6], 200, 340, fill=(190, 170, 124), width=5)


def _pyramid(d, cx, baseY, w, h):
    d.polygon([(cx - w, baseY), (cx, baseY - h), (cx + w, baseY)], fill=(190, 170, 124), outline=(166, 148, 104))
    d.polygon([(cx, baseY - h), (cx + w, baseY), (cx, baseY)], fill=(178, 158, 114))


def _rock(d, x, y, s):
    d.polygon([(x - s, y), (x - s * 0.5, y - s * 1.1), (x + s * 0.3, y - s * 0.9), (x + s, y)],
              fill=(150, 132, 100), outline=(124, 104, 76))


def _cave(d, cx, cy, w, h):
    d.ellipse(_ell(cx, cy, w, h), fill=(104, 86, 66), outline=(76, 60, 46))
    d.ellipse(_ell(cx, cy + h * 0.1, w * 0.52, h * 0.6), fill=(34, 28, 24))


def _flower(d, x, y):
    d.ellipse([x - 3, y - 7, x + 3, y - 1], fill=(206, 200, 140))


def harmonize(img):
    """轻微降饱和 + 用游戏墨绿调统一，避免与暗色 UI 冲突。"""
    g = img.convert('RGB').convert('L').convert('RGBA')
    img = Image.blend(img, g, 0.08)            # 压 8% 饱和度
    return img


def vignette(img, strength):
    w, h = img.size
    mask = Image.new('L', (w, h), 255)
    md = ImageDraw.Draw(mask)
    md.ellipse([-int(w * 0.12), -int(h * 0.12), int(w * 1.12), int(h * 1.12)],
               fill=int(255 * (1 - strength)))
    mask = mask.filter(ImageFilter.GaussianBlur(int(min(w, h) * 0.12)))
    dark = Image.new('RGBA', (w, h), (14, 25, 15, 255))   # 对齐游戏暗角墨绿
    return Image.composite(img, dark, mask)


def _biome_blobs(gd):
    gd.ellipse(_ell(410, 390, 320, 235), fill=(118, 116, 108))   # 山地（灰岩）
    gd.ellipse(_ell(380, 690, 250, 165), fill=(100, 86, 66))     # 洞穴岩地
    gd.ellipse(_ell(720, 190, 340, 190), fill=(80, 126, 82))     # 森林
    gd.ellipse(_ell(920, 430, 360, 235), fill=(108, 150, 88))    # 平原
    gd.ellipse(_ell(900, 730, 400, 200), fill=(120, 150, 92))    # 湿地
    gd.ellipse(_ell(1460, 430, 450, 360), fill=(182, 164, 118))  # 沙漠（压暗去荧光）


def _details(d):
    # 雪山
    for (x, by, w, h) in [(330, 540, 150, 300), (470, 560, 130, 240), (210, 516, 110, 200)]:
        _snow_mtn(d, x, by, w, h)
    # 松林
    random.seed(3)
    for _ in range(60):
        _pine(d, random.randint(470, 985), random.randint(110, 335), random.randint(34, 60))
    # 河流 + 湖泊
    _river(d, [(1015, 70), (985, 170), (1035, 270), (965, 370), (1005, 470), (935, 570), (905, 660)], 9, 20)
    _lake(d, 900, 705, 150, 92)
    _lake(d, 640, 748, 80, 52)
    _lake(d, 1080, 762, 70, 46)
    # 芦苇
    random.seed(5)
    for _ in range(95):
        _reed(d, random.randint(560, 1220), random.randint(640, 850))
    # 平原野花
    random.seed(7)
    for _ in range(170):
        _flower(d, random.randint(660, 1140), random.randint(360, 620))
    # 村落 + 塔
    _house(d, 860, 470, 34)
    _house(d, 952, 440, 30)
    _house(d, 912, 524, 26)
    _tower(d, 1010, 96, 30)
    # 沙漠：沙丘 + 仙人掌 + 金字塔
    for (cx, cy, w, h) in [(1400, 300, 180, 60), (1620, 480, 220, 70), (1300, 560, 160, 54), (1500, 690, 200, 64)]:
        _dune(d, cx, cy, w, h)
    for (x, y, s) in [(1240, 470, 60), (1360, 560, 70), (1500, 420, 55), (1620, 610, 66), (1180, 620, 50), (1560, 300, 48)]:
        _cactus(d, x, y, s)
    _pyramid(d, 1400, 560, 92, 82)
    _pyramid(d, 1560, 620, 70, 60)
    # 洞穴
    _cave(d, 360, 680, 190, 130)
    # 散石
    random.seed(13)
    for _ in range(26):
        _rock(d, random.randint(230, 1740), random.randint(130, 820), random.randint(14, 30))


def gen_bg():
    # 海洋底（压暗、降饱和的钢蓝，贴合暗色主题）
    img = vgrad(W, H, (42, 84, 110), (70, 122, 150))
    d = ImageDraw.Draw(img)
    for yy in range(40, H, 58):
        d.line([(x, yy + 8 * math.sin(x / 72.0)) for x in range(0, W, 12)], fill=(120, 176, 204, 48), width=3)
    # 浅海环（由外到内渐亮，整体偏暗）
    d.polygon(_contour(1.16), fill=(66, 126, 156))
    d.polygon(_contour(1.08), fill=(92, 158, 190))
    # 海岸崖（下移的暗色带，形成 3D 海岸）
    d.polygon(_contour(1.02, 22), fill=(104, 82, 56))
    # 陆地群系（软边）
    ground = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(ground)
    gd.polygon(_contour(1.0), fill=(156, 146, 112))   # 基底：海岸沙（去荧光）
    _biome_blobs(gd)
    ground = ground.filter(ImageFilter.GaussianBlur(7))
    img = Image.alpha_composite(img, ground)
    # 细节层（裁剪到陆地内）
    det = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    _details(ImageDraw.Draw(det))
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(_contour(1.0), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(4))
    det.putalpha(ImageChops.multiply(det.getchannel('A'), m))
    img = Image.alpha_composite(img, det)
    # 海岸泡沫线
    foam = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(foam).polygon(_contour(1.0), outline=(228, 238, 232, 130), width=6)
    img = Image.alpha_composite(img, foam.filter(ImageFilter.GaussianBlur(2)))
    return vignette(harmonize(img), 0.20)


def gen_title():
    img = Image.new('RGBA', (960, 260), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(120)
    text = '塔防保卫战'
    cx, cy = 480, 130
    for dx in range(-3, 4):
        for dy in range(-3, 4):
            if dx or dy:
                d.text((cx, cy), text, font=f, fill=(58, 78, 44, 255), anchor='mm')
    d.text((cx, cy), text, font=f, fill=(226, 236, 214, 255), anchor='mm')
    d.text((cx, cy - 4), text, font=f, fill=(240, 246, 230, 150), anchor='mm')
    return img


bg = gen_bg()
bg.save(os.path.join(OUT, 'main_menu_bg.png'))
title = gen_title()
title.save(os.path.join(OUT, 'title_main.png'))
print('generated ->', os.path.abspath(OUT))

# ---- 预览 ----
bg_b = os.path.join(OUT, 'main_menu_bg.png').replace('\\', '/')
title_b = os.path.join(OUT, 'title_main.png').replace('\\', '/')
btn = os.path.join(os.path.dirname(__file__), '..', 'out', 'ui_kit', 'btn_normal.png').replace('\\', '/')
btn_h = os.path.join(os.path.dirname(__file__), '..', 'out', 'ui_kit', 'btn_hover.png').replace('\\', '/')
html = f'''<html><head><meta charset="utf-8"><style>
body{{margin:0;background:#10160f;font-family:sans-serif;color:#dfe8d8}}
.stage{{position:relative;width:1280px;height:720px;margin:20px auto;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px #2a3a22}}
.stage img.bg{{position:absolute;inset:0;width:100%;height:100%}}
.stage img.title{{position:absolute;left:50%;top:60px;transform:translateX(-50%);width:520px}}
.start{{position:absolute;left:50%;top:430px;transform:translateX(-50%);width:300px}}
.small{{position:absolute;top:600px;width:150px}}
.s1{{left:500px}} .s2{{left:660px}}
.cap{{text-align:center;color:#9cc;font-size:13px;margin-top:8px}}
</style></head><body>
<div class="stage">
  <img class="bg" src="{bg_b}">
  <img class="title" src="{title_b}">
  <img class="start" src="{btn}"><div class="cap" style="position:absolute;left:50%;top:452px;transform:translateX(-50%);color:#f2f7ea;font-weight:700">开始游戏</div>
  <img class="small s1" src="{btn_h}"><div class="cap" style="position:absolute;left:500px;top:622px;color:#f2f7ea;font-size:12px">设置</div>
  <img class="small s2" src="{btn_h}"><div class="cap" style="position:absolute;left:660px;top:622px;color:#f2f7ea;font-size:12px">帮助</div>
</div>
<div class="cap">主菜单 7 群系世界地图复刻（墨绿暗色调和）—— 海洋/山地/森林/湿地/平原/干旱/洞穴 + 标题 + 按钮</div>
</body></html>'''
with open(os.path.join(OUT, '..', 'main_menu_preview.html'), 'w', encoding='utf-8') as f:
    f.write(html)
print('preview ->', os.path.abspath(os.path.join(OUT, '..', 'main_menu_preview.html')))
