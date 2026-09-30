import { _decorator, Component, Node, Layers } from 'cc';
const { ccclass } = _decorator;

import { UIManager } from './UI/UIManager';

@ccclass('Main')
export class Main extends Component {

    onLoad(): void {
        const uiManagerNode = new Node('UIManager');
        uiManagerNode.layer = Layers.Enum.UI_2D;
        this.node.addChild(uiManagerNode);
        uiManagerNode.addComponent(UIManager);
    }
}