#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_ui_kit.py — 程序生成「明亮卡通冒险风」基础控件套件（自绘）。
贴合新主题（奇幻世界地图卡通风）：奶油/木质面板 + 草木绿按钮 + 奶白描边 + 金色点缀。
输出 PNG 到 out/ui_kit/，并生成预览 out/ui_kit_preview.html。
"""
import os, math
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'ui_kit')
os.makedirs(OUT, exist_ok=True)
PREVIEW = os.path.join(OUT, '..', 'ui_kit_preview.html')

# ── 明亮卡通冒险调色板 ──
INK = (74, 52, 30)            # 深棕描边
CREAM = (245, 232, 198)       # 奶油
CREAM_HI = (255, 250, 236)    # 高光
WOOD = (176, 128, 78)         # 木质边框
WOOD_D = (132, 92, 56)

PANEL_TOP = (250, 240, 212)
PANEL_BOT = (234, 212, 170)

BTN_TOP = (128, 190, 96)      # 草绿
BTN_BOT = (78, 138, 64)
BTN_H_TOP = (152, 206, 112)
BTN_H_BOT = (96, 162, 78)
BTN_BORDER = (236, 244, 212)
GREEN_TOP = (112, 196, 100)
GREEN_BOT = (62, 150, 74)
GREEN_BORDER = (238, 248, 214)
DIS_TOP = (200, 190, 170)
DIS_BOT = (172, 162, 142)
DIS_BORDER = (152, 144, 126)

GOLD = (246, 202, 98)
GOLD_HI = (255, 236, 180)
GOLD_TX = (150, 104, 24)
LIFE_TOP = (234, 98, 98)
LIFE_BOT = (196, 60, 74)

HP_SLOT = (84, 60, 40)
HP_SLOT_IN = (120, 92, 64)
HP_GREEN = (126, 196, 106)
HP_RED = (214, 96, 92)


def get_font(sz):
    for p in (r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\arial.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def vgrad(w, h, c1, c2):
    img = Image.new('RGBA', (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        col = (int(c1[0] + (c2[0] - c1[0]) * t), int(c1[1] + (c2[1] - c1[1]) * t),
               int(c1[2] + (c2[2] - c1[2]) * t), 255)
        for x in range(w):
            px[x, y] = col
    return img


def hgrad(w, h, c1, c2):
    img = Image.new('RGBA', (w, h))
    px = img.load()
    for x in range(w):
        t = x / max(1, w - 1)
        col = (int(c1[0] + (c2[0] - c1[0]) * t), int(c1[1] + (c2[1] - c1[1]) * t),
               int(c1[2] + (c2[2] - c1[2]) * t), 255)
        for y in range(h):
            px[x, y] = col
    return img


def a(c, al):
    return (c[0], c[1], c[2], al)


def new(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def grad_rect(w, h, r, top, bot):
    """圆角矩形渐变底（用于按钮/面板主体）。"""
    body = vgrad(w, h, top, bot)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255)
    out = new(w, h)
    out.paste(body, (0, 0), mask)
    return out


def save(img, name):
    img.save(os.path.join(OUT, name))
    return name


# ── 按钮 ──
def make_button(state):
    w, h, pad, r = 180, 60, 6, 16
    canvas = new(w + pad * 2, h + pad * 2)
    d = ImageDraw.Draw(canvas)
    if state == 'disabled':
        top, bot, border = DIS_TOP, DIS_BOT, DIS_BORDER
    elif state == 'green':
        top, bot, border = GREEN_TOP, GREEN_BOT, GREEN_BORDER
    elif state == 'hover':
        top, bot, border = BTN_H_TOP, BTN_H_BOT, BTN_BORDER
    else:
        top, bot, border = BTN_TOP, BTN_BOT, BTN_BORDER
    body = grad_rect(w, h, r, top, bot)
    canvas.paste(body, (pad, pad), body)
    d = ImageDraw.Draw(canvas)
    box = (pad, pad, pad + w, pad + h)
    # 外深棕描边 + 内奶白描边（卡通双描边）
    rr(d, (box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1), r + 1, outline=a(INK, 255), width=3)
    rr(d, box, r, outline=a(border, 255), width=3)
    # 顶部高光带 + 底部内阴影
    rr(d, (pad + 7, pad + 6, pad + w - 7, pad + int(h * 0.34)), r - 5, fill=a(CREAM_HI, 95))
    rr(d, (pad + 7, pad + h - 11, pad + w - 7, pad + h - 4), r - 5, fill=a(INK, 40))
    return save(canvas, f'btn_{state}.png')


# ── 面板 ──
def make_panel():
    w, h, r = 520, 340, 24
    img = grad_rect(w, h, r, PANEL_TOP, PANEL_BOT)
    d = ImageDraw.Draw(img)
    rr(d, (2, 2, w - 3, h - 3), r, outline=a(INK, 255), width=4)
    rr(d, (7, 7, w - 8, h - 8), r - 4, outline=a(WOOD, 255), width=3)
    rr(d, (13, 11, w - 14, 11 + int(h * 0.15)), r - 6, fill=a(CREAM_HI, 130))
    # 四角木质铆钉
    for cx, cy in ((24, 24), (w - 24, 24), (24, h - 24), (w - 24, h - 24)):
        d.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=a(WOOD, 255), outline=a(INK, 255), width=2)
        d.ellipse((cx - 3, cy - 3, cx + 1, cy + 1), fill=a(CREAM_HI, 160))
    return save(img, 'panel.png')


# ── HUD ──
def make_hud():
    w, h, r = 1000, 70, 20
    img = grad_rect(w, h, r, PANEL_TOP, PANEL_BOT)
    d = ImageDraw.Draw(img)
    rr(d, (2, 2, w - 3, h - 3), r, outline=a(INK, 255), width=4)
    rr(d, (7, 7, w - 8, h - 8), r - 4, outline=a(WOOD, 255), width=3)
    rr(d, (13, 8, w - 14, 8 + 12), r - 6, fill=a(CREAM_HI, 120))
    # 绿色饰条（左右）
    rr(d, (14, h // 2 - 6, 14 + 6, h // 2 + 6), 3, fill=a((110, 176, 92), 200))
    rr(d, (w - 20, h // 2 - 6, w - 14, h // 2 + 6), 3, fill=a((110, 176, 92), 200))
    return save(img, 'hud_bar.png')


# ── 血条 ──
def make_hp():
    w, h, r = 240, 22, 11
    bg = new(w, h)
    d = ImageDraw.Draw(bg)
    rr(d, (1, 1, w - 2, h - 2), r, fill=a(HP_SLOT, 255), outline=a(INK, 255), width=3)
    rr(d, (4, 4, w - 5, h - 5), r - 2, outline=a(HP_SLOT_IN, 220), width=1)
    save(bg, 'hp_bar_bg.png')

    fill = hgrad(w, h, HP_GREEN, HP_RED)
    fim = new(w, h)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((1, 1, w - 2, h - 2), r, fill=255)
    fim.paste(fill, (0, 0), mask)
    d = ImageDraw.Draw(fim)
    rr(d, (3, 3, w - 4, 3 + max(3, h // 3)), r - 3, fill=a((255, 255, 255), 80))
    rr(d, (1, 1, w - 2, h - 2), r, outline=a(INK, 255), width=3)
    return save(fim, 'hp_bar_fill.png')


# ── 图标 ──
def _star(d, cx, cy, r, col, outline, w=2):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.45
        pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
    d.polygon(pts, fill=col, outline=outline)


def _heart(d, cx, cy, r, fill, outline, bw=3):
    d.pieslice([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=fill)
    d.pieslice([cx, cy - r, cx + 2 * r, cy + r], 180, 360, fill=fill)
    d.polygon([(cx - r, cy + r // 3), (cx + 2 * r, cy + r // 3), (cx + r // 2, cy + 2 * r)], fill=fill)
    d.pieslice([cx - r, cy - r, cx + r, cy + r], 180, 360, outline=outline, width=bw)
    d.pieslice([cx, cy - r, cx + 2 * r, cy + r], 180, 360, outline=outline, width=bw)
    d.line([(cx - r, cy + r // 3), (cx + 2 * r, cy + r // 3)], fill=outline, width=bw)
    d.polygon([(cx - r, cy + r // 3), (cx + 2 * r, cy + r // 3), (cx + r // 2, cy + 2 * r)], outline=outline)


def _tri(d, pts, fill, outline, w=3):
    d.polygon(pts, fill=fill, outline=outline)


def make_icon(kind):
    s = 56
    img = new(s, s)
    d = ImageDraw.Draw(img)
    cx = cy = s // 2
    if kind == 'gold':
        d.ellipse((5, 5, s - 6, s - 6), fill=a(GOLD, 255), outline=a(INK, 255), width=3)
        d.ellipse((11, 11, s - 12, s - 12), outline=a(GOLD_HI, 255), width=3)
        _star(d, cx, cy, 13, a(GOLD_TX, 255), a(INK, 200), 2)
    elif kind == 'life':
        _heart(d, cx - 1, cy - 6, 16, a(LIFE_TOP, 255), a(INK, 255), 3)
        d.ellipse((cx - 12, cy - 16, cx - 4, cy - 8), fill=a((255, 220, 220), 150))
    elif kind == 'pause':
        rr(d, (cx - 15, cy - 17, cx - 5, cy + 17), 4, fill=a(CREAM, 255), outline=a(INK, 255), width=3)
        rr(d, (cx + 5, cy - 17, cx + 15, cy + 17), 4, fill=a(CREAM, 255), outline=a(INK, 255), width=3)
    elif kind == 'speed':
        _tri(d, [(cx - 17, cy - 15), (cx - 17, cy + 15), (cx - 2, cy)], a(CREAM, 255), a(INK, 255))
        _tri(d, [(cx + 2, cy - 15), (cx + 2, cy + 15), (cx + 17, cy)], a(CREAM, 255), a(INK, 255))
    elif kind in ('start', 'play'):
        _tri(d, [(cx - 12, cy - 17), (cx - 12, cy + 17), (cx + 16, cy)], a(CREAM, 255), a(INK, 255), 3)
    elif kind == 'stop':
        rr(d, (cx - 14, cy - 14, cx + 14, cy + 14), 6, fill=a(CREAM, 255), outline=a(INK, 255), width=3)
    elif kind == 'brush':
        rr(d, (cx - 6, cy - 20, cx + 6, cy + 2), 4, fill=a(WOOD, 255), outline=a(INK, 255), width=3)
        d.polygon([(cx - 10, cy + 2), (cx + 10, cy + 2), (cx + 6, cy + 20), (cx - 6, cy + 20)],
                  fill=a((122, 176, 104), 255), outline=a(INK, 255), width=3)
    elif kind == 'grid':
        rr(d, (cx - 18, cy - 18, cx + 18, cy + 18), 5, fill=a((246, 246, 240), 230), outline=a(INK, 255), width=3)
        for i in (1, 2):
            d.line([cx - 18 + i * 12, cy - 18, cx - 18 + i * 12, cy + 18], fill=a((120, 150, 110), 220), width=2)
            d.line([cx - 18, cy - 18 + i * 12, cx + 18, cy - 18 + i * 12], fill=a((120, 150, 110), 220), width=2)
    elif kind == 'path':
        for i, (dx, dy) in enumerate([(-16, 10), (-6, -2), (4, 8), (14, -4)]):
            d.ellipse((cx + dx - 5, cy + dy - 5, cx + dx + 5, cy + dy + 5),
                      fill=a(CREAM, 255), outline=a(INK, 255), width=2)
    elif kind == 'tower_spot':
        d.ellipse((6, 6, s - 6, s - 6), fill=a((246, 244, 236), 235), outline=a(INK, 255), width=3)
        rr(d, (cx - 4, cy - 14, cx + 4, cy + 14), 3, fill=a((110, 176, 92), 255))
        rr(d, (cx - 14, cy - 4, cx + 14, cy + 4), 3, fill=a((110, 176, 92), 255))
    elif kind == 'debug':
        d.ellipse((cx - 14, cy - 8, cx + 14, cy + 16), fill=a((120, 176, 96), 255), outline=a(INK, 255), width=3)
        d.line([(cx - 8, cy - 8), (cx - 14, cy - 18)], fill=a(INK, 255), width=3)
        d.line([(cx + 8, cy - 8), (cx + 14, cy - 18)], fill=a(INK, 255), width=3)
        d.ellipse((cx - 5, cy - 2, cx - 1, cy + 2), fill=a(INK, 255))
        d.ellipse((cx + 1, cy - 2, cx + 5, cy + 2), fill=a(INK, 255))
    elif kind == 'end':
        d.line([(cx - 10, cy - 18), (cx - 10, cy + 18)], fill=a(INK, 255), width=4)
        d.polygon([(cx - 9, cy - 17), (cx + 16, cy - 9), (cx - 9, cy - 1)],
                  fill=a((224, 92, 84), 255), outline=a(INK, 255), width=3)
    return save(img, f'icon_{kind}.png')


def main():
    names = []
    for st in ('normal', 'hover', 'disabled', 'green'):
        names.append(make_button(st))
    names.append(make_panel())
    names.append(make_hp())
    names.append(make_hud())
    for k in ('gold', 'life', 'pause', 'speed', 'start', 'stop', 'brush', 'grid',
              'path', 'tower_spot', 'debug', 'end'):
        names.append(make_icon(k))
    print('generated:', names)

    items = []
    for st, lb in [('normal', '普通'), ('hover', '悬停'), ('green', '正向动作'), ('disabled', '禁用')]:
        items.append((f'btn_{st}.png', f'按钮-{lb}', '草绿渐变 + 奶白描边'))
    items += [
        ('panel.png', '面板', '奶油/木质 + 深棕描边'),
        ('hud_bar.png', 'HUD 底栏', '奶油木质横条'),
        ('hp_bar_bg.png', '血条-底槽', '深棕槽 + 奶白描边'),
        ('hp_bar_fill.png', '血条-填充', '绿→红横向渐变'),
        ('icon_gold.png', '金币', '亮金圆币'),
        ('icon_life.png', '生命', '红心'),
        ('icon_pause.png', '暂停', ''), ('icon_speed.png', '加速', ''),
        ('icon_start.png', '开始', ''), ('icon_stop.png', '停止', ''),
        ('icon_brush.png', '笔刷', ''), ('icon_grid.png', '网格', ''),
        ('icon_path.png', '路径', ''), ('icon_tower_spot.png', '塔位', ''),
        ('icon_debug.png', '调试', ''), ('icon_end.png', '终点', ''),
    ]
    rows = ''
    for fn, label, desc in items:
        fp = os.path.join(OUT, fn).replace('\\', '/')
        rows += f'<div class="c"><div class="ib"><img src="{fp}"></div><div class="l">{label}</div><div class="d">{desc}</div></div>\n'
    html = f'''<!doctype html><html><head><meta charset="utf-8">
<title>明亮卡通冒险 UI · 基础控件套件 预览</title>
<style>
body{{font-family:'Microsoft YaHei',sans-serif;background:#8fc2e8;color:#2c2418;margin:0;padding:22px}}
h1{{color:#3a2c18}} h2{{color:#3a2c18;margin-top:24px}}
.card{{display:inline-block;background:rgba(255,255,255,.35);border:1px solid #b98;border-radius:12px;
  padding:12px;margin:8px;vertical-align:top;text-align:center}}
.card img{{display:block;margin:0 auto 6px}} .lbl{{font-size:12px;color:#5a4a30}}
.btnwrap{{position:relative;display:inline-block;margin:6px}}
.btnwrap span{{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);
  text-align:center;font-size:18px;font-weight:700;color:#fffdf5;text-shadow:0 2px 2px rgba(60,40,20,.6)}}
.wrap{{display:flex;flex-wrap:wrap;gap:10px}} .c{{background:rgba(255,255,255,.35);border:1px solid #b98;
  border-radius:12px;padding:10px;width:150px;text-align:center}}
.ib{{height:64px;display:flex;align-items:center;justify-content:center}}
.c img{{max-width:120px}} .l{{font-weight:700;margin-top:6px;color:#3a2c18}} .d{{font-size:12px;color:#5a4a30;min-height:28px}}
.hp{{position:relative;width:240px;height:22px;margin:6px}}
.hp .bg{{position:absolute;inset:0}} .hp .fl{{position:absolute;left:0;top:0;height:100%;overflow:hidden}}
</style></head><body>
<h1>明亮卡通冒险风 UI · 基础控件套件（预览）</h1>
<p>奶油/木质面板 + 草木绿按钮 + 奶白描边 + 金色点缀，贴合新地图卡通主题。确认后覆盖导入 Art/UI。</p>
<h2>按钮（180×60）</h2>
<div>
 <div class="card"><div class="btnwrap"><img src="ui_kit/btn_normal.png"><span>开始游戏</span></div><div class="lbl">normal</div></div>
 <div class="card"><div class="btnwrap"><img src="ui_kit/btn_hover.png"><span>开始游戏</span></div><div class="lbl">hover</div></div>
 <div class="card"><div class="btnwrap"><img src="ui_kit/btn_green.png"><span>下一波</span></div><div class="lbl">green</div></div>
 <div class="card"><div class="btnwrap"><img src="ui_kit/btn_disabled.png"><span>已锁定</span></div><div class="lbl">disabled</div></div>
</div>
<h2>面板 / HUD / 血条</h2>
<div><div class="card"><img src="ui_kit/panel.png" style="max-width:320px"><div class="lbl">panel · 奶油木质</div></div>
<div class="card"><img src="ui_kit/hud_bar.png" style="max-width:420px"><div class="lbl">hud_bar</div></div>
<div class="card">
  <div class="hp"><img class="bg" src="ui_kit/hp_bar_bg.png"><div class="fl" style="width:100%"><img src="ui_kit/hp_bar_fill.png"></div></div>
  <div class="hp"><img class="bg" src="ui_kit/hp_bar_bg.png"><div class="fl" style="width:60%"><img src="ui_kit/hp_bar_fill.png"></div></div>
  <div class="hp"><img class="bg" src="ui_kit/hp_bar_bg.png"><div class="fl" style="width:25%"><img src="ui_kit/hp_bar_fill.png"></div></div>
  <div class="lbl">hp_bar</div></div>
</div>
<h2>图标（56×56）</h2>
<div class="wrap">{rows}</div>
</body></html>'''
    with open(PREVIEW, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print('preview ->', PREVIEW)


if __name__ == '__main__':
    main()
