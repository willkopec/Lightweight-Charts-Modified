// src/indicators/indicator-manager.ts

import { RSIIndicator, PriceData } from './rsi';
import { Series } from '../model/series';
import { SeriesType } from '../model/series-options';
import { Pane } from '../model/pane';

export interface IndicatorPane {
    id: string;
    type: 'RSI' | 'MACD' | 'STOCH';
    pane: Pane;
    indicator: RSIIndicator;
    series: Series<'Line'>;
    height: number;
}

export interface IndicatorManagerCallbacks {
    onIndicatorAdded: (indicatorPane: IndicatorPane) => void;
    onIndicatorRemoved: (indicatorId: string) => void;
    onIndicatorUpdated: (indicatorId: string) => void;
}

export class IndicatorManager {
    private _indicators: Map<string, IndicatorPane> = new Map();
    private _callbacks: IndicatorManagerCallbacks;
    private _nextId: number = 1;

    public constructor(callbacks: IndicatorManagerCallbacks) {
        this._callbacks = callbacks;
    }

    public addRSIIndicator(): string {
    try {
        console.log('=== ULTIMATE RSI CREATION ===');
        
        // Create basic indicator using indicator manager
        const indicatorId = this._indicatorManager.addRSI(
            [], // Empty data for now
            () => this._getOrCreatePane(this._panes.length),
            (pane: Pane, type: 'Line') => {
                const LineSeries = this._findLineSeriesDefinition();
                const createPaneView = LineSeries.createPaneView;
                const rsiSeries = new Series(this, type, {
                    color: '#FF6B35',
                    lineWidth: 2,
                    title: 'ULTIMATE RSI',
                    priceScaleId: 'right',
                    lastValueVisible: true,
                    priceLineVisible: false,
                } as any, createPaneView) as any;
                
                this._addSeriesToPane(rsiSeries, pane);
                this._serieses.push(rsiSeries);
                
                return rsiSeries;
            }
        );
        
        console.log('Basic indicator created, now applying ULTIMATE fix...');
        
        // Wait a moment for everything to settle, then apply the ultimate fix
        setTimeout(() => {
            this.forceIndicatorPriceScale(indicatorId);
        }, 200);
        
        // Force immediate updates
        this.recalculateAllPanes();
        this._priceScalesOptionsChanged.fire();
        this.fullUpdate();
        
        console.log('=== ULTIMATE RSI CREATION COMPLETE ===');
        return indicatorId;
        
    } catch (e) {
        console.error('ULTIMATE RSI creation failed:', e);
        throw e;
    }
}

    public removeIndicator(id: string): boolean {
        const indicatorPane = this._indicators.get(id);
        if (!indicatorPane) {
            return false;
        }

        this._indicators.delete(id);
        this._callbacks.onIndicatorRemoved(id);
        return true;
    }

    public updateIndicator(id: string, newData: readonly PriceData[]): void {
        // Skip for now
    }

    public getIndicator(id: string): IndicatorPane | undefined {
        return this._indicators.get(id);
    }

    public getAllIndicators(): IndicatorPane[] {
        return Array.from(this._indicators.values());
    }

    public getIndicatorsByType(type: 'RSI' | 'MACD' | 'STOCH'): IndicatorPane[] {
        return Array.from(this._indicators.values()).filter(indicator => indicator.type === type);
    }

    public hasIndicators(): boolean {
        return this._indicators.size > 0;
    }

    public clear(): void {
        this._indicators.clear();
    }

    public static seriesToPriceData(series: Series<SeriesType>): PriceData[] {
        console.log('NUCLEAR: Skipping series conversion');
        return [];
    }
}