#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_placeholders.py — 为 MISSING 素材生成「原创占位图」，让工程在不依赖现有素材的
情况下也能 immediately 跑起来（全部为程序绘制的几何图形，无版权风险）。

生成规则：
  - 画布尺寸取 manifest.json 中的 w,h（无则按类别推断）
  - 按类别用不同颜色 + 形状区分，并标注文件名，便于辨认
  - 默认只生成清单里「磁盘上不存在」的素材（--only-missing），不会覆盖你已画的图

用法：
  python gen_placeholders.py                 # 仅为缺失项生成占位
  python gen_placeholders.py --all           # 全部重新生成（会覆盖现有）
  python gen_placeholders.py --dry-run       # 只打印将要生成的，不写文件
  python gen_placeholders.py path1 path2 ... # 仅生成指定路径
"""
import json
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def find_game_root():
    return Path(__file__).resolve().parent.parent


CAT_COLOR = {
    'Art/Towers/': (70, 130, 255),
    'Art/Enemies/': (230, 70, 70),
    'Art/Bullets/': (240, 200, 60),
    'Art/Effects/': (180, 90, 220),
    'Art/UI/': (70, 200, 120),
}
DEFAULT_COLOR = (150, 150, 150)


def category_of(path: str):
    for k, v in CAT_COLOR.items():
        if path.startswith(k):
            return v
    return DEFAULT_COLOR


def label(path: str):
    name = path.rsplit('/', 1)[-1]
    if name.endswith('.png'):
        name = name[:-4]
    return name


def draw(path: str, w: int, h: int) -> Image.Image:
    color = category_of(path)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = max(4, min(w, h) // 8)

    if path.startswith('Towers/'):
        d.ellipse([m, m, w - m, h - m], outline=color, width=max(2, m // 2))
        d.ellipse([w // 2 - m, h // 2 - m, w // 2 + m, h // 2 + m], fill=color)
    elif path.startswith('Enemies/'):
        d.polygon([(w // 2, m), (m, h - m), (w - m, h - m)], outline=color, width=max(2, m // 2))
    elif path.startswith('Bullets/'):
        d.ellipse([w // 2 - m, h // 2 - m, w // 2 + m, h // 2 + m], fill=color)
    elif path.startswith('Effects/'):
        d.ellipse([m, m, w - m, h - m], outline=color, width=max(2, m // 2))
        d.line([m, m, w - m, h - m], fill=color, width=max(1, m // 3))
        d.line([w - m, m, m, h - m], fill=color, width=max(1, m // 3))
    elif path.startswith('UI/'):
        d.rounded_rectangle([m, m, w - m, h - m], radius=m, outline=color, width=max(2, m // 2))
    else:
        d.rectangle([m, m, w - m, h - m], outline=color, width=max(2, m // 2))

    try:
        fnt = ImageFont.load_default()
        d.text((m, h - m - 12), label(path)[:14], fill=(255, 255, 255, 200), font=fnt)
    except Exception:
        pass
    return img


def generate(paths: list, root: Path, dry_run: bool = False):
    art_dir = root / 'assets' / 'resources' / 'Art'
    manifest = json.loads((Path(__file__).resolve().parent / 'manifest.json').read_text(encoding='utf-8'))
    size_map = {it['path']: (it['w'], it['h']) for it in manifest}

    created, skipped = 0, 0
    for p in paths:
        out = art_dir / (p + '.png')
        if out.exists():
            skipped += 1
            if not dry_run:
                continue
        w, h = size_map.get(p, (56, 56))
        if dry_run:
            print(f"  [dry] {p}  ({w}x{h})")
            created += 1
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        draw(p, w, h).save(out)
        created += 1
        print(f"  + {p}  ({w}x{h})")
    print(f"\n占位图：生成 {created} / 跳过已存在 {skipped}")
    if dry_run:
        print('（--dry-run，未写入任何文件）')


def main():
    ap = argparse.ArgumentParser()
    root = find_game_root()
    ap.add_argument('paths', nargs='*', help='指定要生成的素材路径（省略则按 --only-missing/--all）')
    ap.add_argument('--all', action='store_true', help='重新生成全部清单素材')
    ap.add_argument('--only-missing', action='store_true', help='仅为磁盘缺失项生成（默认）')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--art', default=str(root / 'assets' / 'resources' / 'Art'))
    args = ap.parse_args()

    manifest = json.loads((Path(__file__).resolve().parent / 'manifest.json').read_text(encoding='utf-8'))
    art_dir = Path(args.art)

    if args.paths:
        targets = args.paths
    elif args.all:
        targets = [it['path'] for it in manifest]
    else:  # only-missing（默认）
        existing = {str(p.relative_to(art_dir)).replace('\\', '/').removesuffix('.png')
                    for p in art_dir.rglob('*.png')}
        targets = [it['path'] for it in manifest if it['path'] not in existing]

    print(f"将生成 {len(targets)} 张占位图" + ("（dry-run）" if args.dry_run else ""))
    generate(targets, root, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
