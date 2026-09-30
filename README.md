# 塔防保卫战（冰原风塔防）

基于 **Cocos Creator 3.8.8** 的塔防游戏，采用原创冰原美术风格，美术素材为项目自绘/原创。

## 运行 / 构建

1. 用 **Cocos Creator 3.8.8** 打开本目录（`d:/code/tower-defense`）。
2. 顶栏 **项目 → 预览**（浏览器）即可试玩；或 **项目 → 构建发布**，平台选 **Web Desktop**，输出到 `build/`。
3. 新增图片 / 音效素材后，需在 Cocos Creator 中**重新导入**（生成 `.meta`），代码里的 `resources.load` 才生效。

## 目录结构（要点）

```
assets/
  Scripts/
    Core/        游戏主循环：GameManager、WaveManager、MapManager、CurrencyManager、MissionManager
    Entity/      实体：Enemy、Tower、Bullet、Radish、Obstacle
    Data/        配置：LevelData、EnemyData、TowerData（数值都集中在这里，改怪/塔先来这）
    Utils/       工具：SpriteManager、EffectManager、AudioManager、Bullet 对象池
  resources/
    levels/      关卡 JSON（01~15 正式关 + 90_sample 示例 + _template 模板）
    Art/         美术素材（Bullets/Effects/Enemies/Towers/UI + Audio/）
    hidden_missions.json   各关隐藏任务（按 uid 映射，键为 "c_<uid>"）
tools/
  validate-levels.js   关卡数据校验脚本（npm test）
```

## 如何新增 / 修改关卡

1. 复制 `levels/_template.json` 为 `levels/NN_名称.json`。**文件名必须是 `NN_xxx.json`**，校验脚本只认这种格式。
2. 编辑字段：
   - `rows` / `cols`：网格尺寸。
   - `path`：敌人路径，节点 `{x,y}`（**列,行**），必须相邻（曼哈顿步长 = 1）且在界内。
   - `towerSpots`：可建塔格 `{row,col}`，不能压在路径上。
   - `obstacles`：障碍 `{row,col,type}`，`type` ∈ `rock_small/rock_wide/rock_big/chest_small/chest_big`；2×N 障碍会占用多格，不能重叠路径 / 炮塔位 / 彼此。
   - `waves`：每波 `enemies` 列表，`type` 必须是 `Data/EnemyData.ts` 里存在的 `EnemyType` 字符串，`count>0`；可带 `hpMult`（>0）、`noBlock`（boss 不吃障碍阻挡）。
   - `uid`：隐藏任务映射键，**必须存在且唯一**，否则任务对不上。
3. 在 `hidden_missions.json` 里按 `"c_<uid>"` 维护该关任务；`destroy_obstacle` 类任务要求的格子必须真实存在于关卡障碍中。
4. 跑 `npm test` 校验（见下）。

## 如何新增敌人 / 炮塔

- 敌人：在 `Data/EnemyData.ts` 的 `EnemyConfig` 加条目，**`type` 字符串**要同步到关卡 JSON 的 `waves[].enemies[].type`（`tools/validate-levels.js` 会校验一致性）。
- 炮塔：在 `Data/TowerData.ts` 加条目；可用范围在 `GameManager.getAvailableTowerTypes()` 按关卡配置。

## 测试

关卡数据（最易错的数值 / 坐标 / 任务映射）由 `tools/validate-levels.js` 做静态校验：

```bash
npm test          # 等价于 node tools/validate-levels.js
```

校验项：网格与路径合法（界内、相邻）、炮塔位 / 障碍不越界且不重叠、波次敌人类型有效、`destroy_obstacle` 任务格子真实存在。失败以非 0 退出码结束，可接 CI。

## 文档索引

- `素材任务改进任务书.md`：美术素材 ↔ 代码取图位置对照、改素材流程与防呆。
- `数值平衡参考.md`：关卡 / 敌人 / 炮塔数值的设计依据。
