import { resources, SpriteFrame, Sprite, Node, UITransform, Layers, ImageAsset, Texture2D } from 'cc';
import { ObstacleType } from '../Data/LevelData';

/**
 * 素材管理器：预加载并缓存所有 SpriteFrame。
 * 尝试 Texture2D → SpriteFrame 路径，失败则回退到 ImageAsset → Texture2D → SpriteFrame。
 */
export class SpriteManager {
    private static _cache: Map<string, SpriteFrame> = new Map();
    /** 反向索引：SpriteFrame → 素材路径，用于按内容包围盒反算显示尺寸 */
    private static _pathByFrame: Map<SpriteFrame, string> = new Map();
    private static _ready: boolean = false;
    private static _loading: boolean = false;
    private static _loadingPromise: Promise<void> | null = null;

    /**
     * 素材"内容包围盒"尺寸（像素），即去掉四周透明 padding 后的实际图形大小。
     * 由项目脚本实测生成。
     *
     * 背景：早期贴图保留了大量透明 padding（rocket 内容仅占画布 7%、
     * emitter_11 占 14%）。若直接把画布铺满到目标尺寸，视觉内容会小到几乎看不见。
     */
    private static readonly CONTENT_BBOX: Record<string, [number, number]> = {
        // ── 子弹 ──
        'Art/Bullets/artillery_11.png': [40, 39],
        'Art/Bullets/artillery_21.png': [46, 44],
        'Art/Bullets/artillery_31.png': [50, 50],
        'Art/Bullets/coagulator_bullet_11.png': [22, 34],
        'Art/Bullets/coagulator_bullet_12.png': [22, 34],
        'Art/Bullets/coagulator_bullet_21.png': [24, 38],
        'Art/Bullets/coagulator_bullet_22.png': [24, 38],
        'Art/Bullets/coagulator_bullet_31.png': [26, 40],
        'Art/Bullets/coagulator_bullet_32.png': [26, 40],
        'Art/Bullets/emitter_11.png': [14, 24],
        'Art/Bullets/emitter_12.png': [14, 24],
        'Art/Bullets/emitter_13.png': [14, 24],
        'Art/Bullets/emitter_21.png': [19, 30],
        'Art/Bullets/emitter_22.png': [19, 30],
        'Art/Bullets/emitter_23.png': [19, 30],
        'Art/Bullets/emitter_31.png': [24, 41],
        'Art/Bullets/emitter_32.png': [24, 41],
        'Art/Bullets/emitter_33.png': [24, 41],
        'Art/Bullets/prism_11.png': [48, 48],
        'Art/Bullets/prism_21.png': [48, 48],
        'Art/Bullets/prism_31.png': [48, 48],
        // 弓箭塔(archer)箭矢：每级 4 帧，画布 56、内容约 18×52（实测）
        'Art/Bullets/archer_11.png': [11, 47],
        'Art/Bullets/archer_12.png': [11, 47],
        'Art/Bullets/archer_13.png': [17, 47],
        'Art/Bullets/archer_14.png': [17, 47],
        'Art/Bullets/archer_21.png': [11, 47],
        'Art/Bullets/archer_22.png': [11, 47],
        'Art/Bullets/archer_23.png': [17, 47],
        'Art/Bullets/archer_24.png': [17, 47],
        'Art/Bullets/archer_31.png': [11, 47],
        'Art/Bullets/archer_32.png': [11, 47],
        'Art/Bullets/archer_33.png': [17, 47],
        'Art/Bullets/archer_34.png': [17, 47],
        // 弓箭塔炮口/命中火焰（源 64×64，归一到 56×56，实测内容约 50×36）
        'Art/Effects/archer_fire_11.png': [50, 36],
        'Art/Effects/archer_fire_12.png': [50, 36],
        'Art/Effects/archer_fire_13.png': [50, 36],
        'Art/Effects/archer_fire_14.png': [50, 36],
        'Art/Effects/archer_fire_15.png': [50, 36],
        'Art/Effects/dot_overlay.png': [40, 40],
        // 火箭弹复用 Effects/rocket_fire_{tens}1（同一张图），不再单独出 Art/Bullets/rocket*.png；
        // 其内容长边见下方 rocket_fire_11/21/31 条目（= 66/72/78）
        // ── 敌人（命名：{类型}_{源帧数字}.png，如 small_boss_11 / boss_mode_11；帧字母码已去掉，仅留数字）──
        // 源帧归属：小boss 11 | 大boss 11 | boss模式 11 | 飞行怪 11·21
        //   小怪 11·21·31·11(耳鳍) | 大飞行怪 11·21 | 大普通怪 11·21·31·41(履带)
        // 尺寸为内容包围盒（按 alpha 实测，已去掉透明 padding）
        'Art/Enemies/normal_11.png': [19, 21],
        'Art/Enemies/normal_12.png': [19, 21],
        'Art/Enemies/normal_13.png': [19, 21],
        'Art/Enemies/normal_l_21.png': [19, 27],
        'Art/Enemies/normal_l_22.png': [19, 27],
        'Art/Enemies/normal_l_23.png': [19, 27],
        'Art/Enemies/normal_bm_31.png': [19, 20],
        'Art/Enemies/normal_bm_32.png': [19, 20],
        'Art/Enemies/normal_bm_33.png': [19, 20],
        'Art/Enemies/normal_f2_11.png': [19, 26],
        'Art/Enemies/normal_f2_12.png': [19, 26],
        'Art/Enemies/normal_f2_13.png': [19, 26],
        'Art/Enemies/fast_11.png': [20, 16],
        'Art/Enemies/fast_12.png': [22, 16],
        'Art/Enemies/fast_13.png': [18, 16],
        'Art/Enemies/fast_21.png': [20, 16],
        'Art/Enemies/fast_22.png': [22, 16],
        'Art/Enemies/fast_23.png': [18, 16],
        'Art/Enemies/big_fast_11.png': [23, 22],
        'Art/Enemies/big_fast_12.png': [25, 22],
        'Art/Enemies/big_fast_13.png': [21, 22],
        'Art/Enemies/big_fast_21.png': [23, 29],
        'Art/Enemies/big_fast_22.png': [25, 28],
        'Art/Enemies/big_fast_23.png': [21, 29],
        'Art/Enemies/tank_11.png': [17, 18],
        'Art/Enemies/tank_12.png': [17, 18],
        'Art/Enemies/tank_13.png': [17, 18],
        'Art/Enemies/tank_21.png': [21, 27],
        'Art/Enemies/tank_22.png': [21, 27],
        'Art/Enemies/tank_23.png': [21, 27],
        'Art/Enemies/tank_31.png': [23, 24],
        'Art/Enemies/tank_32.png': [23, 24],
        'Art/Enemies/tank_33.png': [23, 24],
        'Art/Enemies/tank_41.png': [25, 26],
        'Art/Enemies/tank_42.png': [25, 26],
        'Art/Enemies/tank_43.png': [25, 26],
        'Art/Enemies/splitter_11.png': [19, 20],
        'Art/Enemies/splitter_12.png': [19, 20],
        'Art/Enemies/splitter_13.png': [19, 20],
        'Art/Enemies/boss_11.png': [23, 28],
        'Art/Enemies/boss_12.png': [23, 28],
        'Art/Enemies/boss_13.png': [23, 28],
        'Art/Enemies/small_boss_11.png': [19, 20],
        'Art/Enemies/small_boss_12.png': [19, 20],
        'Art/Enemies/small_boss_13.png': [19, 20],
        'Art/Enemies/boss_mode_11.png': [25, 22],
        'Art/Enemies/boss_mode_12.png': [25, 22],
        'Art/Enemies/boss_mode_13.png': [25, 22],
        // ── 塔身/攻击帧（官方 Towers-hd 图集还原，画布即内容尺寸）──
        'Art/Towers/artillery_attack_12.png': [56, 56],
        'Art/Towers/artillery_attack_13.png': [56, 56],
        'Art/Towers/artillery_attack_22.png': [56, 56],
        'Art/Towers/artillery_attack_23.png': [56, 56],
        'Art/Towers/artillery_attack_32.png': [56, 56],
        'Art/Towers/artillery_attack_33.png': [56, 56],
        'Art/Towers/artillery_base_lv1.png': [56, 56],
        'Art/Towers/artillery_base_lv2.png': [56, 56],
        'Art/Towers/artillery_base_lv3.png': [56, 56],
        'Art/Towers/artillery_lv1.png': [56, 56],
        'Art/Towers/artillery_lv2.png': [56, 56],
        'Art/Towers/artillery_lv3.png': [56, 56],
        'Art/Towers/coagulator_attack_12.png': [56, 56],
        'Art/Towers/coagulator_attack_13.png': [56, 56],
        'Art/Towers/coagulator_attack_14.png': [56, 56],

        'Art/Towers/coagulator_attack_22.png': [56, 56],
        'Art/Towers/coagulator_attack_23.png': [56, 56],
        'Art/Towers/coagulator_attack_24.png': [56, 56],

        'Art/Towers/coagulator_attack_32.png': [56, 56],
        'Art/Towers/coagulator_attack_33.png': [56, 56],
        'Art/Towers/coagulator_attack_34.png': [56, 56],

        'Art/Towers/coagulator_lv1.png': [56, 56],
        'Art/Towers/coagulator_lv2.png': [56, 56],
        'Art/Towers/coagulator_lv3.png': [56, 56],
        'Art/Towers/emitter_attack_12.png': [56, 56],
        'Art/Towers/emitter_attack_13.png': [56, 56],
        'Art/Towers/emitter_attack_22.png': [56, 56],
        'Art/Towers/emitter_attack_23.png': [56, 56],
        'Art/Towers/emitter_attack_32.png': [56, 56],
        'Art/Towers/emitter_attack_33.png': [56, 56],
        'Art/Towers/emitter_base_lv1.png': [56, 56],
        'Art/Towers/emitter_base_lv2.png': [56, 56],
        'Art/Towers/emitter_base_lv3.png': [56, 56],
        'Art/Towers/emitter_lv1.png': [56, 56],
        'Art/Towers/emitter_lv2.png': [56, 56],
        'Art/Towers/emitter_lv3.png': [56, 56],
        'Art/Towers/prism_attack_12.png': [56, 56],
        'Art/Towers/prism_attack_13.png': [56, 56],
        'Art/Towers/prism_attack_22.png': [56, 56],
        'Art/Towers/prism_attack_23.png': [56, 56],
        'Art/Towers/prism_attack_32.png': [56, 56],
        'Art/Towers/prism_attack_33.png': [56, 56],
        'Art/Towers/prism_lv1.png': [56, 56],
        'Art/Towers/prism_lv2.png': [56, 56],
        'Art/Towers/prism_lv3.png': [56, 56],
        'Art/Towers/prism_base_lv1.png': [56, 56],
        'Art/Towers/prism_base_lv2.png': [56, 56],
        'Art/Towers/prism_base_lv3.png': [56, 56],
        'Art/Towers/radiation_face_01.png': [56, 56],
        'Art/Towers/radiation_face_02.png': [56, 56],
        'Art/Towers/radiation_face_03.png': [56, 56],
        'Art/Towers/radiation_lv1.png': [56, 56],
        'Art/Towers/radiation_lv2.png': [56, 56],
        'Art/Towers/radiation_lv3.png': [56, 56],
        'Art/Towers/rocket_attack_12.png': [80, 80],
        'Art/Towers/rocket_attack_13.png': [80, 80],
        'Art/Towers/rocket_attack_22.png': [88, 88],
        'Art/Towers/rocket_attack_23.png': [88, 88],
        'Art/Towers/rocket_attack_32.png': [96, 96],
        'Art/Towers/rocket_attack_33.png': [96, 96],
        'Art/Towers/rocket_base_lv1.png': [56, 56],
        'Art/Towers/rocket_base_lv2.png': [56, 56],
        'Art/Towers/rocket_base_lv3.png': [56, 56],
        'Art/Towers/rocket_lv1.png': [56, 56],
        'Art/Towers/rocket_lv2.png': [56, 56],
        'Art/Towers/rocket_lv3.png': [56, 56],
        'Art/Towers/snow_base_lv1.png': [64, 64],
        'Art/Towers/snow_base_lv2.png': [64, 64],
        'Art/Towers/snow_base_lv3.png': [64, 64],
        'Art/Towers/snow_lv1.png': [64, 64],
        'Art/Towers/snow_lv2.png': [64, 64],
        'Art/Towers/snow_lv3.png': [64, 64],
        'Art/Towers/tesla_lv1.png': [56, 56],
        'Art/Towers/tesla_lv2.png': [56, 56],
        'Art/Towers/tesla_lv3.png': [56, 56],
        // ── 剧毒长弓 / 弓箭塔（每级 4 帧：X1 待机 + X2/X3/X4 攻击）──
        'Art/Towers/archer_lv1.png': [56, 56],
        'Art/Towers/archer_lv2.png': [56, 56],
        'Art/Towers/archer_lv3.png': [56, 56],
        'Art/Towers/archer_base_lv1.png': [56, 56],
        'Art/Towers/archer_base_lv2.png': [56, 56],
        'Art/Towers/archer_base_lv3.png': [56, 56],
        'Art/Towers/archer_attack_12.png': [56, 56],
        'Art/Towers/archer_attack_13.png': [56, 56],
        'Art/Towers/archer_attack_14.png': [56, 56],
        'Art/Towers/archer_attack_22.png': [56, 56],
        'Art/Towers/archer_attack_23.png': [56, 56],
        'Art/Towers/archer_attack_24.png': [56, 56],
        'Art/Towers/archer_attack_32.png': [56, 56],
        'Art/Towers/archer_attack_33.png': [56, 56],
        'Art/Towers/archer_attack_34.png': [56, 56],
        // ── 特效帧（官方图集还原，画布即内容尺寸）──
        'Art/Effects/artillery_explosion_11.png': [240, 240],
        'Art/Effects/artillery_explosion_12.png': [240, 240],
        'Art/Effects/artillery_explosion_13.png': [240, 240],
        'Art/Effects/artillery_explosion_14.png': [240, 240],
        'Art/Effects/artillery_explosion_15.png': [240, 240],
        'Art/Effects/artillery_explosion_16.png': [240, 240],
        'Art/Effects/artillery_hit_01.png': [56, 56],
        'Art/Effects/artillery_hit_02.png': [56, 56],
        // 发射器命中爆点（emitter_hit_01/02）：圆形等离子爆（实测内容包围盒）
        'Art/Effects/emitter_hit_01.png': [23, 23],
        'Art/Effects/emitter_hit_02.png': [29, 29],

        'Art/Effects/coagulator_hit_01.png': [56, 56],
        'Art/Effects/coagulator_hit_02.png': [56, 56],
        'Art/Effects/e_spawn_01.png': [48, 48],
        'Art/Effects/e_spawn_02.png': [48, 48],
        'Art/Effects/e_spawn_03.png': [48, 48],
        'Art/Effects/prism_hit_01.png': [72, 72],
        'Art/Effects/prism_hit_02.png': [72, 72],
        'Art/Effects/radiation_beam_11.png': [320, 320],
        'Art/Effects/radiation_beam_12.png': [320, 320],
        'Art/Effects/radiation_beam_13.png': [320, 320],
        'Art/Effects/radiation_beam_14.png': [320, 320],
        'Art/Effects/radiation_beam_15.png': [320, 320],
        'Art/Effects/radiation_beam_16.png': [320, 320],
        'Art/Effects/radiation_beam_17.png': [320, 320],
        'Art/Effects/radiation_beam_18.png': [320, 320],
        'Art/Effects/radiation_beam_21.png': [400, 400],
        'Art/Effects/radiation_beam_22.png': [400, 400],
        'Art/Effects/radiation_beam_23.png': [400, 400],
        'Art/Effects/radiation_beam_24.png': [400, 400],
        'Art/Effects/radiation_beam_25.png': [400, 400],
        'Art/Effects/radiation_beam_26.png': [400, 400],
        'Art/Effects/radiation_beam_27.png': [400, 400],
        'Art/Effects/radiation_beam_28.png': [400, 400],
        'Art/Effects/radiation_beam_31.png': [400, 400],
        'Art/Effects/radiation_beam_32.png': [400, 400],
        'Art/Effects/radiation_beam_33.png': [400, 400],
        'Art/Effects/radiation_beam_34.png': [400, 400],
        'Art/Effects/radiation_beam_35.png': [400, 400],
        'Art/Effects/radiation_beam_36.png': [400, 400],
        'Art/Effects/radiation_beam_37.png': [400, 400],
        'Art/Effects/radiation_beam_38.png': [400, 400],
        'Art/Effects/radiation_hit_01.png': [56, 56],
        'Art/Effects/radiation_hit_02.png': [56, 56],
        'Art/Effects/radiation_hit_03.png': [56, 56],
        'Art/Effects/radiation_hit_04.png': [56, 56],
        'Art/Effects/radiation_hit_05.png': [56, 56],
        'Art/Effects/radiation_hit_06.png': [56, 56],
        'Art/Effects/radiation_hit_07.png': [56, 56],
        'Art/Effects/radiation_hit_08.png': [56, 56],
        'Art/Effects/radiation_hit_09.png': [56, 56],
        // ── 冷凝塔（月亮塔冷色镜像）──
        'Art/Towers/condenser_lv1.png': [56, 56],
        'Art/Towers/condenser_lv2.png': [56, 56],
        'Art/Towers/condenser_lv3.png': [56, 56],
        'Art/Towers/condenser_face_01.png': [56, 56],
        'Art/Towers/condenser_face_02.png': [56, 56],
        'Art/Towers/condenser_face_03.png': [56, 56],
        'Art/Effects/condenser_beam_11.png': [320, 320],
        'Art/Effects/condenser_beam_12.png': [320, 320],
        'Art/Effects/condenser_beam_13.png': [320, 320],
        'Art/Effects/condenser_beam_14.png': [320, 320],
        'Art/Effects/condenser_beam_21.png': [400, 400],
        'Art/Effects/condenser_beam_22.png': [400, 400],
        'Art/Effects/condenser_beam_23.png': [400, 400],
        'Art/Effects/condenser_beam_24.png': [400, 400],
        'Art/Effects/condenser_beam_31.png': [400, 400],
        'Art/Effects/condenser_beam_32.png': [400, 400],
        'Art/Effects/condenser_beam_33.png': [400, 400],
        'Art/Effects/condenser_beam_34.png': [400, 400],
        'Art/Effects/condenser_hit_01.png': [56, 56],
        'Art/Effects/condenser_hit_02.png': [56, 56],
        'Art/Effects/condenser_hit_03.png': [56, 56],
        'Art/Effects/condenser_slow.png': [56, 56],
        'Art/Effects/rocket_fire_11.png': [49, 66],
        'Art/Effects/rocket_fire_12.png': [80, 80],
        'Art/Effects/rocket_fire_13.png': [80, 80],
        'Art/Effects/rocket_fire_14.png': [80, 80],
        'Art/Effects/rocket_fire_15.png': [80, 80],
        'Art/Effects/rocket_fire_21.png': [53, 72],
        'Art/Effects/rocket_fire_22.png': [88, 88],
        'Art/Effects/rocket_fire_23.png': [88, 88],
        'Art/Effects/rocket_fire_24.png': [88, 88],
        'Art/Effects/rocket_fire_25.png': [88, 88],
        'Art/Effects/rocket_fire_31.png': [58, 78],
        'Art/Effects/rocket_fire_32.png': [96, 96],
        'Art/Effects/rocket_fire_33.png': [96, 96],
        'Art/Effects/rocket_fire_34.png': [96, 96],
        'Art/Effects/rocket_fire_35.png': [96, 96],
        'Art/Effects/slow_overlay.png': [48, 48],
        'Art/Effects/snow_freeze_11.png': [80, 80],
        'Art/Effects/t_build_01.png': [64, 64],
        'Art/Effects/t_build_02.png': [64, 64],
        'Art/Effects/t_build_03.png': [64, 64],
        'Art/Effects/tesla_beam_11.png': [56, 174],
        'Art/Effects/tesla_beam_12.png': [56, 174],
        'Art/Effects/tesla_beam_13.png': [56, 174],
        'Art/Effects/tesla_beam_14.png': [56, 174],
        'Art/Effects/tesla_beam_31.png': [56, 174],
        'Art/Effects/tesla_beam_32.png': [56, 174],
        'Art/Effects/tesla_beam_33.png': [56, 174],
        'Art/Effects/tesla_beam_34.png': [56, 174],
        'Art/Effects/tesla_fire_41.png': [56, 56],
        'Art/Effects/tesla_fire_42.png': [56, 56],
        'Art/Effects/tesla_fire_43.png': [56, 56],
        'Art/Effects/tesla_fire_44.png': [56, 56],
        'Art/Effects/tesla_fire_51.png': [56, 56],
        'Art/Effects/tesla_fire_52.png': [56, 56],
        'Art/Effects/tesla_fire_53.png': [56, 56],
        'Art/Effects/tesla_fire_54.png': [56, 56],
        'Art/Effects/tesla_fire_61.png': [56, 56],
        'Art/Effects/tesla_fire_62.png': [56, 56],
        'Art/Effects/tesla_fire_63.png': [56, 56],
        'Art/Effects/tesla_fire_64.png': [56, 56],
        'Art/Effects/tesla_hit_01.png': [80, 80],
        'Art/Effects/tesla_hit_02.png': [80, 80],
        'Art/Effects/upgrade_flash.png': [100, 100],
        // 切分后的图集帧（split_effect_0~5 碎片扩散）
        // 注：aura_ring_0~7（同心环收缩）已移除引用，不再预加载也不再登记包围盒
        'Art/Effects/split_effect_0.png': [17, 23],
        'Art/Effects/split_effect_1.png': [17, 23],
        'Art/Effects/split_effect_2.png': [25, 11],
        'Art/Effects/split_effect_3.png': [5, 5],
        'Art/Effects/split_effect_4.png': [5, 5],
        'Art/Effects/split_effect_5.png': [5, 5],
        // 光棱塔（重设计）专属减速覆盖层：棱镜水晶 + 彩虹环
        'Art/Effects/prism_slow.png': [80, 80],
        // 凝滞塔专属减速特效（PShit-11 / PShit-12 两帧循环，横向便便带）
        'Art/Effects/coagulator_slow.png': [56, 56],
        'Art/Effects/coagulator_slow_12.png': [56, 56],
        // 雪花塔攻击雪爆帧（PSnow11-15/21-25/31-35）
        'Art/Effects/snow_fire_11.png': [280, 280],
        'Art/Effects/snow_fire_12.png': [280, 280],
        'Art/Effects/snow_fire_13.png': [280, 280],
        'Art/Effects/snow_fire_14.png': [280, 280],
        'Art/Effects/snow_fire_15.png': [280, 280],
        'Art/Effects/snow_fire_21.png': [320, 320],
        'Art/Effects/snow_fire_22.png': [320, 320],
        'Art/Effects/snow_fire_23.png': [320, 320],
        'Art/Effects/snow_fire_24.png': [320, 320],
        'Art/Effects/snow_fire_25.png': [320, 320],
        'Art/Effects/snow_fire_31.png': [320, 320],
        'Art/Effects/snow_fire_32.png': [320, 320],
        'Art/Effects/snow_fire_33.png': [320, 320],
        'Art/Effects/snow_fire_34.png': [320, 320],
        'Art/Effects/snow_fire_35.png': [320, 320],
    };

