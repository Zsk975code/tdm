import { _decorator, Component, EventTarget } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CurrencyManager')
export class CurrencyManager extends Component {
    private static _instance: CurrencyManager | null = null;
    private _gold: number = 0;
    private _eventTarget: EventTarget = new EventTarget();

    public static readonly EVENT_GOLD_CHANGED = 'gold-changed';

    public static get instance(): CurrencyManager {
        return this._instance;
    }

    public get gold(): number {
        return this._gold;
    }

    public get eventTarget(): EventTarget {
        return this._eventTarget;
    }

    onLoad(): void {
        CurrencyManager._instance = this;
    }

    onDestroy(): void {
        if (CurrencyManager._instance === this) {
            CurrencyManager._instance = null;
        }
    }

    public init(gold: number): void {
        this._gold = gold;
        this._eventTarget.emit(CurrencyManager.EVENT_GOLD_CHANGED, this._gold);
    }

    public addGold(amount: number): void {
        this._gold += amount;
        this._eventTarget.emit(CurrencyManager.EVENT_GOLD_CHANGED, this._gold);
    }

    public spendGold(amount: number): boolean {
        if (this._gold < amount) return false;
        this._gold -= amount;
        this._eventTarget.emit(CurrencyManager.EVENT_GOLD_CHANGED, this._gold);
        return true;
    }

    public hasEnough(amount: number): boolean {
        return this._gold >= amount;
    }
}