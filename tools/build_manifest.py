#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_manifest.py — 从 SpriteManager.ts 自动重建「游戏所需素材清单」。

原理：扫描代码中所有被引用的素材路径（CONTENT_BBOX 静态表 + preloadAll 的动态生成
路径 + getUIFrame 调用的 UI 帧 + 敌人皮肤组），得到一份权威的「待绘制清单」。

输出（写到本脚本同目录）：
  - manifest.json   机器可读，供 check_assets / gen_placeholders / import_src 使用
  - manifest.md     人工可读的绘制清单（带 [ ] 勾选框，按类别分组）

用法：
  python build_manifest.py
  python build_manifest.py --sm <SpriteManager.ts 路径>
"""
import re
import json
import argparse
from pathlib import Path
from collections import Counter
from PIL import Image


def find_game_root():
    # 脚本位于 <game>/tools/ 下 → 父目录即游戏根
    return Path(__file__).resolve().parent.parent


def read_text(p: Path) -> str:
    return Path(p).read_text(encoding='utf-8')


def parse_bbox(src: str) -> dict:
    """解析 CONTENT_BBOX: Record<string,[number,number]> = { 'path':[w,h], ... }"""
    m = re.search(
        r'CONTENT_BBOX\s*:\s*Record<string,\s*\[number,\s*number\]>\s*=\s*\{(.*?)\n\s*\};',
        src, re.S)
    bbox: dict = {}
    if not m:
        return bbox
    body = m.group(1)
    for mm in re.finditer(r"'([^']+)'\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]", body):
        # CONTENT_BBOX 的 key 带 .png 后缀，与代码里 resources.load 的无后缀路径统一
        key = mm.group(1)
        if key.endswith('.png'):
            key = key[:-4]
        bbox[key] = [int(mm.group(2)), int(mm.group(3))]
    return bbox


def parse_str_array(src: str, name: str):
    m = re.search(rf"{name}\s*=\s*\[([^\]]*)\]", src)
    if not m:
        return []
    return re.findall(r"'([^']+)'", m.group(1))


def parse_uiframe_names(src: str):
    """扫描 getUIFrame('xxx') 调用，收集 UI 帧名。"""
    return re.findall(r"getUIFrame\(\s*'([^']+)'\s*\)", src)


def parse_enemy_skin_groups(src: str):
    """从 ENEMY_SKINS / NORMAL_SKIN_POOL 提取所有 [prefix, [f1,f2,f3]] 皮肤组。"""
    groups = []
    for m in re.finditer(r"\['([^']+)'\s*,\s*\[([^\]]+)\]\]", src):
        prefix = m.group(1)
        frames = re.findall(r"'([^']+)'", m.group(2))
        if frames:
            groups.append((prefix, frames))
    return groups


def reconstruct(tower_types, bullet_types, ui_names, skin_groups):
    """镜像 SpriteManager.preloadAll 的路径生成逻辑。"""
    paths = set()
    # 塔身 lv1~3
    for t in tower_types:
        for lv in (1, 2, 3):
            paths.add(f"Art/Towers/{t}_lv{lv}")
    # 塔底座 lv1~3（仅部分塔有底座）
    for t in ['emitter', 'prism', 'artillery', 'rocket', 'snow', 'coagulator', 'venom']:
        for lv in (1, 2, 3):
            paths.add(f"Art/Towers/{t}_base_lv{lv}")
    # 塔开火攻击帧（仅部分塔有独立攻击帧；venom 每级 3 帧 X2/X3/X4，其余 2 帧 X2/X3）
    for t in ['emitter', 'prism', 'artillery', 'rocket', 'coagulator', 'venom']:
        maxk = 4 if t == 'venom' else 3
        for lv in ('1', '2', '3'):
            for k in range(2, maxk + 1):
                paths.add(f"Art/Towers/{t}_attack_{lv}{k}")
    # 太阳塔脸层
    for i in (1, 2, 3):
        paths.add(f"Art/Towers/radiation_face_0{i}")
    # 敌人皮肤（每组 3 帧行走动画）
    for prefix, frames in skin_groups:
        for f in frames:
            paths.add(f"Art/Enemies/{prefix}_{f}")
    # 子弹（单体 + 分级链接弹体）
    for t in bullet_types:
        paths.add(f"Art/Bullets/{t}")
    # 注：rocket 不再有独立子弹图，直接复用 Effects/rocket_fire_{tens}1，故不含在内
    for t in ['emitter', 'prism', 'artillery']:
        for tens in ('1', '2', '3'):
            paths.add(f"Art/Bullets/{t}_{tens}1")
    # 弓箭塔(venom)箭矢：每级 4 帧
    for tens in ('1', '2', '3'):
        for v in ('1', '2', '3', '4'):
            paths.add(f"Art/Bullets/venom_{tens}{v}")
    # UI 帧 + 建造面板塔图标（金币不足/足够两套）
    for n in ui_names:
        paths.add(f"Art/UI/{n}")
    for t in tower_types:
        paths.add(f"Art/UI/tower_icon_{t}")
        paths.add(f"Art/UI/tower_icon_{t}_off")
    # 道路方向瓦片（6 段：直行×2 + 拐角×4）
    for k in ['road_straight_h', 'road_straight_v', 'road_corner_NE', 'road_corner_NW', 'road_corner_SE', 'road_corner_SW']:
        paths.add(f"Art/Road/{k}")
    return paths


def scan_art_sizes(art_dir: Path) -> dict:
    """读取磁盘上已有素材的真实画布尺寸（相对 Art 的无后缀路径 → [w,h]）。"""
    sizes: dict = {}
    if not art_dir.exists():
        return sizes
    for p in art_dir.rglob('*.png'):
        rel = str(p.relative_to(art_dir)).replace('\\', '/')
        if rel.endswith('.png'):
            rel = rel[:-4]
        try:
            with Image.open(p) as im:
                sizes[rel] = [im.width, im.height]
        except Exception:
            pass
    return sizes


def infer_size(path: str):
    """对缺失素材给出按类别推断的「建议画布尺寸」（非权威，标注 ~）。"""
    low = path.lower()
    if 'boss' in low or 'bm' in path or 'bb' in path:
        return [97, 128]
    if path.startswith('UI/'):
        return [64, 64]
    if path.startswith('Bullets/'):
        return [32, 32]
    if path.startswith('Effects/'):
        return [80, 80]
    return [56, 56]


CAT_LABEL = {
    'Towers/': '塔 (Towers)',
    'Enemies/': '敌人 (Enemies)',
    'Bullets/': '子弹 (Bullets)',
    'Effects/': '特效 (Effects)',
    'UI/': '界面 (UI)',
    'Road/': '道路 (Road)',
}


def main():
    ap = argparse.ArgumentParser()
    root = find_game_root()
    ap.add_argument('--sm', default=str(root / 'assets' / 'Scripts' / 'Utils' / 'SpriteManager.ts'))
    ap.add_argument('--out', default=str(root / 'tools'))
    args = ap.parse_args()

    src = read_text(Path(args.sm))
    bbox = parse_bbox(src)
    tower_types = parse_str_array(src, 'TOWER_TYPES')
    bullet_types = parse_str_array(src, 'BULLET_TYPES')
    ui_names = parse_str_array(src, 'uiNames') + parse_uiframe_names(src)
    skin_groups = parse_enemy_skin_groups(src)

    gen = reconstruct(tower_types, bullet_types, ui_names, skin_groups)
    # 合并：生成路径 ∪ CONTENT_BBOX 全部 key（后者还含静态特效/子弹等）
    required = set(gen) | set(bbox.keys())
    # 统一去掉 resources 根前缀 'Art/'，使清单路径 == 相对 assets/resources/Art 的磁盘路径
    required = {p[4:] if p.startswith('Art/') else p for p in required}

    # 磁盘真实画布尺寸（存在的素材以其为准，作为替换时的目标画布尺寸）
    art_dir = root / 'assets' / 'resources' / 'Art'
    actual = scan_art_sizes(art_dir)

    manifest = []
    for p in sorted(required):
        if p in actual and actual[p]:
            w, h = actual[p]
            inferred = False
        else:
            size = infer_size(p)
            w, h = size
            inferred = True
        cat = next((v for k, v in CAT_LABEL.items() if p.startswith(k)), '其他')
        entry = {'path': p, 'w': w, 'h': h, 'size_inferred': inferred, 'category': cat}
        # 内容包围盒（CONTENT_BBOX）仅作备注，说明实际内容在画布中的占比
        if p in bbox:
            entry['content_w'], entry['content_h'] = bbox[p]
        manifest.append(entry)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    lines = ['# 素材绘制清单（由 build_manifest 自动生成，请勿手改）', '',
             '> 用原创 / 已授权素材替换后，把对应 `[ ]` 改成 `[x]` 记录进度。', '']
    by_cat: dict = {}
    for it in manifest:
        by_cat.setdefault(it['category'], []).append(it)
    order = ['塔 (Towers)', '敌人 (Enemies)', '子弹 (Bullets)', '特效 (Effects)', '界面 (UI)', '道路 (Road)', '其他']
    for cat in order:
        items = by_cat.get(cat)
        if not items:
            continue
        lines.append(f'## {cat}（{len(items)}）')
        lines.append('')
        for it in items:
            sz = f"{it['w']}x{it['h']}" + (' ~' if it['size_inferred'] else '')
            if 'content_w' in it:
                sz += f"  (内容区 {it['content_w']}x{it['content_h']})"
            lines.append(f"- [ ] `Art/{it['path']}`  {sz}")
        lines.append('')
    (out_dir / 'manifest.md').write_text('\n'.join(lines), encoding='utf-8')

    print(f"已生成 {len(manifest)} 条素材记录")
    print(f"  -> {out_dir / 'manifest.json'}")
    print(f"  -> {out_dir / 'manifest.md'}")
    c = Counter(it['category'] for it in manifest)
    for k in order:
        if c.get(k):
            print(f"     {k}: {c[k]}")


if __name__ == '__main__':
    main()
