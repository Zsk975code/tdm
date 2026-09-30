/**
 * 图鉴发现管理：记录玩家「首次遭遇」过的单位 / 任务类型，持久化到 localStorage。
 * 未解锁的图鉴条目显示为「？？？」，首次在战斗中遭遇后解锁。
 *
 * 四类：towers（建塔）/ enemies（敌人出场）/ obstacles（障碍生成）/ missions（隐藏任务完成）。
 * 所有方法幂等，可放心在实体初始化 / 任务完成时频繁调用。
 */
const STORE_KEY = 'tower_defense_codex';

export type CodexKind = 'towers' | 'enemies' | 'obstacles' | 'missions';

type CodexStore = Record<CodexKind, string[]>;

function emptyStore(): CodexStore {
    return { towers: [], enemies: [], obstacles: [], missions: [] };
}

function load(): CodexStore {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                const s = emptyStore();
                (Object.keys(s) as CodexKind[]).forEach(k => {
                    if (Array.isArray(data[k])) s[k] = data[k].filter(x => typeof x === 'string');
                });
                return s;
            }
        }
    } catch { /* 忽略损坏数据 */ }
    return emptyStore();
}

function save(s: CodexStore): void {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch { /* 隐私模式可能写失败，忽略 */ }
}

export class CodexManager {
    /** 标记某类条目已发现（幂等） */
    public static discover(kind: CodexKind, id: string): void {
        if (!id) return;
        const s = load();
        if (!s[kind].includes(id)) {
            s[kind].push(id);
            save(s);
        }
    }

    public static isDiscovered(kind: CodexKind, id: string): boolean {
        return load()[kind].includes(id);
    }

    /** 某类已发现数量 / 总数 */
    public static count(kind: CodexKind, total: number): { found: number; total: number } {
        return { found: load()[kind].length, total };
    }

    /** 开发用：清空全部图鉴进度 */
    public static resetAll(): void {
        save(emptyStore());
    }
}
