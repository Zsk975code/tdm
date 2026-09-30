/**
 * 图鉴文案层：集中存放塔 / 敌人 / 障碍 / 隐藏任务的「解说文字」与展示标签。
 * 数值本身仍取自 TowerData / EnemyData / LevelData / MissionData，避免重复定义。
 */
import { TowerType } from './TowerData';
import { EnemyType } from './EnemyData';
import { ObstacleType } from './LevelData';
import { MissionType } from './MissionData';

/** 塔：定位解说（生动描述，具体数值见下方数值行） */
export const TOWER_FLAVOR: Record<TowerType, string> = {
    [TowerType.EMITTER]:   '最可靠的入门火力，单体电击稳稳补刀；升到顶配会点亮一圈供能光环，让附近友军打得更狠。',
    [TowerType.COAGULATOR]:'把敌人脚步一点点拖慢的控场巢穴，手短却极其粘人；三级会周期性喷发一次范围电涌，把整条路都变成泥沼。',
    [TowerType.ARTILLERY]: '朝敌群抛下会炸开的重炮，落点成片开花，专治挤成一团的家伙，一炮连锅端。',
    [TowerType.RADIATION]: '不发射弹丸的场域型塔，像一轮小型太阳持续灼烧射程内的每一个敌人，越密集越致命。',
    [TowerType.TESLA]:     '雷电在敌群之间跳来跳去，专挑扎堆的小怪下手，三级时还会偶尔劈出双倍暴击。',
    [TowerType.PRISM]:     '冷静的远程射手，射得又远又快，弹道还带着冻骨的寒意，边打边拖。',
    [TowerType.ROCKET]:    '一发入魂的重火力，爆炸范围几乎不留死角；代价是装填慢、造价高，专门伺候精英和 BOSS。',
    [TowerType.SNOW]:      '把射程内的敌人瞬间冻成冰雕的范围控制塔，越是危急的波次和 BOSS 战越离不开它。',
    [TowerType.CONDENSER]: '不发射弹丸的场域型塔，像一轮冷凝的弯月，射程内不断降下霜寒：既持续灼烧，又让敌人步履凝滞——敌群越密越划算。',
    [TowerType.ARCHER]:     '暮色长弓：于夜色中拉满的弓弦，每一箭都裹挟着持续凋零的诅咒。命中之后伤口不断溃烂，敌人将在绵延不绝的凋零伤害里一点点耗尽生命；升至顶配更有几率射出破空穿云的穿透主箭，伤害翻倍、还能把凋零烧到障碍物上。',
};

/** 敌人：特点解说（贴合真实血量 / 移速 / 机制） */
export const ENEMY_FLAVOR: Record<EnemyType, string> = {
    [EnemyType.NORMAL]:          '标准步兵，血量 500、移速 60，攻防均衡，是最基础的推进单位。',
    [EnemyType.FAST]:            '高机动单位，移速 120（普通怪两倍）、血量仅 400，极易绕过防线直冲防御点，需优先拦截。',
    [EnemyType.TANK]:            '重甲单位，血量高达 2500、移速与普通怪相同，需要集火或穿甲才能快速处理。',
    [EnemyType.BIG_FAST]:        '高速重装，兼具 2000 血量与 120 移速，对防线是双重压力。',
    [EnemyType.BOSS]:            '常规关卡最终首领，血量 50000 天文数字、移速仅 5 极慢；但每被命中一下掉落 1 金，鼓励全力输出换取经济。',
    [EnemyType.SPLITTER]:        '分裂单位，血量 2000，被消灭时裂解为 3 个普通怪，必须用范围伤害快速清场避免雪崩。',
    [EnemyType.SMALL_BOSS]:      '次级首领，血量 5000、移速 30，受击同样掉金，是关卡中段的硬骨头。',
    [EnemyType.BOSS_MODE]:       'Boss 战（限时歼灭）地面变体：无防御点，需在限时内全歼；血量 12500、移速 60，受击掉金。',
    [EnemyType.BOSS_MODE_FLYING]:'Boss 战飞行变体，血量 10000、移速 120（等同快速怪），需高速拦截单位应对。',
};

/** 障碍：说明（贴合真实占格 / 血量 / 奖励，旧文案“摧毁不给金币”与数据矛盾，已修正） */
export const OBSTACLE_FLAVOR: Record<ObstacleType, string> = {
    [ObstacleType.ROCK_SMALL]: '1×1 岩石障碍，阻挡路径与建塔位；可用范围伤害清除，摧毁得 50 金，空间紧张时也可直接绕行。',
    [ObstacleType.ROCK_WIDE]:  '2×1 宽型岩石，占地更长、血量 1000，更考验布阵空间；摧毁得 100 金。',
    [ObstacleType.ROCK_BIG]:   '2×2 巨型岩石，血厚（2000）占位大；既可当作天然防线支点，也可花火力清掉换 200 金与空间。',
    [ObstacleType.CHEST_SMALL]:'1×1 金袋宝箱，摧毁给予 750 金，是关键经济来源；但血量高达 2000，需分配火力抢下。',
    [ObstacleType.CHEST_BIG]:  '2×2 巨型金袋，摧毁奖励 2000 金极其丰厚，值得专门腾出火力与射程去开采。',
};

/** 障碍展示名 */
export const OBSTACLE_LABEL: Record<ObstacleType, string> = {
    [ObstacleType.ROCK_SMALL]: '岩石·小',
    [ObstacleType.ROCK_WIDE]:  '岩石·宽',
    [ObstacleType.ROCK_BIG]:   '岩石·大',
    [ObstacleType.CHEST_SMALL]:'宝箱·小',
    [ObstacleType.CHEST_BIG]:  '宝箱·大',
};

/** 隐藏任务：类型短标签（卡片标题） */
export const MISSION_LABEL: Record<MissionType, string> = {
    [MissionType.HAVE_TOWER]:      '保有塔',
    [MissionType.KILL_BY_TOWER]:   '击杀计数',
    [MissionType.DESTROY_OBSTACLE]:'摧毁障碍',
    [MissionType.FORBID_TOWER]:    '禁建约束',
    [MissionType.FINISH_IN_TIME]:  '限时通关',
    [MissionType.LIMIT_TOWER]:     '数量约束',
    [MissionType.EARN_GOLD]:       '累计金币',
};

/** 隐藏任务：类型解说（详情，贴合其约束 / 进度特色） */
export const MISSION_FLAVOR: Record<MissionType, string> = {
    [MissionType.HAVE_TOWER]:      '要求在场上「同时拥有」指定数量、且不低于指定等级的特定塔，逼你围绕核心塔构筑体系。',
    [MissionType.KILL_BY_TOWER]:   '要求用指定类型的塔「累计消灭」若干敌人，鼓励把某种塔作为主力输出。',
    [MissionType.DESTROY_OBSTACLE]:'要求在限定时间内摧毁指定位置的障碍（岩石或宝箱），常用于引导你去开采金袋。',
    [MissionType.FORBID_TOWER]:    '约束型：本局禁止建造指定塔，一旦建造即本局失败（已完成的不受影响）。',
    [MissionType.FINISH_IN_TIME]:  '约束型：在限定时间内通关，超时即本局失败，考验节奏与爆发。',
    [MissionType.LIMIT_TOWER]:     '约束型：指定塔的拥有数量不超过上限，超过即本局失败，限制你的铺塔规模。',
    [MissionType.EARN_GOLD]:       '进度型：在限定时间内累计获得若干金币（花掉的钱不减少累计），鼓励高效刷金。',
};
