"""关卡选择界面 v3 预览：用已导入的 level_select_bg / panel_level_card / btn_* 真实素材拼装。
输出 out/level_select/level_select_preview.png + level_select_preview.html
"""
import os
from PIL import Image, ImageDraw, ImageFont

ART = 'D:/code/tower-defense/assets/resources/Art/UI'
OUT = 'D:/code/tower-defense/out/level_select'
os.makedirs(OUT, exist_ok=True)


def font(sz):
    for p in ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf',
              'C:/Windows/Fonts/simsum.ttc', 'C:/Windows/Fonts/arial.ttf']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def load(name):
    return Image.open(os.path.join(ART, name)).convert('RGBA')


W, H = 1280, 720
canvas = Image.new('RGBA', (W, H), (18, 22, 32, 255))

# 背景
bg = load('level_select_bg.png').resize((W, H))
canvas = Image.alpha_composite(canvas, bg)
d = ImageDraw.Draw(canvas)

# 标题
ft = font(46)
title = '选择关卡'
tb = d.textbbox((0, 0), title, font=ft)
d.text(((W - (tb[2] - tb[0])) / 2, 36), title, font=ft, fill=(238, 246, 252, 255))

# 卡片网格
card = load('panel_level_card.png')
cols, rows = 4, 3
cw, ch = 270, 150
gx, gy = 24, 24
gridW = cols * cw + (cols - 1) * gx
startX = (W - gridW) / 2
startY = 130

levels = [
    ('冰原序曲', '内置关卡', 3, True),
    ('霜冻峡谷', '内置关卡', 2, True),
    ('寒风隘口', '内置关卡', 1, True),
    ('冰晶洞窟', '内置关卡', 0, True),
    ('极地堡垒', '内置关卡', 0, False),
    ('雪原迷踪', '内置关卡', 0, False),
    ('📁 自制:试炼', '地图文件', 3, True),
    ('📁 自制:速通', '地图文件', 2, True),
    ('✏ 编辑器关卡1', '编辑器自制', 0, True),
    ('✏ 编辑器关卡2', '编辑器自制', 1, True),
    ('✏ 编辑器关卡3', '编辑器自制', 0, True),
    ('✏ 编辑器关卡4', '编辑器自制', 0, True),
]

for i, (name, src, stars, unlocked) in enumerate(levels):
    r, c = divmod(i, cols)
    x = int(startX + c * (cw + gx))
    y = int(startY + r * (ch + gy))
    cardR = card.resize((cw, ch))
    if not unlocked:
        # 灰化锁定卡
        g = cardR.convert('L').convert('RGBA')
        g.putalpha(cardR.split()[3])
        cardR = g
    canvas.alpha_composite(cardR, (x, y))
    cx = x + cw / 2
    # 编号
    d.text((cx, y + 26), str(i + 1), font=font(38),
           fill=(255, 240, 200, 255) if unlocked else (170, 170, 170, 255), anchor='mm')
    # 名字
    d.text((cx, y + 66), name, font=font(20), fill=(235, 240, 248, 255), anchor='mm')
    # 状态行
    if not unlocked:
        st = '未解锁'
        col = (180, 180, 180, 255)
    elif stars > 0:
        st = '★' * stars + f'  ({stars}/3)'
        col = (255, 215, 90, 255)
    else:
        st = '可挑战'
        col = (160, 255, 160, 255)
    d.text((cx, y + 100), st, font=font(22), fill=col, anchor='mm')
    # 来源
    d.text((cx, y + 128), src, font=font(15), fill=(190, 210, 245, 200), anchor='mm')

# 返回按钮（用 btn_normal）
btn = load('btn_normal.png').resize((160, 48))
canvas.alpha_composite(btn, (40, H - 70))
d.text((40 + 80, H - 70 + 24), '返回', font=font(22), fill=(255, 255, 255, 255), anchor='mm')

canvas.convert('RGB').save(os.path.join(OUT, 'level_select_preview.png'))

html = f"""<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>关卡选择 · v3 预览</title>
<style>body{{background:#11151d;color:#cdd6e0;font-family:system-ui,sans-serif;margin:0;padding:24px}}
h1{{font-size:18px;font-weight:600}}img{{max-width:100%;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)}}
.note{{color:#8a97a8;font-size:13px;margin-top:8px}}</style></head>
<body><h1>关卡选择界面 · v3 深色</h1>
<img src="level_select_preview.png">
<p class="note">背景 level_select_bg(亮度53.7) + 卡片 panel_level_card(68.1) + 按钮 btn_normal，全部为已导入的 v3 真实素材。
卡片内容（编号/名/星级/来源）由 LevelSelect.ts 运行时 Label 动态生成，此处用文字模拟。</p>
</body></html>"""
with open(os.path.join(OUT, 'level_select_preview.html'), 'w', encoding='utf-8') as f:
    f.write(html)

print('generated ->', OUT)