    private static readonly TOWER_TYPES = [
        'emitter', 'prism', 'artillery', 'rocket', 'snow', 'coagulator', 'radiation', 'condenser', 'tesla', 'archer'
    ];
    private static readonly ENEMY_TYPES = [
        'normal',
        'fast', 'tank', 'boss', 'big_fast', 'splitter', 'small_boss',
        'boss_mode', 'boss_mode_flying'
    ];
    /**
     * 敌人类型 → 皮肤组列表；每组 3 帧行走动画，素材命名 {类型}_{源帧}.png
     *
     * 同类型的多组皮肤即「换皮」：外观不同、属性完全相同，生成敌人时随机取一组，
     * 保证每种皮都会出场（视觉多样性）。
     * 源帧归属：小boss B11 | 大boss BB11 | boss模式 BM11（专属，不参与换皮）
     *   小怪 L11·L21·L31·P11（已由 NORMAL_SKIN_POOL 的 4 套皮肤承担）
     *   飞行怪 F11·F21 | 大飞行怪 SF11·SF21 | 大普通怪 SL11·SL21·SL31（SP11 留给分裂怪）
     * 行走动画固定 3 帧，因此每组必须恰好 3 个源帧。
     */
    // 重构：每种怪精简为单一 3 帧行走皮肤（移除旧版多套换皮冗余）
    private static readonly ENEMY_SKINS: Record<string, [string, string[]][]> = {
        normal: [
            ['normal',    ['11', '12', '13']],
            ['normal_l',  ['21', '22', '23']],
            ['normal_bm', ['31', '32', '33']],
            ['normal_f2', ['11', '12', '13']],
        ],
        fast: [
            ['fast', ['11', '12', '13']],
            ['fast', ['21', '22', '23']],
        ],
        tank: [
            ['tank', ['11', '12', '13']],
            ['tank', ['21', '22', '23']],
            ['tank', ['31', '32', '33']],
            ['tank', ['41', '42', '43']],
        ],
        splitter: [['splitter', ['11', '12', '13']]],
        boss: [['boss', ['11', '12', '13']]],
        big_fast: [
            ['big_fast', ['11', '12', '13']],
            ['big_fast', ['21', '22', '23']],
        ],
        small_boss: [['small_boss', ['11', '12', '13']]],
        boss_mode: [['boss_mode', ['11', '12', '13']]],
        // 飞行(速度)变体复用同一套 BM 美术，仅类型名不同
        boss_mode_flying: [['boss_mode', ['11', '12', '13']]],
    };
    // 火箭弹复用 Effects/rocket_fire_{tens}1，无独立 Art/Bullets/rocket*，故不含 'rocket'
    private static readonly BULLET_TYPES = [
        'coagulator'
    ];

