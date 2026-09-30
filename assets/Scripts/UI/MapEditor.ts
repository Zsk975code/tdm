import { _decorator, Component, Node, Vec2, Vec3, Color, UITransform, Graphics, Label, EventTouch, Overflow, HorizontalTextAlignment, VerticalTextAlignment, Layers, EventKeyboard, KeyCode, input, Input, ScrollView, Mask, EventMouse } from 'cc';
const { ccclass } = _decorator;

import { LevelConfig, LEVEL_CONFIGS, saveCustomLevel, updateCustomLevel, getCustomLevels, TowerSpot, WaveData, Obstacle, ObstacleType } from '../Data/LevelData';
import { EnemyType, ENEMY_CONFIGS, ALL_ENEMY_TYPES } from '../Data/EnemyData';
import { TowerType, TOWER_CONFIGS, ALL_TOWER_TYPES } from '../Data/TowerData';
import { UIManager } from './UIManager';
import { applyTextOutline } from '../Utils/UIText';

// ================================================================
//  Constants
// ================================================================

enum EditTool {
    PATH = 0, TOWER_SPOT = 1, SPAWN = 2, END = 3, ERASE = 4,
    /** 宝箱障碍（1×1 / 1000 金，金袋） */
    CHEST = 5,
    /** 大障碍物（2×2 / 500 血） */
    LARGE = 6,
}

const TOOL_META: { name: string; color: Color; key: string }[] = [
    { name: '路径', color: new Color(200, 180, 140), key: '1' },
    { name: '炮塔位', color: new Color(100, 170, 100), key: '2' },
    { name: '起点', color: new Color(255, 80, 80), key: '3' },
    { name: '终点', color: new Color(255, 200, 50), key: '4' },
    { name: '擦除', color: new Color(70, 130, 70), key: '5' },
    { name: '宝箱', color: new Color(255, 200, 60), key: '6' },
    { name: '大障碍物', color: new Color(140, 130, 120), key: '7' },
];

const GRID_PRESETS = [
    { label: '5x9', rows: 5, cols: 9 },
    { label: '7x13', rows: 7, cols: 13 },
    { label: '9x15', rows: 9, cols: 15 },
    { label: '11x17', rows: 11, cols: 17 },
];

const CELL_SIZES = [40, 50, 60, 80];

// ================================================================
//  Undo/Redo snapshot
// ================================================================

interface EditorSnapshot {
    grid: number[][];
    pathDirs: number[][];  // per-cell direction: 0=up 1=right 2=down 3=left  -1=no-path
    rows: number;
    cols: number;
    cellSize: number;
    spawnPos: Vec2;
    endPos: Vec2;
}

// ================================================================
//  MapEditor Component
// ================================================================

@ccclass('MapEditor2')
export class MapEditor extends Component {

    // ---- grid state ----
    private grid: number[][] = [];
    private pathDirs: number[][] = [];  // 0=up 1=right 2=down 3=left, -1=not-path
    private rows: number = 9;
    private cols: number = 15;
    private cellSize: number = 60;
    private spawnPos: Vec2 = new Vec2(0, 3);
    private endPos: Vec2 = new Vec2(14, 3);
    private currentTool: EditTool = EditTool.PATH;
    private builtinLevelIdx: number = 0;
    private customLevelIdx: number = 0;
    /** 正在编辑的自定义关卡下标，-1 表示新建/内置修改 */
    private editingCustomIndex: number = -1;

    // ---- wave state ----
    private waves: WaveData[] = [];

    // ---- tower state ----
    private availableTowers: TowerType[] = [];

    // ---- level meta ----
    private levelName: string = '自定义关卡';
    private startGold: number = 300;
    private startLives: number = 10;

    // ---- editor tab ----
    private editorTab: 'wave' | 'tower' = 'wave';

    // ---- drag state ----
    private isDragging: boolean = false;

    // ---- undo/redo ----
    private undoStack: EditorSnapshot[] = [];
    private redoStack: EditorSnapshot[] = [];

    // ---- dirty flags (rendered in update(), never during event dispatch) ----
    private _dirtyGrid: boolean = true;
    private _dirtySidebar: boolean = true;

    // ---- UI node references (rebuilt in buildUI, valid until onDestroy) ----
    private root: Node = null!;
    private gridContainer: Node = null!;
    private gridGfx: Graphics | null = null;
    private sidebarRoot: Node = null!;
    private sidebarContent: Node = null!;
    private toolbarRoot: Node = null!;
    private toolBtns: Node[] = [];
    private infoLabel: Label = null!;
    private nameLabel: Label = null!;
    private goldLabel: Label = null!;
    private livesLabel: Label = null!;

    // ---- side scroll ----
    private _viewportH: number = 520;
    private _fixedWaveHeader: Node = null!;
    private _waveStatsLabel: Label = null!;
    private _addWaveBtn: Node = null!;

    // ---- keyboard ----
    private _keyHandler: any = null;

    // ================================================================
    //  Lifecycle
    // ================================================================

    onLoad(): void {
        this.root = this.node;
        this.initGrid();
        this.initDefaultWaves();
        this.availableTowers = [...ALL_TOWER_TYPES];
        this.buildStaticUI();
        // Immediately sync grid container size so touch coords are correct from frame 0
        this.renderGrid();
        this._dirtyGrid = false;
        this.renderSidebar();
        this._dirtySidebar = false;
        this.saveUndoState();
    }

    onEnable(): void {
        this.registerKeyboard();
        this._dirtyGrid = true;
        this._dirtySidebar = true;
    }

    onDisable(): void {
        this.unregisterKeyboard();
    }

    /** 所有 UI 重建都在 update 中触发，绝不在事件回调中操作节点 */
    update(_dt: number): void {
        if (this._dirtyGrid) {
            this._dirtyGrid = false;
            this.renderGrid();
        }
        if (this._dirtySidebar) {
            this._dirtySidebar = false;
            this.renderSidebar();
        }
    }

    private markDirtyGrid(): void { this._dirtyGrid = true; }
    private markDirtySidebar(): void { this._dirtySidebar = true; }

    // ================================================================
    //  Static UI (only built once)
    // ================================================================

    private buildStaticUI(): void {
        // 销毁而非 removeAllChildren：反复进出编辑器会重建静态 UI，不销毁会累积孤儿节点
        const stale = this.root.children.slice();
        for (const c of stale) {
            if (c && c.isValid) c.destroy();
        }

        // background
        this.makeRect('Bg', this.root, 1920, 1080, new Color(18, 24, 40));

        // title
        this.makeLabel('Title', this.root, 500, 40, '🗺 地图编辑器', 28, Color.YELLOW, 0, 470);

        // back button
        const backBtn = this.makeRect('BackBtn', this.root, 130, 36, new Color(55, 55, 75), -800, 470);
        this.makeLabel('BackTxt', backBtn, 130, 36, '← 返回', 16, Color.WHITE);
        backBtn.on(Node.EventType.TOUCH_END, () => { UIManager.instance?.showMainMenu(); }, this);

        // toolbar
        this.buildToolbar();

        // grid area (placeholder node)
        this.gridContainer = this.makeNode('GridContainer', this.root, 1200, 800, 0, 0);
        this.gridGfx = this.gridContainer.addComponent(Graphics);

        // enable drag + click on grid
        this.gridContainer.on(Node.EventType.TOUCH_START, this.onGridTouchStart, this);
        this.gridContainer.on(Node.EventType.TOUCH_MOVE, this.onGridTouchMove, this);
        this.gridContainer.on(Node.EventType.TOUCH_END, this.onGridTouchEnd, this);

        // sidebar panel
        this.buildSidebarFrame();

        // info bar at bottom
        this.infoLabel = this.makeLabel('InfoBar', this.root, 900, 24, '', 12, new Color(160, 175, 190), 0, -490);
    }

    private buildToolbar(): void {
        this.toolbarRoot = this.makeNode('Toolbar', this.root, 800, 50, 0, 410);
        this.toolBtns = [];

        const btnW = 100, gap = 10;
        const totalW = TOOL_META.length * btnW + (TOOL_META.length - 1) * gap;
        const startX = -totalW / 2 + btnW / 2;

        for (let i = 0; i < TOOL_META.length; i++) {
            const meta = TOOL_META[i];
            const btn = this.makeRect(`Tool_${i}`, this.toolbarRoot, btnW, 44, meta.color, startX + i * (btnW + gap), 0);
            this.makeLabel('Txt', btn, btnW, 44, `[${meta.key}] ${meta.name}`, 13, Color.WHITE);
            const toolIdx = i;
            btn.on(Node.EventType.TOUCH_END, () => { this.setTool(toolIdx as EditTool); }, this);
            this.toolBtns.push(btn);
        }
        this.highlightTool(EditTool.PATH);
    }

