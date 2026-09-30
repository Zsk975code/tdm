"""重做关卡选择界面 v3 素材：
   level_select_bg(1920x1080) + panel_level_card(380x200)
   + star_full / star_empty(评分星) + lock(锁) + diff_1..5(难度盾)
并拼出预览 level_select_preview.png / .html。
确认后由 import 脚本覆盖 Art/UI 同名 png（新素材一并复制）。
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ART = 'D:/code/tower-defense/assets/resources/Art/UI'
OUT = 'D:/code/tower-defense/out/level_select'
os.makedirs(OUT, exist_ok=True)

C_TOP = (38, 52, 74)
C_BOT = (16, 22, 34)
C_RIM = (90, 140, 180, 210)
C_RIM2 = (150, 190, 220, 55)
C_GLASS = (34, 46, 66, 235)


def font(sz):
    for p in ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf',
              'C:/Windows/Fonts/simsum.ttc', 'C:/Windows/Fonts/arial.ttf']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def vgrad(w, h, top, bot):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (w, y)], fill=c)
    return img


def vignette(img, strength=0.55):
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse([-int(w * 0.1), -int(h * 0.1), int(w * 1.1), int(h * 1.1)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(160))
    inv = Image.eval(mask, lambda p: 255 - p)
    dark = Image.new('RGBA', (w, h), (0, 0, 0, int(140 * strength)))
    dark.putalpha(inv)
    return Image.alpha_composite(img, dark)


def gen_bg():
    w, h = 1920, 1080
    img = vgrad(w, h, C_TOP, C_BOT)
    d = ImageDraw.Draw(img)
    random.seed(11)
    for layer, base, amp, alpha in [(0.86, 26, 40, 200), (0.92, 18, 24, 230)]:
        hill = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        hd = ImageDraw.Draw(hill)
        pts = [(0, h)]
        n = 9
        for i in range(n + 1):
            x = int(i / n * w)
            y = int(h * base - (math.sin(i * 1.3) + 1) * h * (amp / 100) - random.uniform(0, 26))
            pts.append((x, y))
        pts.append((w, h))
        hd.polygon(pts, fill=(20, 30, 48, alpha))
        img = Image.alpha_composite(img, hill)
    band = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(band).rectangle([0, 0, w, 200], fill=(60, 80, 110, 40))
    img = Image.alpha_composite(img, band)
    random.seed(7)
    for _ in range(260):
        x, y = random.randint(0, w), random.randint(0, h)
        r = random.choice([1, 1, 1, 2])
        a = random.randint(18, 85)
        d.point((x, y), fill=(235, 245, 255, a))
        if r == 2:
            d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(235, 245, 255, a))
    img = vignette(img, 0.55)
    img.convert('RGB').save(os.path.join(OUT, 'level_select_bg.png'))


def gen_card():
    w, h = 380, 200
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = 16
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=C_GLASS)
    d.rounded_rectangle([1, 1, w - 2, h - 2], radius=r - 1, outline=C_RIM, width=2)
    d.rounded_rectangle([4, 4, w - 5, h - 5], radius=r - 3, outline=C_RIM2, width=1)
    # 顶部来源高光带
    hl = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(hl).rounded_rectangle([5, 5, w - 6, 42], radius=12, fill=(255, 255, 255, 26))
    img = Image.alpha_composite(img, hl)
    # 左侧缩略图框
    d.rounded_rectangle([14, 50, 176, 188], radius=10, fill=(22, 30, 46, 130))
    d.rounded_rectangle([14, 50, 176, 188], radius=10, outline=(120, 160, 200, 95), width=1)
    # 右侧信息区竖分隔
    d.line([(190, 52), (190, 186)], fill=(90, 130, 170, 70), width=1)
    # 右侧底部编号槽
    d.rounded_rectangle([200, 150, 366, 184], radius=10, fill=(22, 30, 46, 255))
    d.rounded_rectangle([200, 150, 366, 184], radius=10, outline=(120, 160, 200, 90), width=1)
    img.save(os.path.join(OUT, 'panel_level_card.png'))


def star_poly(cx, cy, R, r, pts=5, rot=-90):
    out = []
    for i in range(pts * 2):
        ang = math.radians(rot + i * 180 / pts)
        rad = R if i % 2 == 0 else r
        out.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return out


def gen_star(name, fill, outline):
    s = 32
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    poly = star_poly(s / 2, s / 2, 15, 6.5)
    d.polygon(poly, fill=fill, outline=outline)
    img.save(os.path.join(OUT, name))


def gen_lock():
    s = 48
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 锁梁
    d.arc([14, 8, 34, 30], 180, 360, fill=(150, 162, 184, 255), width=5)
    # 锁体
    d.rounded_rectangle([10, 22, 38, 42], radius=5, fill=(120, 134, 160, 255), outline=(180, 192, 214, 255))
    # 钥匙孔
    d.ellipse([21, 28, 27, 34], fill=(40, 48, 64, 255))
    d.rectangle([23, 33, 25, 39], fill=(40, 48, 64, 255))
    img.save(os.path.join(OUT, 'lock.png'))


def gen_diff(n, color):
    s = 28
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 盾形
    pts = [(s / 2, 2), (s - 4, 8), (s - 4, 16), (s / 2, s - 2), (4, 16), (4, 8)]
    d.polygon(pts, fill=color, outline=(230, 238, 248, 230))
    # 内部 n 颗小白点
    for i in range(n):
        cx = s / 2 + (i - (n - 1) / 2) * 6
        d.ellipse([cx - 1.5, 11 - 1.5, cx + 1.5, 11 + 1.5], fill=(245, 250, 255, 255))
    img.save(os.path.join(OUT, f'diff_{n}.png'))


def draw_thumb(d, x, y, w, h, seed):
    """在卡片缩略图框内画迷你地图（程序化，按 seed 不同）。"""
    random.seed(seed)
    pad = 6
    gw, gh = w - 2 * pad, h - 2 * pad
    cols, rows = 7, 5
    cw, ch = gw / cols, gh / rows
    tp = lambda c, r: (x + pad + (c + 0.5) * cw, y + pad + (r + 0.5) * ch)
    # 冰原格底
    for r in range(rows):
        for c in range(cols):
            d.rectangle([x + pad + c * cw, y + pad + r * ch, x + pad + (c + 1) * cw - 1, y + pad + (r + 1) * ch - 1],
                        fill=(40, 56, 80, 120), outline=(60, 84, 116, 90))
    # 路径
    nseg = random.randint(3, 5)
    path = []
    rr = 0
    for i in range(nseg + 1):
        c = int(i / nseg * (cols - 1))
        path.append(tp(c, rr))
        rr = max(0, min(rows - 1, rr + random.choice([-1, 1, 0])))
    d.line(path, fill=(150, 200, 240, 230), width=3, joint='curve')
    # 起点绿 / 终点红
    d.ellipse([path[0][0] - 5, path[0][1] - 5, path[0][0] + 5, path[0][1] + 5], fill=(110, 220, 130, 255))
    d.ellipse([path[-1][0] - 5, path[-1][1] - 5, path[-1][0] + 5, path[-1][1] + 5], fill=(225, 110, 110, 255))
    # 塔点
    for _ in range(8):
        c, r = random.randint(0, cols - 1), random.randint(0, rows - 1)
        px, py = tp(c, r)
        d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=(200, 220, 245, 220))


def gen_preview():
    pw, ph = 1280, 720
    bg = Image.open(os.path.join(OUT, 'level_select_bg.png')).convert('RGBA').resize((pw, ph))
    canvas = bg.copy()
    d = ImageDraw.Draw(canvas)
    ft = font(46)
    t = '选择关卡'
    tb = d.textbbox((0, 0), t, font=ft)
    d.text(((pw - (tb[2] - tb[0])) / 2, 28), t, font=ft, fill=(238, 246, 252, 255))

    card = Image.open(os.path.join(OUT, 'panel_level_card.png')).convert('RGBA')
    cw, ch = 270, 142
    cols, rows = 4, 3
    gx, gy = 18, 18
    gw = cols * cw + (cols - 1) * gx
    sx = (pw - gw) / 2
    sy = 118
    s = ch / 200.0

    star = Image.open(os.path.join(OUT, 'star_full.png')).convert('RGBA')
    stare = Image.open(os.path.join(OUT, 'star_empty.png')).convert('RGBA')
    star_secret = Image.open(os.path.join(OUT, 'star_secret.png')).convert('RGBA')
    lock = Image.open(os.path.join(OUT, 'lock.png')).convert('RGBA').resize((54, 54))
    diffs = [Image.open(os.path.join(OUT, f'diff_{i}.png')).convert('RGBA').resize((24, 24)) for i in range(1, 6)]

    levels = [
        ('冰原序曲', '内置关卡', 3, True, 1, True), ('霜冻峡谷', '内置关卡', 2, True, 2, False),
        ('寒风隘口', '内置关卡', 1, True, 3, True), ('冰晶洞窟', '内置关卡', 0, True, 4, False),
        ('极地堡垒', '内置关卡', 0, False, 5, False), ('雪原迷踪', '内置关卡', 0, False, 2, False),
        ('试炼场', '📁 地图文件', 3, True, 3, True), ('速通挑战', '📁 地图文件', 2, True, 4, False),
        ('自制关 1', '✏ 编辑器', 0, True, 1, False), ('自制关 2', '✏ 编辑器', 1, True, 2, False),
        ('自制关 3', '✏ 编辑器', 0, True, 3, True), ('自制关 4', '✏ 编辑器', 0, True, 2, False),
    ]
    for i, (name, src, stars, unlocked, diff, hidden) in enumerate(levels):
        rr, cc = divmod(i, cols)
        x = int(sx + cc * (cw + gx))
        y = int(sy + rr * (ch + gy))
        cr = card.resize((cw, ch))
        if not unlocked:
            g = cr.convert('L').convert('RGBA')
            g.putalpha(cr.split()[3])
            cr = g
        canvas.alpha_composite(cr, (x, y))
        cx = x + cw / 2

        # 来源（左上）
        d.text((x + 22 * s, y + 24 * s), src, font=font(13), fill=(190, 210, 245, 210) if unlocked else (150, 150, 150, 200), anchor='mm')
        # 难度（右上）
        if unlocked:
            canvas.alpha_composite(diffs[diff - 1], (int(x + cw - 34), int(y + 16)))

        # 缩略图（左侧框 14,50,176,188 -> 预览缩放）
        tx, ty, tw, th = x + 14 * s, y + 50 * s, 162 * s, 138 * s
        if unlocked:
            draw_thumb(d, tx, ty, tw, th, seed=i * 7 + 3)
        else:
            d.rectangle([tx, ty, tx + tw, ty + th], fill=(20, 26, 38, 200))

        # 右侧信息
        d.text((x + 286 * s, y + 86 * s), str(i + 1), font=font(34), fill=(255, 240, 200, 255) if unlocked else (170, 170, 170, 255), anchor='mm')
        d.text((x + 286 * s, y + 122 * s), name, font=font(16), fill=(235, 240, 248, 255), anchor='mm')

        # 星级：3 普通 + 第4颗隐藏彩星(粉)
        starY = y + 166 * s
        sw = 22
        starCount = 4 if (unlocked and hidden) else 3
        totalW = starCount * sw + (starCount - 1) * 6
        sx0 = x + 286 * s - totalW / 2 + sw / 2
        hidden_done = hidden and stars > 0  # 预览演示：有隐藏任务的已通关关显示粉星完成态
        for k in range(starCount):
            if k < 3:
                sm = star if (unlocked and k < stars) else stare
            else:
                sm = star_secret if hidden_done else stare
            canvas.alpha_composite(sm.resize((sw, sw)), (int(sx0 + k * (sw + 6)), int(starY - sw / 2)))

        if not unlocked:
            canvas.alpha_composite(lock, (int(cx - 27), int(y + ch / 2 - 27)))

    # 返回按钮
    btn = Image.open(os.path.join(ART, 'btn_normal.png')).convert('RGBA').resize((150, 46))
    canvas.alpha_composite(btn, (36, ph - 66))
    d.text((36 + 75, ph - 66 + 23), '返回', font=font(20), fill=(255, 255, 255, 255), anchor='mm')

    canvas.convert('RGB').save(os.path.join(OUT, 'level_select_preview.png'))
    html = """<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>关卡选择 · v3 重做预览</title>