    public static isReady(): boolean {
        return this._ready;
    }

    /** 预加载所有素材；若已有加载在进行，返回同一个 Promise，保证调用方真正等待完成 */
    public static preloadAll(): Promise<void> {
        if (this._ready) return Promise.resolve();
        if (this._loadingPromise) return this._loadingPromise;

        this._loading = true;
        console.log('[SpriteManager] 开始预加载素材...');

        const paths: string[] = [];
        for (const t of this.TOWER_TYPES) {
            paths.push(`Art/Towers/${t}_lv1`, `Art/Towers/${t}_lv2`, `Art/Towers/${t}_lv3`);
        }
        // ── 塔底座（XX-1X 底座帧按等级：1/2/3 级底盘逐级变大，静态不旋转）──
        // 注：coagulator(便便塔) 已有底座 base_lv1/2/3（Shit-1X 透明冰盘）；太阳塔(无底盘) 与
        // 特斯拉 无独立底座素材；光棱(prism) 底座已单独出图 prism_base_lv1/2/3（炮台单独旋转）
        const towerBaseTypes = ['emitter', 'prism', 'artillery', 'rocket', 'snow', 'coagulator', 'archer'];
        for (const t of towerBaseTypes) {
            for (let lv = 1; lv <= 3; lv++) paths.push(`Art/Towers/${t}_base_lv${lv}`);
        }
        // ── 塔身开火攻击帧（XX12/13…，仅具有独立攻击帧的塔；每级 3 帧 charge/spit/recoil，与便便塔对齐）──
        const towerAttackTypes = ['emitter', 'prism', 'artillery', 'rocket', 'coagulator', 'archer'];
        for (const t of towerAttackTypes) {
            // 弓箭塔(archer)每级 3 帧攻击(attack_X2/X3/X4)；其余塔 2 帧(X2/X3)
            const maxK = t === 'archer' ? 4 : 3;
            for (const lv of ['1', '2', '3']) {
                for (let k = 2; k <= maxK; k++) {
                    paths.push(`Art/Towers/${t}_attack_${lv}${k}`);
                }
            }
        }
        // 太阳塔脸层（Sun-11/-12/-13 眨眼/呼吸序列，叠加在光芒圆盘上）
        for (let i = 1; i <= 3; i++) {
            paths.push(`Art/Towers/radiation_face_0${i}`);
        }
        // 冷凝塔脸层（condenser_face_01/02/03，每级 1 帧，叠加在塔身之上）
        for (let i = 1; i <= 3; i++) {
            paths.push(`Art/Towers/condenser_face_0${i}`);
        }
        // ── 敌人素材：{素材前缀}_{源帧}，第 1 帧同时作为本体/待机帧；多组皮肤全部预载 ──
        // 小怪 4 个类型共享同一皮肤池，路径会重复，需去重避免重复加载
        const enemyPaths = new Set<string>();
        for (const t of this.ENEMY_TYPES) {
            for (const [prefix, frames] of this.ENEMY_SKINS[t] ?? []) {
                for (const src of frames) {
                    enemyPaths.add(`Art/Enemies/${prefix}_${src}`);
                }
            }
        }
        for (const p of enemyPaths) paths.push(p);
        for (const t of this.BULLET_TYPES) {
            if (t === 'coagulator') {
                // 便便塔(PShit11-12/21-22/31-32)：每级 2 张按等级子弹
                for (const tens of ['1', '2', '3']) {
                    for (const v of ['1', '2']) paths.push(`Art/Bullets/coagulator_bullet_${tens}${v}`);
                }
            } else {
                paths.push(`Art/Bullets/${t}`);
            }
        }
        // ── 按等级投射物（P*11/21/31：各塔↔怪链接弹体） ──
        for (const tens of ['1', '2', '3']) {
            paths.push(`Art/Bullets/emitter_${tens}1`);
            paths.push(`Art/Bullets/emitter_${tens}2`);
            paths.push(`Art/Bullets/emitter_${tens}3`);
            paths.push(`Art/Bullets/prism_${tens}1`);
            // 火炮每级仅 1 张静态弹体（artillery_11/21/31），无 _2/_3 飞行帧。
            // 原按 3 帧预载会请求不存在的 artillery_12/13/22/23/32/33，刷「三种方式均加载失败」警告
            paths.push(`Art/Bullets/artillery_${tens}1`);
            // 弓箭塔(archer)箭矢：每级 4 帧 archer_{lv}1..4（运行时按飞行角度旋转定向）
            for (const v of ['1', '2', '3', '4']) paths.push(`Art/Bullets/archer_${tens}${v}`);
            for (let k = 1; k <= 5; k++) paths.push(`Art/Effects/archer_fire_1${k}`);
            // 火箭弹复用 Art/Effects/rocket_fire_{tens}1（上方 Effects 段已预载），不再单列 Bullets 条目
        }

        // ── Effects ──
        const effectNames = [
            'slow_overlay', 'upgrade_flash', 'prism_slow',
            'coagulator_slow', 'coagulator_slow_12', 'dot_overlay',
        ];
        // split_effect 此前是多帧图集（碎片扩散），已切分为独立帧
        // aura_ring_0~7 为 801×801 的大图且代码中无任何使用，已停止预加载（省显存与加载耗时）
        for (let i = 0; i < 6; i++) paths.push(`Art/Effects/split_effect_${i}`);
        for (const n of effectNames) paths.push(`Art/Effects/${n}`);
        for (let i = 1; i <= 3; i++) {
            paths.push(`Art/Effects/coin_fly_0${i}`);
            paths.push(`Art/Effects/e_spawn_0${i}`);
            paths.push(`Art/Effects/t_build_0${i}`);
        }
        // ── 辐射塔：攻击光环（按等级 4 档）+ 敌人命中爆炸（9 帧） ──
        for (let n = 1; n <= 4; n++) {
            paths.push(`Art/Effects/radiation_beam_1${n}`);
            paths.push(`Art/Effects/radiation_beam_2${n}`);
            paths.push(`Art/Effects/radiation_beam_3${n}`);
        }
        for (let n = 1; n <= 9; n++) {
            paths.push(`Art/Effects/radiation_hit_0${n}`);
        }
        // ── 冷凝塔：攻击光环（每级 4 帧）+ 命中爆点（3 帧）+ 减速/冷凝覆盖层（1 帧） ──
        for (let n = 1; n <= 4; n++) {
            paths.push(`Art/Effects/condenser_beam_1${n}`);
            paths.push(`Art/Effects/condenser_beam_2${n}`);
            paths.push(`Art/Effects/condenser_beam_3${n}`);
        }
        for (let n = 1; n <= 3; n++) {
            paths.push(`Art/Effects/condenser_hit_0${n}`);
        }
        paths.push(`Art/Effects/condenser_slow`);
        // ── 特斯拉：攻击光芒（PBall11-14/31-34 按等级）+ 命中爆炸（PBall01-02） ──
        for (let n = 1; n <= 4; n++) {
            paths.push(`Art/Effects/tesla_beam_1${n}`);
            paths.push(`Art/Effects/tesla_beam_3${n}`);
        }
        for (let n = 1; n <= 2; n++) {
            paths.push(`Art/Effects/tesla_hit_0${n}`);
        }
        // ── 特斯拉塔中心攻击动画（Ball41-44/51-54/61-64 按等级，从塔中心出现） ──
        for (const tens of ['4', '5', '6']) {
            for (let n = 1; n <= 4; n++) {
                paths.push(`Art/Effects/tesla_fire_${tens}${n}`);
            }
        }
        // ── 发射器：命中爆点(emitter_hit_01/02)；飞行弹体走 Art/Bullets/emitter_{lv}1/2/3 ──
        for (let n = 1; n <= 2; n++) paths.push(`Art/Effects/emitter_hit_0${n}`);
        // ── 光棱塔(重设计)专属命中爆点(prism_hit_01/02) ──
        for (let n = 1; n <= 2; n++) paths.push(`Art/Effects/prism_hit_0${n}`);
        // ── 星星塔：命中爆点(PStar01-02) + 炮击落点爆炸(PStar-11~16 共6帧) ──
        for (let n = 1; n <= 2; n++) paths.push(`Art/Effects/artillery_hit_0${n}`);
        for (let n = 1; n <= 6; n++) paths.push(`Art/Effects/artillery_explosion_1${n}`);
        // ── 凝滞器(便便塔)：命中爆点(PShit01-02)；开火特效复用塔身帧 coagulator_lvX ──
        for (let n = 1; n <= 2; n++) paths.push(`Art/Effects/coagulator_hit_0${n}`);
        // ── 火箭塔：塔中心发射(PRocket11-15/21-25/31-35 按等级5帧) ──
        for (const tens of ['1', '2', '3']) {
            for (let n = 1; n <= 5; n++) paths.push(`Art/Effects/rocket_fire_${tens}${n}`);
        }
        // ── 雪球塔：塔中心雪爆(PSnow11-15/21-25/31-35 按等级5帧) + 定身特效(PSnow-11) ──
        for (const tens of ['1', '2', '3']) {
            for (let n = 1; n <= 5; n++) paths.push(`Art/Effects/snow_fire_${tens}${n}`);
        }
        paths.push('Art/Effects/snow_freeze_11');
        // ── UI ──
        const uiNames = [
            'radish', 'cell_empty', 'cell_path', 'cell_tower_spot', 'spawn_marker',
            'main_menu_bg', 'level_select_bg', 'btn_normal', 'btn_hover', 'btn_green',
            'hud_bg', 'bg_pause', 'hp_bar_bg', 'hp_bar_fill', 'btn_disabled',
            'logo_title', 'panel_build_popup', 'panel_level_card', 'panel_tower_info', 'panel_wave_banner',
            'star_full', 'star_empty', 'lock', 'diff_1', 'diff_2', 'diff_3', 'diff_4', 'diff_5', 'star_secret',
            'obstacle_big', 'obstacle_small_01', 'obstacle_small_02', 'obstacle_small_03',
            'obstacle_chest_small', 'obstacle_chest_big',
            'level_bg',
            'obstacle_wide_01', 'obstacle_wide_02', 'obstacle_wide_03',
            'obstacle_big_b2',
        ];
        for (const n of uiNames) paths.push(`Art/UI/${n}`);
        // 建造面板塔图标：XX00=金币不足、XX01=金币足够
        for (const t of this.TOWER_TYPES) {
            paths.push(`Art/UI/tower_icon_${t}`, `Art/UI/tower_icon_${t}_off`);
        }
        // editor icons
        const iconNames = [
            'icon_brush', 'icon_debug', 'icon_end', 'icon_gold', 'icon_grid', 'icon_life',
            'icon_path', 'icon_pause', 'icon_speed', 'icon_start', 'icon_tower_spot',
        ];
        for (const n of iconNames) paths.push(`Art/UI/${n}`);

        // ── 道路方向瓦片（按相邻 PATH 格方向选段）──
        const roadKeys = [
            'road_straight_h', 'road_straight_v',
            'road_corner_NE', 'road_corner_NW', 'road_corner_SE', 'road_corner_SW',
            'road_T_N', 'road_T_S', 'road_T_E', 'road_T_W',
            'road_cross',
            'road_end_N', 'road_end_S', 'road_end_E', 'road_end_W',
            'road_single',
        ];
        for (const k of roadKeys) paths.push(`Art/Road/${k}`);

        let loadedCount = 0;
        const total = paths.length;


        const promises = paths.map(
            path =>
                new Promise<void>(resolve => {
                    this.tryLoadSpriteFrame(path).then(sf => {
                        if (sf) {
                            this._cache.set(path, sf);
                            this._pathByFrame.set(sf, path);
                            loadedCount++;
                        }
                        resolve();
                    });
                }),
        );

        this._loadingPromise = Promise.all(promises).then(() => {
            this._ready = true;
            this._loading = false;
            this._loadingPromise = null;

            console.log(`[SpriteManager] 预加载完成: ${loadedCount}/${total} 个`);

            if (loadedCount === 0) {
                console.error('[SpriteManager] ⚠ 0 个素材加载成功！请检查:');
                console.error('  1. assets/resources/Art/ 目录是否存在 PNG 文件');
                console.error('  2. Cocos Creator 是否已刷新资源（右键 resources → 重新导入资源）');
            }
        });

        return this._loadingPromise;
    }

