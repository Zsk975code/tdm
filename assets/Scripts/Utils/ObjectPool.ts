import { _decorator, Node, instantiate, Prefab, NodePool } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ObjectPool')
export class ObjectPool {
    private static _instance: ObjectPool | null = null;
    private pools: Map<string, NodePool> = new Map();
    private prefabs: Map<string, Prefab> = new Map();

    public static get instance(): ObjectPool {
        if (!this._instance) {
            this._instance = new ObjectPool();
        }
        return this._instance;
    }

    public registerPrefab(name: string, prefab: Prefab): void {
        this.prefabs.set(name, prefab);
        this.pools.set(name, new NodePool());
    }

    public get(name: string): Node | null {
        const pool = this.pools.get(name);
        if (pool && pool.size() > 0) {
            const node = pool.get()!;
            node.active = true;
            return node;
        }

        const prefab = this.prefabs.get(name);
        if (prefab) {
            const node = instantiate(prefab);
            return node;
        }
        return null;
    }

    public put(name: string, node: Node): void {
        node.active = false;
        const pool = this.pools.get(name);
        if (pool) {
            pool.put(node);
        }
    }

    public clear(name: string): void {
        const pool = this.pools.get(name);
        if (pool) {
            pool.clear();
        }
    }

    public clearAll(): void {
        this.pools.forEach((pool) => pool.clear());
        this.pools.clear();
        this.prefabs.clear();
    }
}