    private buildSidebarFrame(): void {
        this.sidebarRoot = this.makeRect('Sidebar', this.root, 340, 700, new Color(22, 30, 48, 240), 575, -30);

        this.makeLabel('SidebarTitle', this.sidebarRoot, 160, 28, '关卡设计', 18, Color.YELLOW, -90, 316);

        // tab buttons at top of sidebar
        const waveTab = this.makeRect('TabWave', this.sidebarRoot, 100, 32, new Color(60, 130, 200), -50, 290);
        this.makeLabel('TabW', waveTab, 100, 32, '波次设计', 14, Color.WHITE);
        waveTab.on(Node.EventType.TOUCH_END, () => { this.switchEditorTab('wave'); }, this);

        const towerTab = this.makeRect('TabTower', this.sidebarRoot, 100, 32, new Color(50, 60, 80), 50, 290);
        this.makeLabel('TabT', towerTab, 100, 32, '炮塔选择', 14, Color.WHITE);
        towerTab.on(Node.EventType.TOUCH_END, () => { this.switchEditorTab('tower'); }, this);
        (this as any)._tabWaveBtn = waveTab;
        (this as any)._tabTowerBtn = towerTab;

        // ---- Fixed header (outside ScrollView — never destroyed) ----
        this._fixedWaveHeader = this.makeNode('FixedWaveHeader', this.sidebarRoot, 320, 26, 0, 258);
        this.makeLabel('FWHdr', this._fixedWaveHeader, 140, 24, '波次列表', 16, Color.WHITE, -90, 2);
        this._addWaveBtn = this.makeRect('AddWave', this._fixedWaveHeader, 90, 26, new Color(50, 140, 50), 100, 3);
        this.makeLabel('AddWTxt', this._addWaveBtn, 90, 26, '+ 波次', 11, Color.WHITE);
        this._addWaveBtn.on(Node.EventType.TOUCH_END, () => { this.addWave(); }, this);

        this._waveStatsLabel = this.makeLabel('WaveStats', this.sidebarRoot, 280, 18, '1 波 · 共 5 个敌人', 10, new Color(140, 160, 180), 10, 230);

        // ScrollView: the scrollable area below the fixed header
        this._viewportH = 520;
        const scrollViewNode = this.makeNode('ScrollView', this.sidebarRoot, 320, this._viewportH, 0, -55);

        // Mask for clipping — add Graphics BEFORE setting mask type, since
        // GRAPHICS_RECT auto-adds a Graphics that would conflict with manual add.
        const maskGfx = scrollViewNode.addComponent(Graphics);
        maskGfx.fillColor = Color.WHITE;
        maskGfx.rect(-160, -this._viewportH / 2, 320, this._viewportH);
        maskGfx.fill();
        const mask = scrollViewNode.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;

        // ScrollView component
        const sv = scrollViewNode.addComponent(ScrollView);
        sv.vertical = true;
        sv.horizontal = false;
        sv.inertia = true;
        sv.brake = 0.75;
        sv.elastic = true;
        sv.bounceDuration = 0.2;

        // Content node — anchor at top-center so y=0 = content top
        this.sidebarContent = this.makeNode('ScrollContent', scrollViewNode, 320, this._viewportH, 0, 0);
        const scTf = this.sidebarContent.getComponent(UITransform)!;
        scTf.setAnchorPoint(0.5, 1.0);
        this.sidebarContent.setPosition(0, this._viewportH / 2, 0);
        sv.content = this.sidebarContent;
    }

    // ================================================================
    //  Render Grid (runs in update(), safe to destroy nodes here)
    // ================================================================