    /**
     * 尝试多种方式加载 SpriteFrame：
     * ① 直接加载为 SpriteFrame
     * ② 加载为 Texture2D → 创建 SpriteFrame
     * ③ 加载为 ImageAsset → Texture2D → 创建 SpriteFrame
     */
    private static tryLoadSpriteFrame(path: string): Promise<SpriteFrame | null> {
        // 方式 1: 直接加载为 SpriteFrame
        return new Promise<SpriteFrame | null>(resolve => {
            resources.load(path, SpriteFrame, (err, sf: SpriteFrame) => {
                if (!err && sf) {
                    resolve(sf);
                } else {
                    // 方式 2: Texture2D → SpriteFrame
                    resources.load(path, Texture2D, (err2, tex: Texture2D) => {
                        if (!err2 && tex) {
                            const spriteFrame = new SpriteFrame();
                            spriteFrame.texture = tex;
                            resolve(spriteFrame);
                        } else {
                            // 方式 3: ImageAsset → Texture2D → SpriteFrame
                            resources.load(path, ImageAsset, (err3, img: ImageAsset) => {
                                if (!err3 && img) {
                                    try {
                                        const texture = new Texture2D();
                                        texture.image = img;
                                        const spriteFrame = new SpriteFrame();
                                        spriteFrame.texture = texture;
                                        resolve(spriteFrame);
                                    } catch (e) {
                                        console.warn(`[SpriteManager] ImageAsset 转换失败: ${path}`, e);
                                        resolve(null);
                                    }
                                } else {
                                    console.warn(`[SpriteManager] 三种方式均加载失败: ${path}`);
                                    resolve(null);
                                }
                            });
                        }
                    });
                }
            });
        });
    }

