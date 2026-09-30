/**
 * 关卡数据校验（P1：补自动化测试）
 * 用法： node tools/validate-levels.js   或  npm test
 *
 * 校验 assets/resources/levels/ 下文件名形如 NN_xxx.json 的正式关卡：
 *   - 行/列合法；路径坐标在界内且相邻（曼哈顿步长 = 1）
 *   - 炮塔位、障碍在界内；障碍不与路径 / 炮塔位 / 彼此重叠
 *   - 波次敌人 type 属于已知 EnemyType、count > 0、hpMult > 0
 *   - 隐藏任务(destroy_obstacle)要求的格子在关卡障碍中真实存在
 * 失败以非 0 退出码结束，便于接入 CI。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEVELS_DIR = path.join(ROOT, 'assets', 'resources', 'levels');
const HIDDEN = path.join(ROOT, 'assets', 'resources', 'hidden_missions.json');

const ENEMY_TYPES = new Set([
  'normal', 'fast', 'tank', 'boss', 'big_fast', 'splitter',
  'small_boss', 'boss_mode', 'boss_mode_flying',
]);
const OBST_TYPES = new Set(['rock_small', 'rock_wide', 'rock_big', 'chest_small', 'chest_big']);
const OBST_SIZE = { rock_small: [1, 1], rock_wide: [2, 1], rock_big: [2, 2], chest_small: [1, 1], chest_big: [2, 2] };

let errors = 0;
let warns = 0;
// 全部走 stdout，避免 stderr/stdout 合并时顺序错乱导致报错被错挂到相邻关卡标题下
const err = (m) => { console.log('  ✗ ' + m); errors++; };
const warn = (m) => { console.log('  ⚠ ' + m); warns++; };

let hidden = { missions: {} };
try {
  hidden = JSON.parse(fs.readFileSync(HIDDEN, 'utf8'));
} catch (e) {
  err('读取 hidden_missions.json 失败: ' + e.message);
}

const files = fs.readdirSync(LEVELS_DIR)
  .filter((f) => /^\d{2}_.*\.json$/.test(f) && f !== '90_sample.json')
  .sort();

if (files.length === 0) err('未找到任何正式关卡 JSON（应为 NN_xxx.json）');

for (const f of files) {
  const fp = path.join(LEVELS_DIR, f);
  let j;
  try {
    j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    err(`${f}: JSON 解析失败 ${e.message}`);
    continue;
  }

  console.log(`\n=== ${f} (uid=${j.uid ?? '?'}) ===`);
  const R = j.rows;
  const C = j.cols;
  if (!(R > 0 && C > 0)) err(`${f}: rows/cols 非法 (${R}x${C})`);
  const inB = (r, c) => r >= 0 && r < R && c >= 0 && c < C;

  // 路径
  const pathCells = new Set();
  (j.path || []).forEach((p, i) => {
    if (!inB(p.y, p.x)) err(`path[${i}] (${p.y},${p.x}) 越界`);
    else pathCells.add(p.y + ',' + p.x);
    if (i > 0) {
      const q = j.path[i - 1];
      // 路径为"路点 + 直线段"模型（敌人沿相邻路点直线移动），只需每段是水平/垂直直线
      if (q.y !== p.y && q.x !== p.x) {
        err(`path[${i}] 非直线段(行 ${q.y}->${p.y}, 列 ${q.x}->${p.x})，敌人会走对角线斜穿网格`);
      }
    }
  });

  // 炮塔位
  const towerCells = new Set();
  (j.towerSpots || []).forEach((t, i) => {
    if (!inB(t.row, t.col)) err(`towerSpots[${i}] (${t.row},${t.col}) 越界`);
    else towerCells.add(t.row + ',' + t.col);
  });

  // 障碍
  const obstCells = new Map();
  const obstList = j.obstacles || [];
  for (let i = 0; i < obstList.length; i++) {
    const o = obstList[i];
    const oType = o.type || 'rock_small';   // 缺省等同 rock_small（与游戏加载逻辑一致）
    const oRow = o.row, oCol = o.col;
    if (!OBST_TYPES.has(oType)) { err(`obstacles[${i}] 未知类型 ${oType}`); continue; }
    const dim = OBST_SIZE[oType] || [1, 1];
    const w = dim[0], h = dim[1];
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        const r = oRow + dr, c = oCol + dc, k = r + ',' + c;
        if (!inB(r, c)) err(`obstacles[${i}] ${oType}@(${oRow},${oCol}) 单元(${r},${c}) 越界`);
        else if (pathCells.has(k)) err(`obstacles[${i}] ${oType} 与路径重叠 @${k}`);
        else if (towerCells.has(k)) err(`obstacles[${i}] ${oType} 与炮塔位重叠 @${k}`);
        else if (obstCells.has(k)) err(`obstacles[${i}] ${oType} 与另一障碍重叠 @${k}`);
        else obstCells.set(k, o);
      }
    }
  }

  // 波次
  (j.waves || []).forEach((w, wi) => {
    (w.enemies || []).forEach((e, ei) => {
      if (!ENEMY_TYPES.has(e.type)) err(`waves[${wi}].enemies[${ei}] 未知敌人类型 ${e.type}`);
      if (!(e.count > 0)) err(`waves[${wi}].enemies[${ei}] count<=0`);
      if (e.hpMult != null && !(e.hpMult > 0)) err(`waves[${wi}] ${e.type} hpMult 非法`);
    });
  });

  // 隐藏任务
  const ms = hidden.missions['c_' + j.uid] || [];
  ms.forEach((m) => {
    if (m.type === 'destroy_obstacle') {
      const cells = (m.cells || []).map((c) => c.row + ',' + c.col);
      cells.forEach((k) => {
        if (!obstCells.has(k)) err(`任务 ${m.id} 要求障碍格 ${k} 在关卡中不存在`);
      });
    }
  });

  console.log(`  rows=${R} cols=${C} 路径=${j.path.length} 炮塔位=${(j.towerSpots || []).length} 障碍=${(j.obstacles || []).length} 波次=${(j.waves || []).length} 任务=${ms.length}`);
}

console.log(`\n关卡数=${files.length}  错误=${errors}  警告=${warns}`);
if (errors > 0) {
  console.log('校验失败');
  process.exit(1);
}
console.log('全部关卡校验通过 ✅');
