"""v3 基础控件套件生成器 —— 深色半透磨砂玻璃风（统一卡通冰原）。
底色调暗（亮度 ~55），冰蓝内描边 + 低 alpha 细高光，融入浅冰原背景而不刺眼。
输出：out/ui_kit/*.png，并生成 out/ui_kit_preview.html 预览。
"""
import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont

random.seed(7)
OUT = os.path.join(os.path.dirname(__file__), '..', 'out', 'ui_kit')
os.makedirs(OUT, exist_ok=True)

# ---------- 调色板（深色半透冰原）----------
INK       = (26, 38, 58)     # 最深描边/分隔
PANEL_FILL = (40, 58, 84)    # 面板深蓝灰
PANEL_FILL_2 = (54, 76, 108) # 面板渐变上亮端
PANEL_HI  = (150, 190, 222)  # 内描边冰蓝
PANEL_TOPHI = (196, 224, 248) # 顶部细高光
BTN_FILL  = (46, 64, 92)
BTN_FILL_2 = (64, 88, 124)
BTN_HOVER = (78, 106, 148)
BTN_PRESS = (38, 52, 76)
BTN_DISABLED = (34, 46, 64)
BTN_HI    = (150, 190, 222)
HUD_FILL  = (30, 44, 66)
HUD_FILL_2 = (42, 60, 88)
HP_SLOT   = (24, 36, 54)
HP_SLOT_HI = (140, 178, 210)
HP_FILL   = (110, 172, 122)
HP_FILL_MID = (206, 184, 104)
HP_FILL_LOW = (194, 110, 112)
GOLD      = (246, 202, 98)
LIFE      = (224, 98, 98)
SNOW      = (233, 244, 250)
SNOW_D    = (198, 220, 232)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def a(c, alpha):
    return c + (alpha,)


