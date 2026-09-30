import { Node } from 'cc';

/**
 * 销毁节点的全部子节点。
 *
 * Cocos 的 `Node.removeAllChildren()` 只会把子节点从父节点**脱离**（detach），
 * **并不会销毁**它们。在持久节点或对象池复用的节点上反复调用 `removeAllChildren()`
 * 会持续产生无人引用、也无人回收的孤儿节点 —— 既泄漏内存，又残留渲染/组件开销。
 *
 * 因此凡是"清空旧 UI/特效并重建"的场景，都应使用本函数（脱离 + 销毁）。
 * 使用 `removeFromParent()` 先立即脱离，避免新旧节点同帧并存导致的短暂重影。
 */
export function destroyChildren(node: Node | null | undefined): void {
    if (!node || !node.isValid) return;
    // 复制一份再遍历：销毁会实时改变 children 数组
    const children = node.children.slice();
    for (const c of children) {
        if (c && c.isValid) {
            c.removeFromParent();
            c.destroy();
        }
    }
}
