# 素材工作流工具（原创素材管线）

目的：**维护项目自绘美术管线**，保证素材来源清晰、可发布。
所有脚本只读取 `SpriteManager.ts` 与 `assets/resources/Art/`。

> 安装依赖：`pip install -r requirements.txt`（需要 Pillow）

---

## 工作流

### 1. 生成「该画哪些图」清单
```bash
python build_manifest.py
```
- 解析 `SpriteManager.ts` 里所有被引用的素材路径（塔身/底座/攻击帧、敌人皮肤、子弹、特效、UI、建造图标）。
- 输出 `manifest.json`（机器用）与 `manifest.md`（人工勾选用，按类别分组，带期望画布尺寸）。
- `manifest.md` 里尺寸带 `~` 的是「推断值」，以 `CONTENT_BBOX` 的权威尺寸为准。

### 2. 看看现在缺什么
```bash
python check_assets.py
```
报告三类问题：
- `MISSING` —— 代码要用、但磁盘没有，必须画。
- `WRONG_SIZE` —— 画布尺寸和期望不一致（CONTENT_BBOX 的尺寸是权威值）。
- `ORPHAN` —— 磁盘有、但代码没引用（通常是旧版遗留，建议清理）。

### 3.（可选）先出一套占位图，让工程立刻能跑
```bash
python gen_placeholders.py            # 仅为缺失项生成几何占位图
python gen_placeholders.py --dry-run  # 只预览
python gen_placeholders.py --all      # 全部重画（会覆盖现有）
```
占位图全由脚本绘制（几何图形 + 文件名标注），可放心打包验证。

### 4. 画好你自己的图后导入
把原创 PNG 按 `manifest.md` 的文件名放进 `art_src/`（目录结构与 `Art/` 一致），然后：
```bash
python import_src.py            # 预览将要导入的文件
python import_src.py --apply    # 真正复制进 Art/
```
脚本只允许导入清单内的路径，避免误带无关/遗留文件。

### 5. 再次校验
```bash
python check_assets.py
```
确认 `MISSING` 归零、尺寸无误即可发布。

---

## 目录说明
```
tools/
  build_manifest.py   从代码重建素材清单
  check_assets.py     扫描实际素材，找缺失/尺寸不符/孤儿
  gen_placeholders.py 生成原创几何占位图
  import_src.py       把 art_src/ 的原创图安全导入 Art/
  manifest.json       上一步产物（机器读）
  manifest.md         上一步产物（人工勾选）
  requirements.txt    Pillow 依赖
```

## 关键点
- 素材按**文件名**被 `SpriteManager` 引用：**同名替换即可生效，无需改代码**。
- 期望画布尺寸以 `SpriteManager.ts` 的 `CONTENT_BBOX` 为准（那里标的是内容包围盒，决定显示缩放）。
- 发布前请用 `check_assets.py` 的 ORPHAN 列表排查，确保工程只保留清单内素材。