    // ── 取帧接口 ──

    public static getTowerFrame(towerType: string, level: number): SpriteFrame | null {
        return this._cache.get(`Art/Towers/${towerType}_lv${level + 1}`) ?? null;
    }

    /**
     * 塔底座贴图（XX-1X 按等级 1/2/3，底盘逐级变大）。
     * 无底座的塔（太阳塔）返回 null；其余塔已补底座。
     */
    public static getTowerBaseFrame(towerType: string, level: number = 0): SpriteFrame | null {
        return this._cache.get(`Art/Towers/${towerType}_base_lv${Math.min(Math.max(level, 0), 2) + 1}`) ?? null;
    }

    /**
     * 塔身开火攻击动画帧（XX{level}1→2→3）。
     * 首帧为待机初始帧，随后 2/3 帧为开火攻击位移（无独立攻击帧的塔返回仅含基础帧）。
     */
    public static getTowerAttackFrames(towerType: string, level: number = 0): (SpriteFrame | null)[] {
        const tens = String(Math.min(level, 2) + 1);
        const base = this._cache.get(`Art/Towers/${towerType}_lv${tens}`) ?? null;
        const frames: (SpriteFrame | null)[] = [base];
        // 攻击帧 2,3,4,... 依次往后取，遇到缺失即停止（凝滞器有 4 段上升电流，其余塔仅 2 帧）
        for (let k = 2; ; k++) {
            const f = this._cache.get(`Art/Towers/${towerType}_attack_${tens}${k}`) ?? null;
            if (!f) break;
            frames.push(f);
        }
        return frames;
    }