<style>body{background:#11151d;color:#cdd6e0;font-family:system-ui,sans-serif;margin:0;padding:24px}
h1{font-size:18px;font-weight:600}img{max-width:100%;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
.note{color:#8a97a8;font-size:13px;margin-top:8px}</style></head>
<body><h1>关卡选择界面 · v3 重做（星星/锁/难度/缩略图）</h1>
<img src="level_select_preview.png">
<p class="note">重做素材：level_select_bg(深冰原) + panel_level_card(含左侧缩略图框) + star_full/star_empty(金/灰评分星) + lock(锁) + diff_1..5(难度盾)。
游戏中缩略图由 LevelSelect 用真实关卡 path/towerSpots 程序化绘制（每关不同）；预览用程序化模拟图。</p>
</body></html>"""
    with open(os.path.join(OUT, 'level_select_preview.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print('preview ->', os.path.join(OUT, 'level_select_preview.html'))


if __name__ == '__main__':
    gen_bg()
    gen_card()
    gen_star('star_full.png', (255, 215, 90, 255), (255, 242, 180, 255))
    gen_star('star_empty.png', (70, 82, 104, 255), (130, 150, 185, 255))
    gen_star('star_secret.png', (255, 130, 205, 255), (255, 200, 235, 255))
    gen_lock()
    for n, col in [(1, (86, 196, 122, 255)), (2, (96, 170, 230, 255)),
                  (3, (240, 170, 80, 255)), (4, (186, 130, 230, 255)), (5, (232, 96, 96, 255))]:
        gen_diff(n, col)
    gen_preview()
