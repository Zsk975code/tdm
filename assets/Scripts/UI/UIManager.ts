import { _decorator, Component, Node, view, ResolutionPolicy, UITransform, Layers } from 'cc';
const { ccclass } = _decorator;

import { GameManager } from '../Core/GameManager';
import { loadLevelFiles } from '../Data/LevelData';
import { loadHiddenMissions } from '../Data/MissionData';
import { MainMenu } from './MainMenu';
import { LevelSelect } from './LevelSelect';
import { MapEditor } from './MapEditor';
import { CodexPanel } from './CodexPanel';
import { SettingsPanel } from './SettingsPanel';

export enum ScreenType {
    MAIN_MENU = 'main_menu',
    LEVEL_SELECT = 'level_select',
    MAP_EDITOR = 'map_editor',
    CODEX = 'codex',
    SETTINGS = 'settings',
    GAME = 'game',
}

@ccclass('UIManager')
export class UIManager extends Component {
    private static _instance: UIManager | null = null;
    public static get instance(): UIManager | null { return UIManager._instance; }

    private gameRoot: Node = null!;
    private mapLayer: Node = null!;
    private enemyLayer: Node = null!;
    private towerLayer: Node = null!;
    private bulletLayer: Node = null!;
    private uiLayer: Node = null!;

    private gameManager: GameManager | null = null;
    private mainMenu: MainMenu | null = null;
    private levelSelect: LevelSelect | null = null;
    private mapEditor: MapEditor | null = null;
    private codex: CodexPanel | null = null;
    private settings: SettingsPanel | null = null;

    private _currentScreen: ScreenType = ScreenType.MAIN_MENU;

    onLoad(): void {
        UIManager._instance = this;
        view.setDesignResolutionSize(1920, 1080, ResolutionPolicy.FIXED_HEIGHT);
        this.createGameStructure();
        // 启动时预扫描 assets/resources/levels/，让地图文件关卡尽早进入关卡列表
        void loadLevelFiles();
        // 预载隐藏任务管理文件（与关卡数据分离），进入关卡前必定就绪
        void loadHiddenMissions();
        this.showMainMenu();
    }

    onDestroy(): void {
        if (UIManager._instance === this) UIManager._instance = null;
    }

    private createGameStructure(): void {
        this.gameRoot = new Node('GameRoot');
        this.gameRoot.addComponent(UITransform).setContentSize(1920, 1080);
        this.gameRoot.layer = Layers.Enum.UI_2D;
        this.node.addChild(this.gameRoot);

        this.mapLayer = new Node('MapLayer');
        this.mapLayer.addComponent(UITransform).setContentSize(1920, 1080);
        this.mapLayer.layer = Layers.Enum.UI_2D;
        this.gameRoot.addChild(this.mapLayer);

        this.enemyLayer = new Node('EnemyLayer');
        this.enemyLayer.addComponent(UITransform).setContentSize(1920, 1080);
        this.enemyLayer.layer = Layers.Enum.UI_2D;
        this.gameRoot.addChild(this.enemyLayer);

        this.towerLayer = new Node('TowerLayer');
        this.towerLayer.addComponent(UITransform).setContentSize(1920, 1080);
        this.towerLayer.layer = Layers.Enum.UI_2D;
        this.gameRoot.addChild(this.towerLayer);

        this.bulletLayer = new Node('BulletLayer');
        this.bulletLayer.addComponent(UITransform).setContentSize(1920, 1080);
        this.bulletLayer.layer = Layers.Enum.UI_2D;
        this.gameRoot.addChild(this.bulletLayer);

        this.uiLayer = new Node('UILayer');
        this.uiLayer.addComponent(UITransform).setContentSize(1920, 1080);
        this.uiLayer.layer = Layers.Enum.UI_2D;
        this.gameRoot.addChild(this.uiLayer);

        this.gameManager = this.gameRoot.addComponent(GameManager);
        GameManager.onBackToMenu = () => { this.gameManager?.exitLevel(); this.showLevelSelect(); };
    }

    /**
     * 隐藏游戏内 UI（立即一次 + 下一帧兜底一次）。
     * 原先 5 个 showXxx 各自重复写 setGameUIActive(false) + scheduleOnce(...)，统一到这里避免重复/漏写。
     * 延迟一帧兜底的原因：确保 GameManager 完全初始化后 HUD 仍处于隐藏状态。
     */
    private hideGameUI(): void {
        if (this.gameManager) this.gameManager.setGameUIActive(false);
        this.scheduleOnce(() => this.gameManager?.setGameUIActive(false), 0);
    }

    public showMainMenu(): void {
        this.hideAllScreens();
        this.hideGameUI();
        if (!this.mainMenu) {
            const node = new Node('MainMenu');
            node.layer = Layers.Enum.UI_2D;
            this.uiLayer.addChild(node);
            this.mainMenu = node.addComponent(MainMenu);
        }
        this.mainMenu.node.active = true;
        this._currentScreen = ScreenType.MAIN_MENU;
    }

    public showLevelSelect(): void {
        this.hideAllScreens();
        this.hideGameUI();
        if (!this.levelSelect) {
            const node = new Node('LevelSelect');
            node.layer = Layers.Enum.UI_2D;
            this.uiLayer.addChild(node);
            this.levelSelect = node.addComponent(LevelSelect);
        }
        this.levelSelect.refresh();
        this.levelSelect.node.active = true;
        this._currentScreen = ScreenType.LEVEL_SELECT;
        // 地图文件夹是异步加载的：加载完成后若仍停留在选关界面，重建列表补上地图关卡
        void loadLevelFiles().then(() => {
            if (this._currentScreen === ScreenType.LEVEL_SELECT) this.levelSelect?.refresh();
        });
    }

    public showMapEditor(): void {
        this.hideAllScreens();
        this.hideGameUI();
        if (!this.mapEditor) {
            const node = new Node('MapEditor');
            node.layer = Layers.Enum.UI_2D;
            this.uiLayer.addChild(node);
            this.mapEditor = node.addComponent(MapEditor);
        }
        this.mapEditor.node.active = true;
        this._currentScreen = ScreenType.MAP_EDITOR;
    }

    public showCodex(): void {
        this.hideAllScreens();
        this.hideGameUI();
        if (!this.codex) {
            const node = new Node('Codex');
            node.layer = Layers.Enum.UI_2D;
            this.uiLayer.addChild(node);
            this.codex = node.addComponent(CodexPanel);
        }
        this.codex.refresh();
        this.codex.node.active = true;
        this._currentScreen = ScreenType.CODEX;
    }

    public showSettings(): void {
        this.hideAllScreens();
        this.hideGameUI();
        if (!this.settings) {
            const node = new Node('Settings');
            node.layer = Layers.Enum.UI_2D;
            this.uiLayer.addChild(node);
            this.settings = node.addComponent(SettingsPanel);
        }
        this.settings.node.active = true;
        this._currentScreen = ScreenType.SETTINGS;
    }

    public startGame(levelIndex: number): void {
        this.hideAllScreens();
        if (this.gameManager) this.gameManager.setGameUIActive(true);
        this._currentScreen = ScreenType.GAME;
        if (this.gameManager) {
            this.gameManager.startLevel(levelIndex);
        }
    }

    private hideAllScreens(): void {
        if (this.mainMenu) this.mainMenu.node.active = false;
        if (this.levelSelect) this.levelSelect.node.active = false;
        if (this.mapEditor) this.mapEditor.node.active = false;
        if (this.codex) this.codex.node.active = false;
        if (this.settings) this.settings.node.active = false;
    }
}