    /** 太阳塔脸层（Sun-11/-12/-13 = 1/2/3 级的脸，随等级取帧） */
    public static getRadiationFaceFrames(): SpriteFrame[] {
        const out: SpriteFrame[] = [];
        for (let i = 1; i <= 3; i++) {
            const sf = this._cache.get(`Art/Towers/radiation_face_0${i}`) ?? null;
            out.push(sf!);
        }
        return out;
    }

    /** 分裂特效帧序列（split_effect_0~5，已切分独立帧） */
    public static getSplitEffectFrames(): (SpriteFrame | null)[] {
        const out: (SpriteFrame | null)[] = [];
        for (let i = 0; i < 6; i++) {
            out.push(this._cache.get(`Art/Effects/split_effect_${i}`) ?? null);
        }
        return out;
    }

    /** 辐射塔攻击光环帧序列（按等级 0/1/2） */
    public static getRadiationBeamFrames(level: number): (SpriteFrame | null)[] {
        const tens = ['1', '2', '3'][Math.min(level, 2)];
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= 4; n++) {
            out.push(this._cache.get(`Art/Effects/radiation_beam_${tens}${n}`) ?? null);
        }
        return out;
    }

    /** 辐射塔命中敌人爆炸帧序列（9 帧） */
    public static getRadiationHitFrames(): (SpriteFrame | null)[] {
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= 9; n++) {
            out.push(this._cache.get(`Art/Effects/radiation_hit_0${n}`) ?? null);
        }
        return out;
    }

    /** 冷凝塔脸层（condenser_face_01/02/03 = 1/2/3 级的脸，随等级取帧） */
    public static getCondenserFaceFrames(): SpriteFrame[] {
        const out: SpriteFrame[] = [];
        for (let i = 1; i <= 3; i++) {
            const sf = this._cache.get(`Art/Towers/condenser_face_0${i}`) ?? null;
            out.push(sf!);
        }
        return out;
    }

    /** 冷凝塔攻击光环帧序列（按等级：0/1/2 → condenser_beam_11-14 / 21-24 / 31-34） */
    public static getCondenserBeamFrames(level: number): (SpriteFrame | null)[] {
        const tens = ['1', '2', '3'][Math.min(level, 2)];
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= 4; n++) {
            out.push(this._cache.get(`Art/Effects/condenser_beam_${tens}${n}`) ?? null);
        }
        return out;
    }

    /** 冷凝塔命中敌人冰晶爆点帧序列（condenser_hit_01-03，3 帧） */
    public static getCondenserHitFrames(): (SpriteFrame | null)[] {
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= 3; n++) {
            out.push(this._cache.get(`Art/Effects/condenser_hit_0${n}`) ?? null);
        }
        return out;
    }

    /** 冷凝塔减速/冷凝覆盖层（condenser_slow，单帧，挂在敌人身上循环显示） */
    public static getCondenserSlowFrame(): SpriteFrame | null {
        return this._cache.get('Art/Effects/condenser_slow') ?? null;
    }

    /** 特斯拉攻击光芒帧序列（按等级：0/1 → PBall11-14，2 → PBall31-34；无 21-24） */
    public static getTeslaBeamFrames(level: number): (SpriteFrame | null)[] {
        const tens = level >= 2 ? '3' : '1';
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= 4; n++) {
            out.push(this._cache.get(`Art/Effects/tesla_beam_${tens}${n}`) ?? null);
        }
        return out;
    }

    /** 特斯拉命中敌人爆炸帧序列（PBall01-02） */
    public static getTeslaHitFrames(): (SpriteFrame | null)[] {
        return [
            this._cache.get('Art/Effects/tesla_hit_01') ?? null,
            this._cache.get('Art/Effects/tesla_hit_02') ?? null,
        ];
    }

    /** 特斯拉塔中心攻击动画帧（按等级：0 → Ball41-44，1 → Ball51-54，2 → Ball61-64） */
    public static getTeslaFireFrames(level: number): (SpriteFrame | null)[] {
        const tens = ['4', '5', '6'][Math.min(level, 2)];
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= 4; n++) {
            out.push(this._cache.get(`Art/Effects/tesla_fire_${tens}${n}`) ?? null);
        }
        return out;
    }

    // ── 各塔攻击/命中特效帧 ──
    /** 发射器命中爆点（emitter_hit_01/02） */
    public static getEmitterHitFrames(): (SpriteFrame | null)[] {
        return [
            this._cache.get('Art/Effects/emitter_hit_01') ?? null,
            this._cache.get('Art/Effects/emitter_hit_02') ?? null,
        ];
    }
    /** 光棱塔(重设计)专属命中爆点（prism_hit_01/02） */
    public static getPrismHitFrames(): (SpriteFrame | null)[] {
        return [
            this._cache.get('Art/Effects/prism_hit_01') ?? null,
            this._cache.get('Art/Effects/prism_hit_02') ?? null,
        ];
    }
    /** 光棱塔(重设计)专属减速覆盖层（prism_slow，挂在被减速敌人身上） */
    public static getPrismSlowFrame(): SpriteFrame | null {
        return this._cache.get('Art/Effects/prism_slow') ?? null;
    }
    /** 凝滞塔（便便）专属减速特效两帧序列（PShit-11 → PShit-12 循环播放） */
    public static getCoagulatorSlowFrames(): SpriteFrame[] {
        const f1 = this._cache.get('Art/Effects/coagulator_slow');
        const f2 = this._cache.get('Art/Effects/coagulator_slow_12');
        return [f1, f2].filter((f): f is SpriteFrame => !!f);
    }
    /** 星星塔命中爆点（PStar01-02） */
    public static getArtilleryHitFrames(): (SpriteFrame | null)[] {
        return [
            this._cache.get('Art/Effects/artillery_hit_01') ?? null,
            this._cache.get('Art/Effects/artillery_hit_02') ?? null,
        ];
    }
    /** 星星塔炮击落点爆炸（PStar-11~16 共6帧，240×240） */
    public static getArtilleryExplosionFrames(): (SpriteFrame | null)[] {
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= 6; n++) out.push(this._cache.get(`Art/Effects/artillery_explosion_1${n}`) ?? null);
        return out;
    }
    /** 便便塔命中爆点（PShit01-02） */
    public static getCoagulatorHitFrames(): (SpriteFrame | null)[] {
        return [
            this._cache.get('Art/Effects/coagulator_hit_01') ?? null,
            this._cache.get('Art/Effects/coagulator_hit_02') ?? null,
        ];
    }
    /** 通用塔中心攻击/落点动画帧（按等级：0/1/2 → 1x/2x/3x 组，n 帧） */
    private static getLevelFireFrames(prefix: string, level: number, count: number): (SpriteFrame | null)[] {
        const tens = String(Math.min(level, 2) + 1);
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= count; n++) out.push(this._cache.get(`Art/Effects/${prefix}_${tens}${n}`) ?? null);
        return out;
    }
    /** 火箭塔塔中心发射（PRocket11-15/21-25/31-35 按等级5帧） */
    public static getRocketFireFrames(level: number): (SpriteFrame | null)[] {
        return this.getLevelFireFrames('rocket_fire', level, 5);
    }
    /** 雪球塔塔中心雪爆（PSnow11-15/21-25/31-35 按等级5帧） */
    public static getSnowFireFrames(level: number): (SpriteFrame | null)[] {
        return this.getLevelFireFrames('snow_fire', level, 5);
    }
    /** 雪花塔定身特效（PSnow-11，定身时挂在敌人身上循环播放） */
    public static getSnowFreezeFrame(): SpriteFrame | null {
        return this._cache.get('Art/Effects/snow_freeze_11') ?? null;
    }
    /** 雪花塔定身命中爆点（TSnow/Snow00-01，2 帧） */
    public static getSnowHitFrames(): (SpriteFrame | null)[] {
        return [
            this._cache.get('Art/Effects/snow_hit_01') ?? null,
            this._cache.get('Art/Effects/snow_hit_02') ?? null,
        ];
    }

    /** 敌人本体/待机帧 = 指定皮肤行走动画的第 1 源帧（如 normal_11） */
    public static getEnemyFrame(enemyType: string, skinIdx: number = 0): SpriteFrame | null {
        const skin = this.getEnemySkin(enemyType, skinIdx);
        if (!skin) return null;
        const [prefix, frames] = skin;
        if (!frames.length) return null;
        return this._cache.get(`Art/Enemies/${prefix}_${frames[0]}`) ?? null;
    }

    /** 取指定皮肤 [素材前缀, 3 帧源帧]（越界时回退到第一套皮肤） */
    private static getEnemySkin(enemyType: string, skinIdx: number): [string, string[]] | null {
        const skins = this.ENEMY_SKINS[enemyType];
        if (!skins || !skins.length) return null;
        const idx = (skinIdx >= 0 && skinIdx < skins.length) ? skinIdx : 0;
        return skins[idx];
    }

    /** 该类型的皮肤套数（供生成敌人时换皮） */
    public static getEnemySkinCount(enemyType: string): number {
        return this.ENEMY_SKINS[enemyType]?.length ?? 1;
    }

    /**
     * 按波次取皮肤索引：**同一波内的同类怪外观一致，波与波之间轮换**。
     * 这样每波怪物的皮肤都不同，视觉上能区分波次进度。
     */
    public static getEnemySkinForWave(enemyType: string, waveIndex: number): number {
        const n = this.getEnemySkinCount(enemyType);
        if (n <= 1) return 0;
        return Math.max(0, Math.floor(waveIndex)) % n;
    }

    public static getBulletFrame(towerType: string, level: number = 0, isSplitChild: boolean = false): SpriteFrame | null {
        // 分裂子子弹与三级（level=2）主子弹使用同一素材：三级子弹投射物帧 P*31
        // 按等级投射物：P*11/21/31（瓶子/冰风扇/星星）
        const tens = String(Math.min(level, 2) + 1);
        if (towerType === 'emitter') return this._cache.get(`Art/Bullets/emitter_${tens}1`) ?? null;
        if (towerType === 'prism') return this._cache.get(`Art/Bullets/prism_${tens}1`) ?? null;
        if (towerType === 'artillery') return this._cache.get(`Art/Bullets/artillery_${tens}1`) ?? null;
        // 火箭弹与炮口火焰帧同图，直接复用 Effects/rocket_fire_{tens}1，避免重复出 Bullets 素材
        if (towerType === 'rocket') return this._cache.get(`Art/Effects/rocket_fire_${tens}1`) ?? null;
        if (towerType === 'coagulator') return this._cache.get(`Art/Bullets/coagulator_bullet_${tens}1`) ?? null;
        if (towerType === 'archer') return this._cache.get(`Art/Bullets/archer_${tens}1`) ?? null;
        // 雪花塔为范围塔，不发射子弹，无子弹帧
        return this._cache.get(`Art/Bullets/${towerType}`) ?? null;
    }

    /** 弓箭塔命中爆点帧（物理碎片感）。 */
    public static getArcherHitFrames(): (SpriteFrame | null)[] {
        const out: (SpriteFrame | null)[] = [];
        for (let n = 1; n <= 5; n++) out.push(this._cache.get(`Art/Effects/archer_fire_1${n}`) ?? null);
        return out;
    }

    /**
     * 取某塔某等级的子弹飞行帧序列（用于飞行中逐帧循环）。
     * 瓶子塔/凝滞器每级 2 帧（_1 常态 / _2 脉冲），其余塔 1 帧。
     * 第 2 帧缺失时自动回退为单帧，避免空帧。
     */
    public static getBulletFrames(towerType: string, level: number = 0, isSplitChild: boolean = false): (SpriteFrame | null)[] {
        const tens = String(Math.min(level, 2) + 1);
        const pair = (a: string, b: string): (SpriteFrame | null)[] => {
            const f1 = this._cache.get(a) ?? null;
            const f2 = this._cache.get(b) ?? null;
            return f2 ? [f1, f2] : (f1 ? [f1] : []);
        };
        if (towerType === 'emitter') {
            // 发射器：每级 3 帧飞行（_1 常态 / _2 脉冲 / _3 爆发），对齐设计的飞行 3 帧
            const a = this._cache.get(`Art/Bullets/emitter_${tens}1`) ?? null;
            const b = this._cache.get(`Art/Bullets/emitter_${tens}2`) ?? null;
            const c = this._cache.get(`Art/Bullets/emitter_${tens}3`) ?? null;
            const arr = [a, b, c].filter(Boolean) as (SpriteFrame | null)[];
            return arr.length ? arr : (a ? [a] : []);
        }
        if (towerType === 'artillery') {
            // 火炮塔：无飞行炮弹素材，子弹仅保留 1 帧静态贴图
            const a = this._cache.get(`Art/Bullets/artillery_${tens}1`) ?? null;
            return a ? [a] : [];
        }
        if (towerType === 'coagulator') return pair(`Art/Bullets/coagulator_bullet_${tens}1`, `Art/Bullets/coagulator_bullet_${tens}2`);
        const single = this.getBulletFrame(towerType, level, isSplitChild);
        return single ? [single] : [];
    }

    public static getUIFrame(name: string): SpriteFrame | null {
        return this._cache.get(`Art/UI/${name}`) ?? null;
    }

    /** 道路方向瓦片：按 MapManager.getRoadTileKey 返回的段名取帧 */
    public static getRoadTile(key: string): SpriteFrame | null {
        return this._cache.get(`Art/Road/${key}`) ?? null;
    }

    /** 障碍物贴图：按障碍类型取帧（宝箱=金袋；岩石=obstacle_big / obstacle_small_0x 轮换） */
    public static getObstacleFrame(type: ObstacleType, row: number = 0, col: number = 0): SpriteFrame | null {
        switch (type) {
            case ObstacleType.ROCK_BIG: {
                // 大岩石 2×2：obstacle_big(=B1) 与 obstacle_big_b2(=B2) 按位置轮换
                const idx = ((row + col) % 2) + 1;
                return this._cache.get(`Art/UI/obstacle_big${idx === 2 ? '_b2' : ''}`) ?? null;
            }
            case ObstacleType.ROCK_SMALL: {
                // 小岩石 1×1：obstacle_small_01/02/03 按位置轮换
                const idx = ((row + col) % 3) + 1;
                return this._cache.get(`Art/UI/obstacle_small_0${idx}`) ?? null;
            }
            case ObstacleType.CHEST_SMALL:
                return this._cache.get('Art/UI/obstacle_chest_small') ?? null;
            case ObstacleType.CHEST_BIG:
                return this._cache.get('Art/UI/obstacle_chest_big') ?? null;
            case ObstacleType.ROCK_WIDE: {
                // 宽岩石 2×1：obstacle_wide_01/02/03 按位置轮换
                const idx = ((row + col) % 3) + 1;
                return this._cache.get(`Art/UI/obstacle_wide_0${idx}`) ?? null;
            }
            default:
                return null;
        }
    }

    public static getEffectFrame(name: string): SpriteFrame | null {
        return this._cache.get(`Art/Effects/${name}`) ?? null;
    }

    /** 敌人行走动画 3 帧（指定皮肤的源帧序列，如 normal_11/12/13） */
    public static getEnemyWalkFrames(enemyType: string, skinIdx: number = 0): (SpriteFrame | null)[] {
        const skin = this.getEnemySkin(enemyType, skinIdx);
        if (!skin) return [];
        const [prefix, frames] = skin;
        return frames.map(s => this._cache.get(`Art/Enemies/${prefix}_${s}`) ?? null);
    }

    /** Get all 3 frames for a named animation sequence */
    public static getEffectSeq(effectName: string): (SpriteFrame | null)[] {
        const key = `Art/Effects/${effectName}_0`;
        return [this._cache.get(key + '1') ?? null, this._cache.get(key + '2') ?? null, this._cache.get(key + '3') ?? null];
    }

    // ── 便捷方法 ──

    public static setNodeSprite(parent: Node, sf: SpriteFrame, width: number = 60, height: number = 60, name: string = 'Sprite'): Node {
        const spriteNode = new Node(name);
        spriteNode.layer = Layers.Enum.UI_2D;
        const sprite = spriteNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = sf;
        // Sprite 组件已自带 UITransform，直接获取设置尺寸即可
        (spriteNode.getComponent(UITransform) || spriteNode.addComponent(UITransform)).setContentSize(width, height);
        parent.addChild(spriteNode);
        return spriteNode;
    }

    /**
     * 按"内容尺寸"设置精灵显示大小 —— 抵消透明 padding，并保持素材原始宽高比。
     *
     * 与 setNodeSprite 的区别：setNodeSprite 铺满的是**画布**，padding 会被等比缩小，
     * 导致视觉内容远小于预期；且强行传入正方形尺寸会拉伸变形
     * （如 splitter 画布 148×104 铺进 44×44 会被压扁）。
     *
     * @param contentSize 期望的**内容长边**显示尺寸（像素）
     */
    public static setNodeSpriteFitted(
        parent: Node,
        sf: SpriteFrame,
        contentSize: number,
        name: string = 'Sprite',
    ): Node {
        const canvasW = sf.rect.width;
        const canvasH = sf.rect.height;
        const rawPath = this._pathByFrame.get(sf);
        // CONTENT_BBOX 的 key 带 .png 后缀，而 _pathByFrame 存的是无后缀路径
        // （resources.load 用无后缀路径）→ 必须"补上"后缀再查。
        // ⚠️ 早期写成 replace 去掉后缀，导致整张 CONTENT_BBOX 表永远查不中、
        //    全部素材退回按整张画布缩放（受透明 padding 影响显得极小）。
        const path = rawPath ? (rawPath.endsWith('.png') ? rawPath : `${rawPath}.png`) : rawPath;
        // 未知素材退化为按整图处理（等价于原行为）
        const bbox = path ? this.CONTENT_BBOX[path] : null;
        const contentW = bbox ? bbox[0] : canvasW;
        const contentH = bbox ? bbox[1] : canvasH;

        // 按内容长边缩放：使内容长边正好等于 contentSize
        const scale = contentSize / Math.max(contentW, contentH);
        // 画布整体等比缩放 → 不变形，且视觉内容达到期望大小
        return this.setNodeSprite(parent, sf, canvasW * scale, canvasH * scale, name);
    }

    /**
     * 返回某素材在 CONTENT_BBOX 中的**内容长边**（无记录则回退画布长边）。
     * 供特效/子弹统一尺寸基准使用，确保同素材的火焰与飞出子弹大小一致。
     * @param noSuffixPath 无 .png 后缀的资源路径，如 'Art/Bullets/emitter_11'
     */
    public static getContentLongEdge(noSuffixPath: string): number {
        // 入参为无后缀路径，而 CONTENT_BBOX 的 key 带 .png → 补后缀再查
        const key = noSuffixPath.endsWith('.png') ? noSuffixPath : `${noSuffixPath}.png`;
        const bbox = this.CONTENT_BBOX[key];
        if (bbox) return Math.max(bbox[0], bbox[1]);
        return 30; // 兜底
    }

    /**
     * Play a frame sequence on a Sprite node.
     * Each frame `sf` lasts `interval` seconds; returns total duration in seconds.
     * Skips null frames (sequence stops there).
     */
    public static playFrameSequence(
        sprite: Sprite,
        frames: (SpriteFrame | null)[],
        interval: number,
    ): number {
        let total = 0;
        for (let i = 0; i < frames.length; i++) {
            const sf = frames[i];
            if (!sf) break;
            const delay = (i === 0 ? 0 : interval);
            sprite.scheduleOnce(() => { sprite.spriteFrame = sf; }, delay);
            total = delay + interval;
        }
        return total + interval * 0.5; // small margin after last frame
    }
}
