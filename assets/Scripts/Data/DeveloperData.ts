import { sys } from 'cc';

/**
 * 开发者模式数据 - 仅保留全局开关（倍速 / 暂停）。
 * 具体功能已改为 6 个开发者技能（见 GameManager 的开发者面板）：
 *   1. 全场怪减速 50%（永久）  2. 全场怪冻结（永久）
 *   3. 全场塔攻速 +50%（永久） 4. 金币 +1000
 *   5. 生命 +1                 6. 秒杀全场怪
 *
 * devModeEnabled：由设置界面的「开发者模式」开关控制，持久化保存，
 * 决定是否在游戏内显示「开发」按钮（开发者面板入口）。
 */
const DEV_MODE_KEY = 'td_devModeEnabled';

export class DeveloperData {
    private static _instance: DeveloperData;
    public static get instance(): DeveloperData {
        if (!DeveloperData._instance) DeveloperData._instance = new DeveloperData();
        return DeveloperData._instance;
    }

    /** 游戏速度倍率 (1.0 = 正常, 2.0 = 二倍速) */
    public speedMultiplier: number = 1;

    /** 游戏是否暂停 */
    public paused: boolean = false;

    /** 是否开启开发者模式（设置界面开关，默认关） */
    public devModeEnabled: boolean = false;

    private constructor() {
        try {
            if (sys.localStorage.getItem(DEV_MODE_KEY) === '1') this.devModeEnabled = true;
        } catch (e) {
            /* 读取失败则保持默认关闭 */
        }
    }

    /** 设置并持久化开发者模式开关 */
    public setDevModeEnabled(on: boolean): void {
        this.devModeEnabled = on;
        try {
            sys.localStorage.setItem(DEV_MODE_KEY, on ? '1' : '0');
        } catch (e) {
            /* 持久化失败不影响本次会话 */
        }
    }
}
