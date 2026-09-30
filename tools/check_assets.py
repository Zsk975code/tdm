#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_assets.py — 对照 manifest.json，扫描 Art/ 实际素材，找出：
  - MISSING   : 代码引用了、但磁盘上没有的素材（必须画）
  - WRONG_SIZE: 存在但画布尺寸与期望不符（CONTENT_BBOX 里的尺寸是权威值）
  - ORPHAN    : 磁盘上有、但代码没引用的素材（可删，避免打包冗余/版权风险）

用法：
  python check_assets.py
  python check_assets.py --fix-placeholders   # 顺手为 MISSING 生成占位图（见 gen_placeholders）
"""
import json
import argparse
from pathlib import Path
from collections import Counter
from PIL import Image


def find_game_root():
    return Path(__file__).resolve().parent.parent


def scan_art(art_dir: Path):
    found: dict = {}
    for p in art_dir.rglob('*.png'):
        rel = str(p.relative_to(art_dir)).replace('\\', '/')
        if rel.endswith('.png'):
            rel = rel[:-4]
        try:
            with Image.open(p) as im:
                found[rel] = [im.width, im.height]
        except Exception:
            found[rel] = None
    return found


def main():
    ap = argparse.ArgumentParser()
    root = find_game_root()
    ap.add_argument('--art', default=str(root / 'assets' / 'resources' / 'Art'))
    ap.add_argument('--manifest', default=str(Path(__file__).resolve().parent / 'manifest.json'))
    ap.add_argument('--fix-placeholders', action='store_true', default=False,
                    help='为 MISSING 的素材生成占位图（转交 gen_placeholders）')
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    actual = scan_art(Path(args.art))
    actual_keys = set(actual.keys())

    missing, wrong, ok = [], [], 0
    for it in manifest:
        p, exp = it['path'], [it['w'], it['h']]
        if p not in actual_keys:
            missing.append(it)
        elif actual[p] is None:
            wrong.append((it, '打开失败'))
        elif actual[p] != exp:
            wrong.append((it, f"实际 {actual[p][0]}x{actual[p][1]} != 期望 {exp[0]}x{exp[1]}"))
        else:
            ok += 1
    orphan = [k for k in actual_keys if k not in {it['path'] for it in manifest}]

    print('=' * 60)
    print(f'清单总数 {len(manifest)} | 匹配 {ok} | 缺失 {len(missing)} | 尺寸不符 {len(wrong)} | 孤儿 {len(orphan)}')
    print('=' * 60)
    if missing:
        print('\n[MISSING] 需要绘制（代码已引用，磁盘无文件）：')
        for it in missing:
            sz = f"{it['w']}x{it['h']}" + (' ~' if it['size_inferred'] else '')
            print(f"  - {it['path']}  ({sz})")
    if wrong:
        print('\n[WRONG_SIZE] 尺寸需核对：')
        for it, msg in wrong:
            print(f"  - {it['path']}: {msg}")
    if orphan:
        print('\n[ORPHAN] 代码未引用（建议删除）：')
        for k in sorted(orphan):
            print(f"  - {k}")

    if args.fix_placeholders and missing:
        print('\n--fix-placeholders 已启用，转交 gen_placeholders 生成占位图…')
        import importlib.util
        gp = Path(__file__).resolve().parent / 'gen_placeholders.py'
        spec = importlib.util.spec_from_file_location('gen_placeholders', gp)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.generate([it['path'] for it in missing], root)


if __name__ == '__main__':
    main()