    private renderGrid(): void {
        if (!this.gridGfx || !this.gridContainer) return;
        const g = this.gridGfx!;
        g.clear();
        const cs = this.cellSize;
        const gridW = this.cols * cs;
        const gridH = this.rows * cs;

        // Resize container to match actual grid so touch coordinates align
        this.gridContainer.getComponent(UITransform)!.setContentSize(gridW, gridH);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                // 与游戏运行时坐标系一致：row 0 在顶部（y 向下递减）
                // g.rect 取左下角为原点，故 row r 的左下角 y = 上边界 - (r+1) 格
                const x = -gridW / 2 + c * cs;
                const y = gridH / 2 - (r + 1) * cs;

                if (r === this.spawnPos.y && c === this.spawnPos.x) {
                    g.fillColor = new Color(255, 70, 70);
                } else if (r === this.endPos.y && c === this.endPos.x) {
                    g.fillColor = new Color(255, 200, 50);
                } else if (this.grid[r][c] === 1) {
                    g.fillColor = new Color(200, 180, 140);
                } else if (this.grid[r][c] === 2) {
                    g.fillColor = new Color(100, 170, 100);
                } else if (this.grid[r][c] === 3) {
                    g.fillColor = new Color(255, 120, 200);
                } else if (this.grid[r][c] === 4) {
                    g.fillColor = new Color(140, 130, 120);
                } else {
                    // 0 = 空白（运行时自动成为 1×1 小障碍物岩石）
                    g.fillColor = new Color(118, 106, 92);
                }
                g.rect(x, y, cs - 1, cs - 1);
                g.fill();
            }
        }

        // Direction arrows on path cells (user-set per-cell direction)
        const arrowSize = Math.max(3, cs / 5);
        g.fillColor = new Color(80, 60, 30);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] !== 1 || this.pathDirs[r][c] < 0) continue;
                const dir = this.pathDirs[r][c];
                const cx = -gridW / 2 + c * cs + cs / 2;
                const cy = gridH / 2 - r * cs - cs / 2;
                const as = arrowSize;
                switch (dir) {
                    case 0: // up ▴
                        g.moveTo(cx, cy + as); g.lineTo(cx - as, cy - as); g.lineTo(cx + as, cy - as);
                        break;
                    case 2: // down ▾
                        g.moveTo(cx, cy - as); g.lineTo(cx - as, cy + as); g.lineTo(cx + as, cy + as);
                        break;
                    case 1: // right ▸
                        g.moveTo(cx + as, cy); g.lineTo(cx - as, cy - as); g.lineTo(cx - as, cy + as);
                        break;
                    case 3: // left ◂
                        g.moveTo(cx - as, cy); g.lineTo(cx + as, cy - as); g.lineTo(cx + as, cy + as);
                        break;
                }
                g.close(); g.fill();
            }
        }

        // start/end markers
        const markerR = 8;
        const sx = -gridW / 2 + this.spawnPos.x * cs + cs / 2;
        const sy = gridH / 2 - this.spawnPos.y * cs - cs / 2;
        const ex = -gridW / 2 + this.endPos.x * cs + cs / 2;
        const ey = gridH / 2 - this.endPos.y * cs - cs / 2;

        g.strokeColor = Color.WHITE;
        g.lineWidth = 2;
        g.circle(sx, sy, markerR); g.stroke();
        g.circle(ex, ey, markerR); g.stroke();

        // info
        let pathCount = 0, towerCount = 0, chestCount = 0, largeCount = 0;
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] === 1) pathCount++;
                if (this.grid[r][c] === 2) towerCount++;
                if (this.grid[r][c] === 3) chestCount++;
                if (this.grid[r][c] === 4) largeCount++;
            }
        this.infoLabel.string = `起点(${this.spawnPos.x},${this.spawnPos.y}) → 终点(${this.endPos.x},${this.endPos.y})  |  路径:${pathCount}  炮塔位:${towerCount}  宝箱:${chestCount}  大障碍:${largeCount}  |  ${this.rows}x${this.cols}  cs=${this.cellSize}`;
    }

    // ================================================================
    //  Render Sidebar (runs in update(), safe to destroy nodes here)
    // ================================================================

    private renderSidebar(): void {
        if (!this.sidebarContent) return;
        // update tab button highlights
        const waveBtn: Node = (this as any)._tabWaveBtn;
        const towerBtn: Node = (this as any)._tabTowerBtn;
        if (waveBtn && towerBtn) {
            this.redrawTabBtn(waveBtn, this.editorTab === 'wave');
            this.redrawTabBtn(towerBtn, this.editorTab === 'tower');
        }

        // Toggle fixed wave header visibility
        const isWaveTab = this.editorTab === 'wave';
        if (this._fixedWaveHeader) this._fixedWaveHeader.active = isWaveTab;
        if (this._waveStatsLabel) this._waveStatsLabel.node.active = isWaveTab;

        // destroy previous content (use destroyAllChildren to avoid orphaned nodes in ScrollView)
        this.sidebarContent.destroyAllChildren();

        if (this.editorTab === 'wave') {
            this.renderWaveEditor();
        } else {
            this.renderTowerSelector();
        }
    }

    private redrawTabBtn(btn: Node, active: boolean): void {
        const g = btn.getComponent(Graphics);
        if (!g) return;
        g.clear();
        g.fillColor = active ? new Color(60, 130, 200) : new Color(50, 60, 80);
        const tf = btn.getComponent(UITransform)!;
        g.rect(-tf.width / 2, -tf.height / 2, tf.width, tf.height);
        g.fill();
    }

    // ---- wave editor ----

    private renderWaveEditor(): void {
        const cw = 300;
        let y = -8; // y=0 = content top; start 8px below top

        for (let wi = 0; wi < this.waves.length; wi++) {
            const wave = this.waves[wi];
            const groupCount = wave.enemies.length;
            const cardH = 40 + groupCount * 34;
            const cardColor = new Color(36, 44, 62);
            const cardCenterY = y - cardH / 2;
            const card = this.makeRect(`Wave_${wi}`, this.sidebarContent, cw, cardH, cardColor, 0, cardCenterY);

            // wave header — relative to card top (y)
            const waveEnemyTotal = wave.enemies.reduce((s, g) => s + g.count, 0);
            this.makeLabel(`WHdr_${wi}`, card, 160, 20, `📦 波次 ${wi + 1}  (${waveEnemyTotal}只)`, 13, new Color(100, 200, 255), -70, cardH / 2 - 18);

            // action buttons — relative to card top
            const dupBtn = this.makeRect(`DupW_${wi}`, card, 36, 20, new Color(50, 90, 140), cw / 2 - 60, cardH / 2 - 18);
            this.makeLabel('DupTxt', dupBtn, 36, 20, '📋', 12, Color.WHITE);
            dupBtn.on(Node.EventType.TOUCH_END, () => { this.duplicateWave(wi); }, this);

            if (this.waves.length > 1) {
                const delBtn = this.makeRect(`DelW_${wi}`, card, 36, 20, new Color(150, 50, 50), cw / 2 - 26, cardH / 2 - 18);
                this.makeLabel('DelTxt', delBtn, 36, 20, '✗', 14, Color.WHITE);
                delBtn.on(Node.EventType.TOUCH_END, () => { this.removeWave(wi); }, this);
            }

            // enemy groups — relative to card top
            for (let gi = 0; gi < groupCount; gi++) {
                const group = wave.enemies[gi];
                const gy = cardH / 2 - 42 - gi * 34;
                const cfg = ENEMY_CONFIGS[group.type];
                if (!cfg) continue;

                const row = this.makeRect(`Grp_${wi}_${gi}`, card, cw - 10, 28, new Color(50, 57, 72), 0, gy);

                const typeBtn = this.makeRect(`Type_${wi}_${gi}`, row, 66, 22, this.enemyColor(group.type), -115, 0);
                this.makeLabel(`TN_${wi}_${gi}`, typeBtn, 66, 22, cfg.name, 9, Color.WHITE);
                typeBtn.on(Node.EventType.TOUCH_END, () => { this.cycleEnemyType(wi, gi); }, this);

                const cMinus = this.makeRect(`CM_${wi}_${gi}`, row, 18, 18, new Color(130, 50, 50), -54, 0);
                this.makeLabel('cm', cMinus, 18, 18, '−', 14, Color.WHITE);
                cMinus.on(Node.EventType.TOUCH_END, () => { this.adjustEnemy(wi, gi, 'count', -1); }, this);
                this.makeLabel(`CV_${wi}_${gi}`, row, 24, 16, `${group.count}`, 10, Color.YELLOW, -34, 0);
                const cPlus = this.makeRect(`CP_${wi}_${gi}`, row, 18, 18, new Color(50, 130, 50), -20, 0);
                this.makeLabel('cp', cPlus, 18, 18, '+', 14, Color.WHITE);
                cPlus.on(Node.EventType.TOUCH_END, () => { this.adjustEnemy(wi, gi, 'count', 1); }, this);

                this.makeLabel(`IV_${wi}_${gi}`, row, 30, 14, `${group.interval}s`, 9, new Color(180, 190, 200), 12, 0);
                const iMinus = this.makeRect(`IM_${wi}_${gi}`, row, 16, 16, new Color(130, 50, 50), 34, 0);
                this.makeLabel('im', iMinus, 16, 16, '−', 11, Color.WHITE);
                iMinus.on(Node.EventType.TOUCH_END, () => { this.adjustEnemy(wi, gi, 'interval', -0.1); }, this);
                const iPlus = this.makeRect(`IP_${wi}_${gi}`, row, 16, 16, new Color(50, 130, 50), 50, 0);
                this.makeLabel('ip', iPlus, 16, 16, '+', 11, Color.WHITE);
                iPlus.on(Node.EventType.TOUCH_END, () => { this.adjustEnemy(wi, gi, 'interval', 0.1); }, this);

                this.makeLabel(`DV_${wi}_${gi}`, row, 30, 14, `${group.delay}s`, 9, new Color(180, 190, 200), 72, 0);
                const dMinus = this.makeRect(`DM_${wi}_${gi}`, row, 16, 16, new Color(130, 50, 50), 94, 0);
                this.makeLabel('dm', dMinus, 16, 16, '−', 11, Color.WHITE);
                dMinus.on(Node.EventType.TOUCH_END, () => { this.adjustEnemy(wi, gi, 'delay', -1); }, this);
                const dPlus = this.makeRect(`DP_${wi}_${gi}`, row, 16, 16, new Color(50, 130, 50), 110, 0);
                this.makeLabel('dp', dPlus, 16, 16, '+', 11, Color.WHITE);
                dPlus.on(Node.EventType.TOUCH_END, () => { this.adjustEnemy(wi, gi, 'delay', 1); }, this);

                if (groupCount > 1) {
                    const delGrp = this.makeRect(`DG_${wi}_${gi}`, row, 20, 18, new Color(140, 40, 40), 136, 0);
                    this.makeLabel('dg', delGrp, 20, 18, '✗', 10, Color.WHITE);
                    delGrp.on(Node.EventType.TOUCH_END, () => { this.removeEnemyGroup(wi, gi); }, this);
                }
            }

            const addGrp = this.makeRect(`AG_${wi}`, card, 90, 20, new Color(60, 110, 60), 0, -cardH / 2 + 14);
            this.makeLabel('AGTxt', addGrp, 90, 20, '+ 怪物组', 10, Color.WHITE);
            addGrp.on(Node.EventType.TOUCH_END, () => { this.addEnemyGroup(wi); }, this);

            y -= (cardH + 10);
        }

        // level controls at bottom of wave editor; returns final y after all controls
        const finalY = this.renderLevelControls(y - 10);

        // Resize content to fit wave cards + level controls
        const neededH = Math.max(-finalY + 30, this._viewportH);
        this.sidebarContent.getComponent(UITransform)!.setContentSize(320, neededH);
    }

    private renderLevelControls(startY: number): number {
        let y = startY;
        // divider
        this.makeLine('Div', this.sidebarContent, 290, new Color(80, 80, 100), 0, y);
        y -= 18;

        this.makeLabel('NameLbl', this.sidebarContent, 50, 20, '名称:', 11, Color.WHITE, -120, y);
        this.nameLabel = this.makeLabel('NameVal', this.sidebarContent, 130, 20, this.levelName, 12, Color.CYAN, -30, y);
        const renameBtn = this.makeRect('Rename', this.sidebarContent, 50, 24, new Color(50, 70, 120), 60, y);
        this.makeLabel('RnmTxt', renameBtn, 50, 24, '✎', 14, Color.WHITE);
        renameBtn.on(Node.EventType.TOUCH_END, () => { this.onEditName(); }, this);
        y -= 30;

        // gold
        this.makeLabel('GoldLbl', this.sidebarContent, 40, 20, '💰', 14, Color.WHITE, -125, y);
        this.stepperBtn('GM', -85, y, () => { this.startGold = Math.max(50, this.startGold - 50); this.goldLabel.string = `${this.startGold}`; });
        this.goldLabel = this.makeLabel('GoldVal', this.sidebarContent, 60, 20, `${this.startGold}`, 14, Color.YELLOW, -52, y);
        this.stepperBtn('GP', -18, y, () => { this.startGold = Math.min(99999, this.startGold + 50); this.goldLabel.string = `${this.startGold}`; }, true);
        // lives
        this.makeLabel('LivesLbl', this.sidebarContent, 40, 20, '❤️', 14, Color.WHITE, 25, y);
        this.stepperBtn('LM', 60, y, () => { this.startLives = Math.max(1, this.startLives - 1); this.livesLabel.string = `${this.startLives}`; });
        this.livesLabel = this.makeLabel('LivesVal', this.sidebarContent, 40, 20, `${this.startLives}`, 14, Color.YELLOW, 93, y);
        this.stepperBtn('LP', 118, y, () => { this.startLives = Math.min(99, this.startLives + 1); this.livesLabel.string = `${this.startLives}`; }, true);
        y -= 32;

        // grid presets
        this.makeLabel('GridLbl', this.sidebarContent, 50, 18, '网格:', 10, Color.WHITE, -135, y);
        for (let i = 0; i < GRID_PRESETS.length; i++) {
            const p = GRID_PRESETS[i];
            const btn = this.makeRect(`GridP_${i}`, this.sidebarContent, 58, 22, new Color(48, 56, 72), -70 + i * 64, y);
            this.makeLabel('GpTxt', btn, 58, 22, p.label, 10, Color.WHITE);
            const pr = p.rows, pc = p.cols;
            btn.on(Node.EventType.TOUCH_END, () => { this.resizeGrid(pr, pc); }, this);
        }
        y -= 24;

        this.makeLabel('CellLbl', this.sidebarContent, 50, 18, '单元:', 10, Color.WHITE, -135, y);
        for (let i = 0; i < CELL_SIZES.length; i++) {
            const cs = CELL_SIZES[i];
            const btn = this.makeRect(`Cell_${cs}`, this.sidebarContent, 44, 22, new Color(48, 56, 72), -70 + i * 50, y);
            this.makeLabel('CsTxt', btn, 44, 22, `${cs}`, 10, Color.WHITE);
            btn.on(Node.EventType.TOUCH_END, () => { this.cellSize = cs; this.markDirtyGrid(); }, this);
        }
        y -= 40;

        // action buttons — 第一行：保存 / 循环加载内置
        const saveBtn = this.makeRect('SaveBtn', this.sidebarContent, 110, 34, new Color(50, 140, 50), -80, y);
        this.makeLabel('SvTxt', saveBtn, 110, 34, '💾 保存', 13, Color.WHITE);
        saveBtn.on(Node.EventType.TOUCH_END, () => { this.saveLevel(); }, this);

        const loadBtn = this.makeRect('LoadBtn', this.sidebarContent, 110, 34, new Color(50, 70, 140), 30, y);
        this.makeLabel('LdTxt', loadBtn, 110, 34, '🔁 加载内置', 12, Color.WHITE);
        loadBtn.on(Node.EventType.TOUCH_END, () => { this.cycleBuiltinLevel(); }, this);
        y -= 40;

        // action buttons — 第二行：加载自定义 / 导入 / 导出
        const custBtn = this.makeRect('CustBtn', this.sidebarContent, 100, 34, new Color(90, 70, 120), -100, y);
        this.makeLabel('CuTxt', custBtn, 100, 34, '📂 我的关卡', 12, Color.WHITE);
        custBtn.on(Node.EventType.TOUCH_END, () => { this.cycleCustomLevel(); }, this);

        const impBtn = this.makeRect('ImpBtn', this.sidebarContent, 100, 34, new Color(60, 100, 60), 0, y);
        this.makeLabel('ImTxt', impBtn, 100, 34, '📥 导入', 13, Color.WHITE);
        impBtn.on(Node.EventType.TOUCH_END, () => { this.importLevelFromFile(); }, this);
        impBtn.on(Node.EventType.MOUSE_DOWN, (e: EventMouse) => {
            if (e.getButton() === EventMouse.BUTTON_RIGHT) this.importFromClipboard();
        }, this);

        const expBtn = this.makeRect('ExpBtn', this.sidebarContent, 100, 34, new Color(100, 80, 50), 100, y);
        this.makeLabel('ExTxt', expBtn, 100, 34, '📤 导出', 13, Color.WHITE);
        expBtn.on(Node.EventType.TOUCH_END, () => { this.exportLevel(); }, this);

        y -= 40;

        const undoBtn = this.makeRect('UndoBtn', this.sidebarContent, 80, 28, new Color(55, 60, 80), -110, y);
        this.makeLabel('UdTxt', undoBtn, 80, 28, '↩ 撤销', 11, Color.WHITE);
        undoBtn.on(Node.EventType.TOUCH_END, () => { this.undo(); }, this);

        const redoBtn = this.makeRect('RedoBtn', this.sidebarContent, 80, 28, new Color(55, 60, 80), -28, y);
        this.makeLabel('RdTxt', redoBtn, 80, 28, '↪ 重做', 11, Color.WHITE);
        redoBtn.on(Node.EventType.TOUCH_END, () => { this.redo(); }, this);

        const clearBtn = this.makeRect('ClearBtn', this.sidebarContent, 80, 28, new Color(140, 50, 50), 54, y);
        this.makeLabel('ClTxt', clearBtn, 80, 28, '清空', 11, Color.WHITE);
        clearBtn.on(Node.EventType.TOUCH_END, () => { this.clearGrid(); }, this);
        return y;
    }

    private stepperBtn(name: string, x: number, y: number, cb: () => void, plus = false): void {
        const c = plus ? new Color(50, 130, 50) : new Color(130, 50, 50);
        const txt = plus ? '+' : '−';
        const btn = this.makeRect(name, this.sidebarContent, 24, 24, c, x, y);
        this.makeLabel('StTxt', btn, 24, 24, txt, 14, Color.WHITE);
        btn.on(Node.EventType.TOUCH_END, cb, this);
    }

    // ---- tower selector ----

    private renderTowerSelector(): void {
        let y = -4; // y=0 = content top
        this.makeLabel('TowerTitle', this.sidebarContent, 200, 24, '可选择建造的炮塔', 15, Color.WHITE, -50, y);

        const allBtn = this.makeRect('SelAll', this.sidebarContent, 60, 22, new Color(60, 110, 60), 120, y + 2);
        this.makeLabel('AllTxt', allBtn, 60, 22, '全选', 10, Color.WHITE);
        allBtn.on(Node.EventType.TOUCH_END, () => { this.selectAllTowers(true); }, this);
        y -= 30;

        const cols = 2, itemW = 155, itemH = 42, gapX = 10, gapY = 6;
        const startX = -(cols * itemW + (cols - 1) * gapX) / 2 + itemW / 2;

        for (let i = 0; i < ALL_TOWER_TYPES.length; i++) {
            const type = ALL_TOWER_TYPES[i];
            const cfg = TOWER_CONFIGS[type][0];
            const col = i % cols, row = Math.floor(i / cols);
            const ix = startX + col * (itemW + gapX);
            const iy = y - row * (itemH + gapY) - itemH / 2;

            const isAvail = this.availableTowers.indexOf(type) >= 0;
            const item = this.makeRect(`TSel_${type}`, this.sidebarContent, itemW, itemH,
                isAvail ? new Color(48, 60, 48) : new Color(48, 48, 48), ix, iy);

            this.makeRect('Clr', item, 18, 18, this.towerColor(type), -58, 0);
            this.makeLabel(`TNm`, item, 82, 18, cfg.name, 10, isAvail ? Color.WHITE : new Color(120, 120, 120), -13, 0);
            this.makeLabel(`TCt`, item, 52, 18, `💰${cfg.cost}`, 10, isAvail ? Color.YELLOW : new Color(90, 90, 90), 53, 0);

            item.on(Node.EventType.TOUCH_END, () => { this.toggleTower(type); }, this);
        }

        // Content height for tower tab — fits in viewport
        const neededH = Math.max(200, this._viewportH);
        this.sidebarContent.getComponent(UITransform)!.setContentSize(320, neededH);
    }

    // ================================================================
    //  Tool switching
    // ================================================================

    private setTool(tool: EditTool): void {
        this.currentTool = tool;
        this.highlightTool(tool);
    }

    private highlightTool(tool: EditTool): void {
        this.toolBtns.forEach((btn, i) => {
            const g = btn.getComponent(Graphics);
            if (!g) return;
            g.strokeColor = i === tool ? Color.WHITE : new Color(0, 0, 0, 0);
            g.lineWidth = 2;
            const tf = btn.getComponent(UITransform)!;
            g.rect(-tf.width / 2, -tf.height / 2, tf.width, tf.height);
            g.stroke();
        });
    }

    // ================================================================
    //  Grid editing (event handlers: ONLY modify data + mark dirty)
    // ================================================================

    private cellFromEvent(event: EventTouch): { row: number; col: number } | null {
        const gtf = this.gridContainer.getComponent(UITransform)!;
        const uiPos = event.getUILocation();
        const local = gtf.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
        // Use actual grid pixel dimensions (container is now sized to grid in renderGrid)
        const gridW = gtf.width;
        const gridH = gtf.height;
        const col = Math.floor((local.x + gridW / 2) / this.cellSize);
        // row 0 在顶部：local.y 越靠上 → row 越小
        const row = Math.floor((gridH / 2 - local.y) / this.cellSize);
        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
        return { row, col };
    }

    private applyTool(row: number, col: number): void {
        switch (this.currentTool) {
            case EditTool.PATH:
                if (this.grid[row][col] !== 1) {
                    // Set as path with default direction (right = 1)
                    this.grid[row][col] = 1;
                    this.pathDirs[row][col] = 1;
                } else {
                    // Cycle direction: 0→1→2→3→0 (up→right→down→left→up)
                    this.pathDirs[row][col] = (this.pathDirs[row][col] + 1) % 4;
                }
                this.markDirtyGrid();
                break;
            case EditTool.TOWER_SPOT:
                this.grid[row][col] = this.grid[row][col] === 2 ? 0 : 2;
                this.markDirtyGrid();
                break;
case EditTool.CHEST:
                if (!this.isBlockedForObstacle(row, col)) {
                    this.grid[row][col] = this.grid[row][col] === 3 ? 0 : 3;
                    this.markDirtyGrid();
                }
                break;
            case EditTool.LARGE:
                // 大障碍物：以点击格为左上角绘制 2×2（不覆盖路径/塔位/出入口）
                for (let dr = 0; dr < 2; dr++) {
                    for (let dc = 0; dc < 2; dc++) {
                        const rr = row + dr, cc = col + dc;
                        if (rr >= this.rows || cc >= this.cols) continue;
                        if (this.isBlockedForObstacle(rr, cc)) continue;
                        this.grid[rr][cc] = 4;
                    }
                }
                this.markDirtyGrid();
                break;
            case EditTool.SPAWN:
                this.spawnPos = new Vec2(col, row);
                this.markDirtyGrid();
                break;
            case EditTool.END:
                this.endPos = new Vec2(col, row);
                this.markDirtyGrid();
                break;
            case EditTool.ERASE:
                if (this.grid[row][col] !== 0) {
                    this.grid[row][col] = 0;
                    this.pathDirs[row][col] = -1;
                    this.markDirtyGrid();
                }
                break;
        }
    }

    /** 障碍物不能绘制的格：路径、塔位、出生/终点 */
    private isBlockedForObstacle(r: number, c: number): boolean {
        if (this.grid[r][c] === 1 || this.grid[r][c] === 2) return true;
        if ((c === this.spawnPos.x && r === this.spawnPos.y) || (c === this.endPos.x && r === this.endPos.y)) return true;
        return false;
    }