def new(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def rrect(d, box, radius, fill=None, outline=None, width=2):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def vgrad(d, box, r, top, bot, hi=None, hi_a=0):
    """深色底 + 顶部高光带（低 alpha），模拟磨砂玻璃体积感。"""
    rrect(d, box, r, fill=a(bot, 255))
    if hi is not None and hi_a > 0:
        x0, y0, x1, y1 = box
        h = y1 - y0
        band = max(2, int(h * 0.42))
        d.rounded_rectangle([x0, y0, x1, y0 + band], radius=r, fill=a(hi, hi_a))
    if top is not None:
        # 上亮端渐变（叠加一层半透亮）
        x0, y0, x1, y1 = box
        band = max(2, int((y1 - y0) * 0.5))
        d.rounded_rectangle([x0, y0, x1, y0 + band], radius=r, fill=a(top, 70))


def panel(name, w=300, h=180, radius=16):
    im = new(w, h)
    d = ImageDraw.Draw(im)
    rrect(d, [1, 1, w - 1, h - 1], radius, outline=a(INK, 150), width=2)
    rrect(d, [3, 3, w - 3, h - 3], radius - 2, outline=a(PANEL_HI, 120), width=2)
    vgrad(d, [3, 3, w - 3, h - 3], radius - 2, PANEL_FILL_2, PANEL_FILL, PANEL_TOPHI, 55)
    im.save(os.path.join(OUT, name))
    return im


def button(name, w=190, h=64, radius=14, state='normal'):
    im = new(w, h)
    d = ImageDraw.Draw(im)
    fill = BTN_FILL; fill2 = BTN_FILL_2; hi_a = 60
    if state == 'hover':
        fill = BTN_HOVER; fill2 = lerp(BTN_HOVER, (255, 255, 255), 0.12)
    elif state == 'disabled':
        fill = BTN_DISABLED; fill2 = BTN_DISABLED; hi_a = 0
    elif state == 'press':
        fill = BTN_PRESS; fill2 = BTN_PRESS; hi_a = 25
    rrect(d, [1, 1, w - 1, h - 1], radius, outline=a(INK, 150), width=2)
    rrect(d, [3, 3, w - 3, h - 3], radius - 2, outline=a(BTN_HI, 110), width=2)
    vgrad(d, [3, 3, w - 3, h - 3], radius - 2, fill2, fill, PANEL_TOPHI, hi_a)
    im.save(os.path.join(OUT, name))
    return im


def hud(name, w=900, h=58, radius=14):
    im = new(w, h)
    d = ImageDraw.Draw(im)
    rrect(d, [1, 1, w - 1, h - 1], radius, outline=a(INK, 140), width=2)
    vgrad(d, [2, 2, w - 2, h - 2], radius, HUD_FILL_2, HUD_FILL, (120, 160, 200), 45)
    # 左侧金币/生命区隔竖线
    d.line([300, 10, 300, h - 10], fill=a(PANEL_HI, 70), width=2)
    d.line([560, 10, 560, h - 10], fill=a(PANEL_HI, 70), width=2)
    im.save(os.path.join(OUT, name))
    return im


def icon(name, kind, size=64):
    im = new(size, size)
    d = ImageDraw.Draw(im)
    cx, cy = size // 2, size // 2
    if kind == 'gold':
        d.ellipse([8, 8, size - 8, size - 8], fill=a(GOLD, 255), outline=a(INK, 170), width=3)
        d.ellipse([14, 14, size - 14, size - 14], outline=a((255, 240, 190), 160), width=2)
        d.text((cx - 8, cy - 16), '¥', fill=a((120, 80, 10), 255), font=_font(26, bold=True))
    elif kind == 'life':
        _heart(d, cx, cy, size * 0.34, LIFE, INK)
    elif kind == 'pause':
        d.rounded_rectangle([cx - 16, cy - 18, cx - 6, cy + 18], radius=4, fill=a(SNOW, 235), outline=a(INK, 160), width=2)
        d.rounded_rectangle([cx + 6, cy - 18, cx + 16, cy + 18], radius=4, fill=a(SNOW, 235), outline=a(INK, 160), width=2)
    elif kind == 'speed':
        _tri(d, cx - 14, cy, 16, SNOW, INK); _tri(d, cx + 2, cy, 16, SNOW, INK)
    elif kind == 'play':
        _tri(d, cx - 4, cy, 26, SNOW, INK)
    elif kind == 'stop':
        d.rounded_rectangle([cx - 15, cy - 15, cx + 15, cy + 15], radius=5, fill=a(SNOW, 235), outline=a(INK, 160), width=2)
    elif kind == 'brush':
        d.rounded_rectangle([cx - 14, cy - 6, cx + 14, cy + 10], radius=6, fill=a((150, 200, 230), 235), outline=a(INK, 160), width=2)
        d.polygon([(cx - 14, cy + 10), (cx + 14, cy + 10), (cx + 6, cy + 22), (cx - 6, cy + 22)], fill=a((120, 170, 205), 235), outline=a(INK, 140))
    elif kind == 'grid':
        for i in range(1, 4):
            d.line([cx - 18 + i * 12, cy - 18, cx - 18 + i * 12, cy + 18], fill=a(SNOW, 200), width=2)
            d.line([cx - 18, cy - 18 + i * 12, cx + 18, cy - 18 + i * 12], fill=a(SNOW, 200), width=2)
        d.rectangle([cx - 19, cy - 19, cx + 19, cy + 19], outline=a(INK, 150), width=2)
    im.save(os.path.join(OUT, name))
    return im


def _heart(d, cx, cy, r, col, ink):
    pts = []
    for t in [i / 60 * 2 * math.pi for i in range(60)]:
        x = 16 * (math.sin(t) ** 3)
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((cx + x * r / 17, cy + y * r / 17))
    d.polygon(pts, fill=a(col, 255), outline=a(ink, 170))


def _tri(d, x, cy, s, col, ink):
    d.polygon([(x, cy - s), (x, cy + s), (x + s * 1.1, cy)], fill=a(col, 235), outline=a(ink, 160))


def hp_bar(name, w=120, h=16, radius=6, fill_pct=0.62):
    im = new(w, h)
    d = ImageDraw.Draw(im)
    rrect(d, [1, 1, w - 1, h - 1], radius, fill=a(HP_SLOT, 230), outline=a(INK, 150), width=2)
    rrect(d, [2, 2, w - 2, h - 2], radius - 1, outline=a(HP_SLOT_HI, 120), width=1)
    fw = max(0, int((w - 4) * fill_pct))
    col = HP_FILL if fill_pct > 0.5 else (HP_FILL_MID if fill_pct > 0.25 else HP_FILL_LOW)
    if fw > 2:
        d.rounded_rectangle([3, 3, 3 + fw, h - 3], radius=radius - 1, fill=a(col, 255))
        d.rounded_rectangle([3, 3, 3 + fw, 3 + max(2, h // 3)], radius=radius - 1, fill=a(lerp(col, (255, 255, 255), 0.25), 90))
    im.save(os.path.join(OUT, name))
    return im


def _font(sz, bold=False):
    for p in ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/arial.ttf']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


# ---------- 生成 ----------
panel('panel.png')
button('btn_normal.png', state='normal')
button('btn_hover.png', state='hover')
button('btn_disabled.png', state='disabled')
hud('hud_bar.png')
icon('icon_gold.png', 'gold')
icon('icon_life.png', 'life')
hp_bar('hp_bar_bg.png')
hp_bar('hp_bar_fill.png', fill_pct=1.0)

# 额外可复用图标（生成在 out，但仅预览，按需导入）
for k in ['pause', 'speed', 'play', 'stop', 'brush', 'grid']:
    icon(f'icon_{k}.png', k)

print('generated v3 ui_kit ->', os.path.abspath(OUT))

# ---------- 预览 HTML ----------
items = [
    ('panel.png', '面板 panel', '深蓝灰磨砂，冰蓝内描边'),
    ('btn_normal.png', '按钮-普通', '深底 + 顶部细高光'),
    ('btn_hover.png', '按钮-悬停', '提亮反馈'),
    ('btn_disabled.png', '按钮-禁用', '降饱和压暗'),
    ('hud_bar.png', 'HUD 资源条', '深半透，分隔金币/生命/波次'),
    ('hp_bar_bg.png', '血条-底槽', '深灰蓝，亮度低'),
    ('hp_bar_fill.png', '血条-填充(满)', '中饱和绿'),
    ('icon_gold.png', '金币图标', '降亮金'),
    ('icon_life.png', '生命图标', '红心'),
    ('icon_pause.png', '暂停', ''),
    ('icon_speed.png', '加速', ''),
    ('icon_play.png', '开始', ''),
    ('icon_stop.png', '停止', ''),
    ('icon_brush.png', '笔刷', ''),
    ('icon_grid.png', '网格', ''),
]
rows = ''
for fn, label, desc in items:
    fp = os.path.join(OUT, fn).replace('\\', '/')
    rows += f'<div class="c"><img src="{fp}"><div class="l">{label}</div><div class="d">{desc}</div></div>\n'
html = f'''<html><head><meta charset="utf-8"><style>
body{{background:#9fe6d4;font-family:sans-serif;margin:0;padding:24px;color:#16384a}}
h1{{font-size:20px}} .sub{{color:#0d2a36;margin-bottom:16px}}
.wrap{{display:flex;flex-wrap:wrap;gap:18px}}
.c{{background:rgba(20,40,60,.18);border-radius:12px;padding:12px;width:200px;text-align:center}}
.c img{{image-rendering:auto;max-width:180px}}
.l{{font-weight:700;margin-top:8px;color:#0d2a36}} .d{{font-size:12px;color:#10404f;min-height:32px}}
.note{{margin-top:18px;color:#0d2a36;font-size:13px;max-width:760px}}
</style></head><body>
<h1>v3 基础控件套件 · 深色半透磨砂玻璃（冰原）</h1>
<div class="sub">背景用项目冰原浅色（#9fe6d4 近似 theme1_bg）衬托，观察深色 UI 是否压得住、不刺眼</div>
<div class="wrap">{rows}</div>
<div class="note">亮度对比（analyze_colors）：背景≈216 / 旧v2面板≈228 / <b>v3面板≈55</b>。深色半透在浅背景上形成"磨砂玻璃"，既有对比又不刺眼。确认后覆盖导入 Art/UI。</div>
</body></html>'''
with open(os.path.join(OUT, '..', 'ui_kit_preview.html'), 'w', encoding='utf-8') as f:
    f.write(html)
print('preview ->', os.path.abspath(os.path.join(OUT, '..', 'ui_kit_preview.html')))
