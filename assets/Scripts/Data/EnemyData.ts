import { _decorator } from 'cc';
const { ccclass } = _decorator;

export enum EnemyType {
    NORMAL = 'normal',
    FAST = 'fast',
    TANK = 'tank',
    BOSS = 'boss',
    BIG_FAST = 'big_fast',
    SPLITTER = 'splitter',
    SMALL_BOSS = 'small_boss',
    /** Boss战模式（LevelMode.BOSS）专属 boss，素材 boss_mode_11/12/13 */
    BOSS_MODE = 'boss_mode',
    /** BOSS·战 的飞行(速度)变体，第 14 关使用；地面(普通)变体待后续补充 */
    BOSS_MODE_FLYING = 'boss_mode_flying',
}

/** 全部敌人类型（顺序即 UI/开发面板的展示顺序），统一从这里引用避免各处重复定义 */
export const ALL_ENEMY_TYPES: EnemyType[] = [
    EnemyType.NORMAL,
    EnemyType.FAST, EnemyType.TANK, EnemyType.BIG_FAST,
    EnemyType.BOSS, EnemyType.SPLITTER, EnemyType.SMALL_BOSS, EnemyType.BOSS_MODE, EnemyType.BOSS_MODE_FLYING,
];

export interface EnemyConfig {
    type: EnemyType;
    name: string;
    hp: number;
    speed: number;
    reward: number;
    damage: number;
    healAmount: number;
    healInterval: number;
    splitCount: number;
    splitType: EnemyType;
    /** 可选：每被命中一次额外掉落的金币（boss 受击掉金机制；不配或 0 = 不掉） */
    goldPerHit?: number;
}

export const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
    [EnemyType.NORMAL]: {
        type: EnemyType.NORMAL,
        name: '普通怪',
        hp: 500,             // 用户方案：普通怪 500
        speed: 60,
        reward: 10,
        damage: 1,
        healAmount: 0,
        healInterval: 0,
        splitCount: 0,
        splitType: EnemyType.NORMAL,
    },

    [EnemyType.FAST]: {
        type: EnemyType.FAST,
        name: '快速怪',
        hp: 400,             // 用户方案：快速怪 400
        speed: 120,
        reward: 5,
        damage: 1,
        healAmount: 0,
        healInterval: 0,
        splitCount: 0,
        splitType: EnemyType.NORMAL,
    },
    [EnemyType.TANK]: {
        type: EnemyType.TANK,
        name: '大型普通怪',
        hp: 2500,            // 用户方案：大型普通怪 2500
        speed: 60,           // 与普通怪(NORMAL)同速：大的跟小的一个速度
        reward: 100,
        damage: 2,
        healAmount: 0,
        healInterval: 0,
        splitCount: 0,
        splitType: EnemyType.NORMAL,
    },
    [EnemyType.BOSS]: {
        type: EnemyType.BOSS,
        name: 'BOSS',
        hp: 50000,           // 用户方案：BOSS 50000（常规boss：血量最高、速度最慢）
        speed: 5,           // 需求方调整（原 15）：行程 6300/5≈1260s ≈ 关卡时长，第 20 波左右抵达萝卜
        reward: 1000,
        damage: 10,
        goldPerHit: 1,       // boss 受击掉金：每被打一下 +1 金币
        healAmount: 0,
        healInterval: 0,
        splitCount: 0,
        splitType: EnemyType.NORMAL,
    },
    [EnemyType.BIG_FAST]: {
        type: EnemyType.BIG_FAST,
        name: '大号快速怪',
        hp: 2000,            // 用户方案：大号快速怪 2000
        speed: 120,
        reward: 50,
        damage: 2,
        healAmount: 0,
        healInterval: 0,
        splitCount: 0,
        splitType: EnemyType.NORMAL,
    },
    [EnemyType.SPLITTER]: {
        type: EnemyType.SPLITTER,
        name: '分裂怪',
        hp: 2000,            // 用户方案：分裂怪 2000
        speed: 60,
        reward: 50,         // 未指定，沿用同类基准
        damage: 5,
        healAmount: 0,
        healInterval: 0,
        splitCount: 3,
        splitType: EnemyType.NORMAL,
    },
    [EnemyType.SMALL_BOSS]: {
        type: EnemyType.SMALL_BOSS,
        name: '小BOSS',
        hp: 5000,            // 用户方案：小BOSS 5000
        speed: 30,           // 比普通怪(60)慢 50%
        reward: 200,
        damage: 5,
        goldPerHit: 0,       // 小BOSS 同样受击掉金
        healAmount: 0,
        healInterval: 0,
        splitCount: 0,
        splitType: EnemyType.NORMAL,
    },
    [EnemyType.BOSS_MODE]: {
        type: EnemyType.BOSS_MODE,
        name: 'BOSS·战',
        hp: 12500,           // Boss战(限时歼灭)地面(普通)变体，数值待调（低于常规BOSS 50000）
        speed: 60,           // 地面(普通)变体；飞行(速度)变体见 BOSS_MODE_FLYING
        reward: 1000,
        damage: 0,
        goldPerHit: 1,       // BOSS·战 同样受击掉金
        healAmount: 0,
        healInterval: 0,
        splitCount: 0,
        splitType: EnemyType.NORMAL,
    },
    [EnemyType.BOSS_MODE_FLYING]: {
        type: EnemyType.BOSS_MODE_FLYING,
        name: 'BOSS·战(飞行)',
        hp: 10000,           // 飞行(速度)变体，血量低于地面变体(12500)
        speed: 120,           // 飞行=速度怪：速度为地面变体(60)的 2 倍，等同快速怪(120)
        reward: 800,
        damage: 0,
        goldPerHit: 1,       // BOSS·战(飞行) 同样受击掉金
        healAmount: 0,
        healInterval: 0,
        splitCount: 0,
        splitType: EnemyType.NORMAL,
    },
};

export function getEnemyConfig(type: EnemyType): EnemyConfig {
    return ENEMY_CONFIGS[type];
}