/** 从 grid 推导障碍物数据：3=宝箱 1×1，4=大障碍 2×2（相邻 4 合并，非法落点降级为 1×1） */
    private buildObstaclesFromGrid(): Obstacle[] {
        const obstacles: Obstacle[] = [];
        const used: boolean[][] = this.grid.map(r => r.map(() => false));
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const v = this.grid[r][c];
                if (v === 3) {
                    if (!this.isBlockedForObstacle(r, c)) {
                        obstacles.push({ row: r, col: c, type: ObstacleType.CHEST_SMALL });
                        used[r][c] = true;
                    }
                } else if (v === 4 && !used[r][c]) {
                    const fits = r + 1 < this.rows && c + 1 < this.cols
                        && !used[r][c] && !used[r][c + 1] && !used[r + 1][c] && !used[r + 1][c + 1]
                        && !this.isBlockedForObstacle(r, c) && !this.isBlockedForObstacle(r, c + 1)
                        && !this.isBlockedForObstacle(r + 1, c) && !this.isBlockedForObstacle(r + 1, c + 1);
                    if (fits) {
                        obstacles.push({ row: r, col: c, type: ObstacleType.ROCK_BIG });
                        used[r][c] = used[r][c + 1] = used[r + 1][c] = used[r + 1][c + 1] = true;
                    } else if (!this.isBlockedForObstacle(r, c)) {
                        obstacles.push({ row: r, col: c, type: ObstacleType.ROCK_SMALL });
                        used[r][c] = true;
                    } else {
                        used[r][c] = true;
                    }
                } else if (v === 4) {
                    used[r][c] = true;
                }
            }
        }
        return obstacles;
    }

    /** 将障碍物数据写回 grid（导入/加载关卡用）：rock_big → 4（2×2），chest_small → 3 */
    private applyObstaclesToGrid(obstacles: Obstacle[] | undefined): void {
        if (!Array.isArray(obstacles)) return;
        for (const o of obstacles) {
            if (!o || !Number.isFinite(o.row) || !Number.isFinite(o.col)) continue;
            const r = Math.floor(o.row), c = Math.floor(o.col);
            if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
            if (o.type === ObstacleType.ROCK_BIG) {
                for (let dr = 0; dr < 2; dr++) {
                    for (let dc = 0; dc < 2; dc++) {
                        const rr = r + dr, cc = c + dc;
                        if (rr < this.rows && cc < this.cols && !this.isBlockedForObstacle(rr, cc)) {
                            this.grid[rr][cc] = 4;
                        }
                    }
                }
            } else if (o.type === ObstacleType.CHEST_SMALL) {
                if (!this.isBlockedForObstacle(r, c)) this.grid[r][c] = 3;
            }
            // 普通 1×1 岩石障碍 = 空白格默认小障碍，无需写回
        }
    }

    private onGridTouchStart(event: EventTouch): void {
        const cell = this.cellFromEvent(event);
        if (!cell) return;
        this.isDragging = true;
        this.saveUndoState(); // snapshot before drag begins
        this.applyTool(cell.row, cell.col);
    }

    private onGridTouchMove(event: EventTouch): void {
        if (!this.isDragging) return;
        const cell = this.cellFromEvent(event);
        if (!cell) return;
        // only apply continuous tools (path, erase)
        if (this.currentTool === EditTool.PATH || this.currentTool === EditTool.ERASE) {
            this.applyTool(cell.row, cell.col);
        }
    }

    private onGridTouchEnd(_event: EventTouch): void {
        this.isDragging = false;
    }

    private clearGrid(): void {
        this.saveUndoState();
        this.initGrid();
        this.markDirtyGrid();
    }

    private resizeGrid(rows: number, cols: number): void {
        this.saveUndoState();
        this.rows = rows;
        this.cols = cols;
        this.spawnPos.x = Math.min(this.spawnPos.x, cols - 1);
        this.spawnPos.y = Math.min(this.spawnPos.y, rows - 1);
        this.endPos.x = Math.min(this.endPos.x, cols - 1);
        this.endPos.y = Math.min(this.endPos.y, rows - 1);
        this.cellSize = this.rows >= 9 ? 50 : 60;
        this.initGrid();
        this.markDirtyGrid();
    }

    // ================================================================
    //  Wave data CRUD (event handlers: ONLY modify data + mark dirty)
    // ================================================================

    private initDefaultWaves(): void {
        this.waves = [{
            waveIndex: 0,
            enemies: [{ type: EnemyType.NORMAL, count: 5, interval: 1.5, delay: 0 }],
        }];
    }

    private updateWaveStats(): void {
        if (!this._waveStatsLabel) return;
        const total = this.waves.reduce((s, w) =>
            s + w.enemies.reduce((gs, g) => gs + g.count, 0), 0);
        this._waveStatsLabel.string = `${this.waves.length} 波 · 共 ${total} 个敌人`;
    }

    private addWave(): void {
        if (this.waves.length >= 20) { this.infoLabel.string = '最多 20 波'; return; }
        this.waves.push({
            waveIndex: this.waves.length,
            enemies: [{ type: EnemyType.NORMAL, count: 5, interval: 1.5, delay: 0 }],
        });
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    private removeWave(index: number): void {
        if (index < 0 || index >= this.waves.length) return;
        if (this.waves.length <= 1) return;
        this.waves.splice(index, 1);
        for (let i = 0; i < this.waves.length; i++) this.waves[i].waveIndex = i;
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    private duplicateWave(index: number): void {
        if (index < 0 || index >= this.waves.length) return;
        if (this.waves.length >= 20) { this.infoLabel.string = '最多 20 波'; return; }
        const src = this.waves[index];
        const clone: WaveData = {
            waveIndex: this.waves.length,
            enemies: src.enemies.map(e => ({ ...e })),
        };
        this.waves.splice(index + 1, 0, clone);
        for (let i = 0; i < this.waves.length; i++) this.waves[i].waveIndex = i;
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    private addEnemyGroup(waveIndex: number): void {
        if (waveIndex < 0 || waveIndex >= this.waves.length) return;
        if (this.waves[waveIndex].enemies.length >= 15) { this.infoLabel.string = '单波次最多 15 组'; return; }
        this.waves[waveIndex].enemies.push({ type: EnemyType.NORMAL, count: 3, interval: 1.0, delay: 3 });
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    private removeEnemyGroup(waveIndex: number, groupIndex: number): void {
        if (waveIndex < 0 || waveIndex >= this.waves.length) return;
        const wave = this.waves[waveIndex];
        if (wave.enemies.length <= 1) return;
        if (groupIndex < 0 || groupIndex >= wave.enemies.length) return;
        wave.enemies.splice(groupIndex, 1);
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    private cycleEnemyType(waveIndex: number, groupIndex: number): void {
        if (waveIndex < 0 || waveIndex >= this.waves.length) return;
        const wave = this.waves[waveIndex];
        if (groupIndex < 0 || groupIndex >= wave.enemies.length) return;
        const group = wave.enemies[groupIndex];
        const idx = ALL_ENEMY_TYPES.indexOf(group.type);
        group.type = ALL_ENEMY_TYPES[(idx + 1) % ALL_ENEMY_TYPES.length];
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    private adjustEnemy(waveIndex: number, groupIndex: number, field: string, delta: number): void {
        if (waveIndex < 0 || waveIndex >= this.waves.length) return;
        const wave = this.waves[waveIndex];
        if (groupIndex < 0 || groupIndex >= wave.enemies.length) return;
        const group = wave.enemies[groupIndex];
        switch (field) {
            case 'count': group.count = Math.max(1, Math.min(100, group.count + delta)); break;
            case 'interval': group.interval = Math.max(0.1, +(group.interval + delta).toFixed(1)); break;
            case 'delay': group.delay = Math.max(0, group.delay + delta); break;
        }
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    // ================================================================
    //  Tower selection
    // ================================================================

    private toggleTower(type: TowerType): void {
        const idx = this.availableTowers.indexOf(type);
        if (idx >= 0) this.availableTowers.splice(idx, 1);
        else {
            this.availableTowers.push(type);
            this.availableTowers.sort((a, b) => ALL_TOWER_TYPES.indexOf(a) - ALL_TOWER_TYPES.indexOf(b));
        }
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    private selectAllTowers(select: boolean): void {
        this.availableTowers = select ? [...ALL_TOWER_TYPES] : [];
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    // ================================================================
    //  Tab switching
    // ================================================================

    private switchEditorTab(tab: 'wave' | 'tower'): void {
        this.editorTab = tab;
        if (tab === 'wave') this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
    }

    // ================================================================
    //  Level persistence
    // ================================================================

    /** Build waypoint path from start to end by following user-set direction arrows.
     *  Falls back to BFS shortest-path if direction-guided walk doesn't reach end. */
    private buildPathFromGrid(): Vec2[] {
        const start = this.spawnPos;
        const end = this.endPos;
        const result: Vec2[] = [start.clone()];
        const visited = new Set<string>();
        visited.add(`${start.x},${start.y}`);
        // direction → (dr, dc)  [up, right, down, left]
        const DIR_MAP: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];
        let cur = start.clone();
        let prevDir = -1;

        for (let step = 0; step < 500; step++) {
            if (cur.x === end.x && cur.y === end.y) break;
            const r = Math.round(cur.y), c = Math.round(cur.x);
            if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) break;
            const dir = this.pathDirs[r][c];
            if (dir < 0 || dir > 3) break; // dead end
            const [dr, dc] = DIR_MAP[dir];
            const nr = r + dr, nc = c + dc;
            const nk = `${nc},${nr}`;
            if (visited.has(nk)) break; // loop
            if (dir !== prevDir && prevDir >= 0) result.push(cur.clone());
            visited.add(nk);
            cur = new Vec2(nc, nr);
            prevDir = dir;
        }

        if (cur.x === end.x && cur.y === end.y) {
            // Direction-guided path succeeded
            result.push(end.clone());
            return result;
        }

        // Fallback: BFS shortest-path search
        return this.bfsPathFromStartToEnd();
    }

    private bfsPathFromStartToEnd(): Vec2[] {
        const start = this.spawnPos;
        const end = this.endPos;
        const visited = new Set<string>();
        const parent = new Map<string, Vec2>();
        const key = (p: Vec2) => `${p.x},${p.y}`;
        const q: Vec2[] = [start.clone()];
        visited.add(key(start));
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let found = false;

        while (q.length > 0) {
            const cur = q.shift()!;
            if (cur.x === end.x && cur.y === end.y) { found = true; break; }
            for (const [dx, dy] of dirs) {
                const nx = cur.x + dx, ny = cur.y + dy;
                const nk = `${nx},${ny}`;
                if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows &&
                    (this.grid[ny][nx] === 1 || (nx === end.x && ny === end.y)) && !visited.has(nk)) {
                    visited.add(nk);
                    q.push(new Vec2(nx, ny));
                    parent.set(nk, cur.clone());
                }
            }
        }

        if (found) {
            const result: Vec2[] = [];
            let cur = end.clone();
            result.push(cur.clone());
            let k = key(cur);
            while (parent.has(k)) {
                const p = parent.get(k)!;
                result.unshift(p.clone());
                k = key(p);
            }
            return result;
        }
        return [start.clone(), end.clone()];
    }

    private saveLevel(): void {
        const path = this.buildPathFromGrid();
        if (!path || path.length <= 1) { this.infoLabel.string = '错误: 路径未连通，请绘制从起点到终点的路径'; return; }

const spots: TowerSpot[] = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (this.grid[r][c] === 2)
                    spots.push({ row: r, col: c, x: 0, y: 0 });

const config: LevelConfig = {
            levelIndex: this.editingCustomIndex >= 0 ? this.editingCustomIndex : getCustomLevels().length,
            name: this.levelName,
            rows: this.rows, cols: this.cols, cellSize: 140,
            path, towerSpots: spots, obstacles: this.buildObstaclesFromGrid(), waves: this.waves,
            startGold: this.startGold, lives: this.startLives,
            availableTowers: this.availableTowers.length > 0 ? [...this.availableTowers] : [...ALL_TOWER_TYPES],
        };

        if (this.editingCustomIndex >= 0) {
            // 二次保存：覆盖原有自定义关卡
            updateCustomLevel(this.editingCustomIndex, config);
            this.infoLabel.string = `✅ 「${this.levelName}」已更新保存!`;
        } else {
            const idx = getCustomLevels().length;
            config.levelIndex = idx;
            saveCustomLevel(config);
            this.editingCustomIndex = idx;   // 之后保存进入覆盖模式
            this.infoLabel.string = `✅ 「${this.levelName}」已保存!`;
        }
        this.scheduleOnce(() => { this.infoLabel.string = ''; }, 2.5);
    }

    /** 循环切换已保存的自定义关卡 */
    private cycleCustomLevel(): void {
        const custom = getCustomLevels();
        if (custom.length === 0) {
            this.infoLabel.string = '⚠ 还没有自定义关卡，先保存一个吧';
            this.scheduleOnce(() => { this.infoLabel.string = ''; }, 2.5);
            return;
        }
        this.customLevelIdx = (this.customLevelIdx + 1) % custom.length;
        this.loadCustomLevel(this.customLevelIdx);
    }

    /** 加载指定的自定义关卡进行编辑（再次保存时覆盖原关卡） */
    private loadCustomLevel(index: number): void {
        const custom = getCustomLevels();
        if (index < 0 || index >= custom.length) return;
        const cfg = custom[index];
        this.saveUndoState();
        this.editingCustomIndex = index;
        this.rows = cfg.rows;
        this.cols = cfg.cols;
        this.levelName = cfg.name;
        this.spawnPos = cfg.path[0].clone();
        this.endPos = cfg.path[cfg.path.length - 1].clone();
        this.startGold = cfg.startGold;
        this.startLives = cfg.lives;

        this.initGrid();
        for (const p of cfg.path) {
            const r = Math.round(p.y), c = Math.round(p.x);
            if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) this.grid[r][c] = 1;
        }
        this.inferPathDirsFromWaypoints(cfg.path);
for (const s of cfg.towerSpots) {
            if (s.row >= 0 && s.row < this.rows && s.col >= 0 && s.col < this.cols) this.grid[s.row][s.col] = 2;
        }
        this.applyObstaclesToGrid(cfg.obstacles);

        this.waves = cfg.waves.map(w => ({
            ...w,
            enemies: w.enemies.map(e => ({ ...e })),
        }));
        this.availableTowers = cfg.availableTowers ? [...cfg.availableTowers] : [...ALL_TOWER_TYPES];
        this.nameLabel && (this.nameLabel.string = this.levelName);
        this.goldLabel && (this.goldLabel.string = `${this.startGold}`);
        this.livesLabel && (this.livesLabel.string = `${this.startLives}`);

        this.markDirtyGrid();
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);

        this.infoLabel.string = `📂 已加载自定义关卡 ${index + 1}/${custom.length}: ${cfg.name}（保存将覆盖）`;
        this.scheduleOnce(() => { this.infoLabel.string = ''; }, 3);
    }

    private loadBuiltinLevel(index: number): void {
        if (index < 0 || index >= LEVEL_CONFIGS.length) return;
        const cfg = LEVEL_CONFIGS[index];
        this.saveUndoState();
        this.editingCustomIndex = -1;   // 加载内置关卡后保存视为新建自定义关卡
        this.rows = cfg.rows;
        this.cols = cfg.cols;
        this.levelName = cfg.name;
        this.spawnPos = cfg.path[0].clone();
        this.endPos = cfg.path[cfg.path.length - 1].clone();
        this.startGold = cfg.startGold;
        this.startLives = cfg.lives;

        this.initGrid();
        for (const p of cfg.path) {
            const r = Math.round(p.y), c = Math.round(p.x);
            if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) this.grid[r][c] = 1;
        }
        // Auto-infer path directions from waypoints (users can then override by clicking)
        this.inferPathDirsFromWaypoints(cfg.path);
for (const s of cfg.towerSpots) {
            if (s.row >= 0 && s.row < this.rows && s.col >= 0 && s.col < this.cols) this.grid[s.row][s.col] = 2;
        }
        this.applyObstaclesToGrid(cfg.obstacles);

        this.waves = cfg.waves.map(w => ({
            ...w,
            enemies: w.enemies.map(e => ({ ...e })),
        }));
        this.availableTowers = cfg.availableTowers ? [...cfg.availableTowers] : [...ALL_TOWER_TYPES];
        this.nameLabel && (this.nameLabel.string = this.levelName);
        this.goldLabel && (this.goldLabel.string = `${this.startGold}`);
        this.livesLabel && (this.livesLabel.string = `${this.startLives}`);

        this.markDirtyGrid();
        this.updateWaveStats();
        this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);

        this.infoLabel.string = `📦 已加载内置关卡 ${index + 1}/${LEVEL_CONFIGS.length}: ${cfg.name}`;
        this.scheduleOnce(() => { this.infoLabel.string = ''; }, 3);
    }

    /** 循环切换内置关卡（每次点击加载下一个） */
    private cycleBuiltinLevel(): void {
        if (LEVEL_CONFIGS.length === 0) return;
        this.builtinLevelIdx = (this.builtinLevelIdx + 1) % LEVEL_CONFIGS.length;
        this.loadBuiltinLevel(this.builtinLevelIdx);
    }

    private exportLevel(): void {
        const path = this.buildPathFromGrid();
        if (!path || path.length < 2) {
            this.infoLabel.string = '错误: 路径未连通，无法导出';
            this.scheduleOnce(() => { this.infoLabel.string = ''; }, 2.5);
            return;
        }
const spots: TowerSpot[] = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (this.grid[r][c] === 2)
                    spots.push({ row: r, col: c, x: 0, y: 0 });

        // 导出格式与「地图文件夹」完全兼容：
        // 既有编辑器专用字段（grid / spawn / end，便于二次编辑无损还原），
        // 也有运行时必需字段（path / towerSpots / waves / startGold / lives），
        // 因此导出的 json 直接放进 assets/resources/levels/ 就能被游戏读取。
const data = {
            name: this.levelName, rows: this.rows, cols: this.cols, cellSize: 140,
            spawn: { x: this.spawnPos.x, y: this.spawnPos.y },
            end: { x: this.endPos.x, y: this.endPos.y },
            grid: this.grid,
            path: path.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
            towerSpots: spots,
            obstacles: this.buildObstaclesFromGrid(),
            waves: this.waves,
            startGold: this.startGold,
            lives: this.startLives,
            startLives: this.startLives,
            availableTowers: this.availableTowers,
        };
        const json = JSON.stringify(data, null, 2);

        // 1) 下载为 .json 文件
        let downloaded = false;
        try {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.levelName || 'level'}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            downloaded = true;
        } catch { /* 忽略 */ }

        // 2) 复制到剪贴板
        let copied = false;
        try {
            navigator.clipboard.writeText(json);
            copied = true;
        } catch { /* 忽略 */ }

        const hint = '📁 放入 assets/resources/levels/ 即可在选关中游玩';
        if (downloaded && copied) this.infoLabel.string = '📦 已下载 + 已复制! ' + hint;
        else if (downloaded) this.infoLabel.string = '📦 已下载! ' + hint;
        else if (copied) this.infoLabel.string = '📋 已复制到剪贴板! ' + hint;
        else {
            console.log('Level export:\n' + json);
            this.infoLabel.string = '📋 关卡数据已输出到控制台 (F12)';
        }
        this.scheduleOnce(() => { this.infoLabel.string = ''; }, 4);
    }

    /** 打开文件选择器导入关卡 JSON */
    private importLevelFromFile(): void {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = () => {
                const file = input.files && input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    const ok = this.importLevelFromJson(String(reader.result));
                    this.infoLabel.string = ok ? `✅ 已导入「${this.levelName}」` : '❌ 导入失败: JSON 格式不合法';
                    this.scheduleOnce(() => { this.infoLabel.string = ''; }, 3);
                };
                reader.readAsText(file);
            };
            input.click();
        } catch {
            this.infoLabel.string = '⚠ 当前环境不支持文件选择，请复制 JSON 后运行 loadLevelFromClipboard()';
            this.scheduleOnce(() => { this.infoLabel.string = ''; }, 3);
        }
    }

    /**
     * 从 JSON 文本导入关卡（兼容两种格式）：
     * - 本编辑器导出的格式（含 grid / spawn / end）
     * - LevelConfig 格式（含 path / towerSpots，如内置关卡、resources JSON）
     */
    private importLevelFromJson(jsonText: string): boolean {
        try {
            const raw = JSON.parse(jsonText);
            if (!raw || typeof raw !== 'object') return false;
            if (!Number.isFinite(raw.rows) || !Number.isFinite(raw.cols)) return false;

            this.saveUndoState();
            this.editingCustomIndex = -1;   // 导入的关卡保存时作为新关卡
            this.rows = Math.max(1, Math.floor(raw.rows));
            this.cols = Math.max(1, Math.floor(raw.cols));
            this.levelName = String(raw.name ?? '导入关卡');
            this.startGold = Number.isFinite(raw.startGold) ? Math.floor(raw.startGold) : 300;
            this.startLives = Number.isFinite(raw.lives) ? Math.floor(raw.lives)
                : (Number.isFinite(raw.startLives) ? Math.floor(raw.startLives) : 10);
            this.initGrid();

// 格式 A：编辑器导出的 grid 数组
            if (Array.isArray(raw.grid) && raw.grid.length === this.rows) {
                for (let r = 0; r < this.rows; r++) {
                    const rowArr = raw.grid[r];
                    if (!Array.isArray(rowArr)) continue;
                    for (let c = 0; c < this.cols; c++) {
                        const v = rowArr[c];
                        if (v === 1 || v === 2 || v === 3 || v === 4) this.grid[r][c] = v;
                    }
                }
                if (raw.spawn && Number.isFinite(raw.spawn.x) && Number.isFinite(raw.spawn.y)) {
                    this.spawnPos = new Vec2(Math.floor(raw.spawn.x), Math.floor(raw.spawn.y));
                }
                if (raw.end && Number.isFinite(raw.end.x) && Number.isFinite(raw.end.y)) {
                    this.endPos = new Vec2(Math.floor(raw.end.x), Math.floor(raw.end.y));
                }
            }
            // 格式 B：LevelConfig 的 path + towerSpots
            else if (Array.isArray(raw.path)) {
                const path = raw.path
                    .filter((p: any) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
                    .map((p: any) => new Vec2(Math.floor(p.x), Math.floor(p.y)));
                if (path.length >= 2) {
                    this.spawnPos = path[0].clone();
                    this.endPos = path[path.length - 1].clone();
                    for (const p of path) {
                        const r = Math.round(p.y), c = Math.round(p.x);
                        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) this.grid[r][c] = 1;
                    }
                    this.inferPathDirsFromWaypoints(path);
                }
if (Array.isArray(raw.towerSpots)) {
                    for (const s of raw.towerSpots) {
                        if (s && Number.isFinite(s.row) && Number.isFinite(s.col)) {
                            const r = Math.floor(s.row), c = Math.floor(s.col);
                            if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) this.grid[r][c] = 2;
                        }
                    }
                }
                this.applyObstaclesToGrid(raw.obstacles);
            } else {
                return false;
            }

            // 波次
            this.waves = (Array.isArray(raw.waves) && raw.waves.length > 0)
                ? raw.waves.map((w: any) => ({
                    waveIndex: Number(w.waveIndex) || 0,
                    enemies: Array.isArray(w.enemies)
                        ? w.enemies
                            .filter((e: any) => e && e.type && ENEMY_CONFIGS[e.type])
                            .map((e: any) => ({
                                type: e.type,
                                count: Math.max(1, Math.floor(Number(e.count) || 1)),
                                interval: Math.max(0.1, Number(e.interval) || 1),
                                delay: Math.max(0, Number(e.delay) || 0),
                            }))
                        : [],
                }))
                : [];
            if (this.waves.length === 0) this.initDefaultWaves();

            // 可用炮塔
            this.availableTowers = (Array.isArray(raw.availableTowers) && raw.availableTowers.length > 0)
                ? raw.availableTowers.filter((t: any) => ALL_TOWER_TYPES.indexOf(t) >= 0)
                : [...ALL_TOWER_TYPES];

            this.nameLabel && (this.nameLabel.string = this.levelName);
            this.goldLabel && (this.goldLabel.string = `${this.startGold}`);
            this.livesLabel && (this.livesLabel.string = `${this.startLives}`);

            this.markDirtyGrid();
            this.updateWaveStats();
            this.scheduleOnce(() => { this.markDirtySidebar(); }, 0);
            return true;
        } catch {
            return false;
        }
    }

    /** 从剪贴板导入关卡 JSON（浏览器环境） */
    private importFromClipboard(): void {
        try {
            navigator.clipboard.readText().then((text: string) => {
                if (!text) {
                    this.infoLabel.string = '⚠ 剪贴板为空';
                    this.scheduleOnce(() => { this.infoLabel.string = ''; }, 3);
                    return;
                }
                const ok = this.importLevelFromJson(text);
                this.infoLabel.string = ok ? `✅ 已导入「${this.levelName}」` : '❌ 导入失败: JSON 格式不合法';
                this.scheduleOnce(() => { this.infoLabel.string = ''; }, 3);
            }).catch(() => {
                this.infoLabel.string = '⚠ 无法读取剪贴板';
                this.scheduleOnce(() => { this.infoLabel.string = ''; }, 3);
            });
        } catch {
            this.infoLabel.string = '⚠ 当前环境不支持读取剪贴板';
            this.scheduleOnce(() => { this.infoLabel.string = ''; }, 3);
        }
    }

    // ================================================================
    //  Undo / Redo
    // ================================================================

    private saveUndoState(): void {
        const snap: EditorSnapshot = {
            grid: this.grid.map(r => [...r]),
            pathDirs: this.pathDirs.map(r => [...r]),
            rows: this.rows, cols: this.cols, cellSize: this.cellSize,
            spawnPos: this.spawnPos.clone(), endPos: this.endPos.clone(),
        };
        this.undoStack.push(snap);
        if (this.undoStack.length > 30) this.undoStack.shift();
        this.redoStack = [];
    }

    private undo(): void {
        if (this.undoStack.length === 0) return;
        const cur = this.makeSnapshot();
        this.redoStack.push(cur);
        const prev = this.undoStack.pop()!;
        this.restoreSnapshot(prev);
    }

    private redo(): void {
        if (this.redoStack.length === 0) return;
        const cur = this.makeSnapshot();
        this.undoStack.push(cur);
        const next = this.redoStack.pop()!;
        this.restoreSnapshot(next);
    }

    private makeSnapshot(): EditorSnapshot {
        return {
            grid: this.grid.map(r => [...r]),
            pathDirs: this.pathDirs.map(r => [...r]),
            rows: this.rows, cols: this.cols, cellSize: this.cellSize,
            spawnPos: this.spawnPos.clone(), endPos: this.endPos.clone(),
        };
    }

    private restoreSnapshot(snap: EditorSnapshot): void {
        this.grid = snap.grid.map(r => [...r]);
        this.pathDirs = snap.pathDirs.map(r => [...r]);
        this.rows = snap.rows; this.cols = snap.cols; this.cellSize = snap.cellSize;
        this.spawnPos = snap.spawnPos.clone(); this.endPos = snap.endPos.clone();
        this.markDirtyGrid();
    }

    // ================================================================
    //  Keyboard shortcuts
    // ================================================================

    private _ctrlDown: boolean = false;
    private _shiftDown: boolean = false;

    private registerKeyboard(): void {
        this._keyHandler = (event: EventKeyboard) => {
            switch (event.keyCode) {
                case KeyCode.DIGIT_1: this.setTool(EditTool.PATH); break;
                case KeyCode.DIGIT_2: this.setTool(EditTool.TOWER_SPOT); break;
                case KeyCode.DIGIT_3: this.setTool(EditTool.SPAWN); break;
                case KeyCode.DIGIT_4: this.setTool(EditTool.END); break;
                case KeyCode.DIGIT_5: this.setTool(EditTool.ERASE); break;
                case KeyCode.DIGIT_6: this.setTool(EditTool.CHEST); break;
                case KeyCode.DIGIT_7: this.setTool(EditTool.LARGE); break;
                case KeyCode.CTRL_LEFT: case KeyCode.CTRL_RIGHT: this._ctrlDown = true; break;
                case KeyCode.SHIFT_LEFT: case KeyCode.SHIFT_RIGHT: this._shiftDown = true; break;
                case KeyCode.KEY_Z:
                    if (this._ctrlDown) { this._shiftDown ? this.redo() : this.undo(); }
                    break;
                case KeyCode.KEY_Y:
                    if (this._ctrlDown) this.redo();
                    break;
                case KeyCode.ESCAPE: UIManager.instance?.showMainMenu(); break;
            }
        };
        const keyUpHandler = (event: EventKeyboard) => {
            switch (event.keyCode) {
                case KeyCode.CTRL_LEFT: case KeyCode.CTRL_RIGHT: this._ctrlDown = false; break;
                case KeyCode.SHIFT_LEFT: case KeyCode.SHIFT_RIGHT: this._shiftDown = false; break;
            }
        };
        input.on(Input.EventType.KEY_DOWN, this._keyHandler, this);
        input.on(Input.EventType.KEY_UP, keyUpHandler, this);
        (this as any)._keyUpHandler = keyUpHandler;
    }

    private unregisterKeyboard(): void {
        if (this._keyHandler) {
            input.off(Input.EventType.KEY_DOWN, this._keyHandler, this);
            this._keyHandler = null;
        }
        const keyUp: any = (this as any)._keyUpHandler;
        if (keyUp) {
            input.off(Input.EventType.KEY_UP, keyUp, this);
            (this as any)._keyUpHandler = null;
        }
    }

    // ================================================================
    //  Grid helpers
    // ================================================================

    private initGrid(): void {
        this.grid = [];
        this.pathDirs = [];
        for (let r = 0; r < this.rows; r++) {
            this.grid[r] = [];
            this.pathDirs[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.grid[r][c] = 0;
                this.pathDirs[r][c] = -1;
            }
        }
    }

    // ================================================================
    //  Path direction inference (used when loading levels without directions)
    // ================================================================

    /** Walk waypoints and set pathDirs for each intermediate cell. */
    private inferPathDirsFromWaypoints(waypoints: Vec2[]): void {
        for (let i = 0; i < waypoints.length - 1; i++) {
            const r1 = Math.round(waypoints[i].y), c1 = Math.round(waypoints[i].x);
            const r2 = Math.round(waypoints[i + 1].y), c2 = Math.round(waypoints[i + 1].x);
            const dr = r2 - r1, dc = c2 - c1;
            let dir: number;
            if (dr < 0) dir = 0;          // up
            else if (dc > 0) dir = 1;     // right
            else if (dr > 0) dir = 2;     // down
            else dir = 3;                  // left
            const steps = Math.max(Math.abs(dr), Math.abs(dc));
            for (let s = 0; s <= steps; s++) {
                const r = r1 + s * Math.sign(dr);
                const c = c1 + s * Math.sign(dc);
                if (r >= 0 && r < this.rows && c >= 0 && c < this.cols && this.grid[r][c] === 1) {
                    this.pathDirs[r][c] = dir;
                }
            }
        }
    }

    // ================================================================
    //  Name editing
    // ================================================================

    private onEditName(): void {
        try {
            const input = prompt('请输入地图名称：', this.levelName);
            if (input !== null && input.trim().length > 0) {
                this.levelName = input.trim();
                if (this.nameLabel) this.nameLabel.string = this.levelName;
            }
        } catch {
            const presets = ['自定义关卡', '新手之路', '螺旋迷宫', '要塞', '训练场', '迷宫'];
            const idx = presets.indexOf(this.levelName);
            this.levelName = presets[(idx + 1) % presets.length];
            if (this.nameLabel) this.nameLabel.string = this.levelName;
        }
    }

    // ================================================================
    //  Color helpers
    // ================================================================

    private enemyColor(type: EnemyType): Color {
        switch (type) {
            case EnemyType.NORMAL: return new Color(100, 150, 100);
            case EnemyType.FAST: return new Color(255, 200, 80);
            case EnemyType.TANK: return new Color(180, 80, 80);
            case EnemyType.BIG_FAST: return new Color(255, 150, 30);
            case EnemyType.SPLITTER: return new Color(150, 80, 200);
            case EnemyType.BOSS: return new Color(255, 50, 50);
            case EnemyType.BOSS_MODE: return new Color(200, 200, 60);
            case EnemyType.BOSS_MODE_FLYING: return new Color(60, 220, 220);
            default: return new Color(120, 120, 120);
        }
    }

    private towerColor(type: TowerType): Color {
        switch (type) {
            case TowerType.EMITTER: return new Color(255, 200, 50);
            case TowerType.PRISM: return new Color(150, 255, 255);
            case TowerType.ARTILLERY: return new Color(255, 255, 100);
            case TowerType.ROCKET: return new Color(255, 100, 50);
            case TowerType.SNOW: return new Color(200, 230, 255);
            case TowerType.COAGULATOR: return new Color(180, 130, 80);
            case TowerType.RADIATION: return new Color(100, 255, 80);
            case TowerType.CONDENSER: return new Color(120, 220, 255);
            case TowerType.TESLA: return new Color(80, 200, 255);
            default: return new Color(150, 150, 150);
        }
    }

    // ================================================================
    //  UI Utilities
    // ================================================================

    private makeNode(name: string, parent: Node, w: number, h: number, x = 0, y = 0): Node {
        const n = new Node(name);
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform).setContentSize(w, h);
        n.setPosition(x, y, 0);
        parent.addChild(n);
        return n;
    }

    private makeRect(name: string, parent: Node, w: number, h: number, color: Color, x = 0, y = 0): Node {
        const n = this.makeNode(name, parent, w, h, x, y);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        return n;
    }

    private makeLabel(name: string, parent: Node, w: number, h: number, text: string, fontSize: number, color: Color, x = 0, y = 0): Label {
        const n = this.makeNode(name, parent, w, h, x, y);
        const lb = n.addComponent(Label);
        lb.string = text;
        lb.fontSize = fontSize;
        lb.lineHeight = fontSize + 4;
        lb.color = color;
        applyTextOutline(lb, Math.max(2, Math.round(fontSize / 8)), color);
        lb.overflow = Overflow.NONE;
        lb.horizontalAlign = HorizontalTextAlignment.CENTER;
        lb.verticalAlign = VerticalTextAlignment.CENTER;
        return lb;
    }

    private makeLine(name: string, parent: Node, w: number, color: Color, x = 0, y = 0): void {
        const n = this.makeNode(name, parent, w, 1, x, y);
        const g = n.addComponent(Graphics);
        g.strokeColor = color;
        g.lineWidth = 1;
        g.moveTo(-w / 2, 0);
        g.lineTo(w / 2, 0);
        g.stroke();
    }
}

