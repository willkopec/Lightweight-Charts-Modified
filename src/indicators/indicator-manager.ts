// src/indicators/indicator-manager.ts

import { RSIIndicator, PriceData } from './rsi';
import { Series } from '../model/series';
import { SeriesType } from '../model/series-options';
import { Pane } from '../model/pane';

export interface IndicatorPane {
    id: string;
    type: 'RSI' | 'MACD' | 'STOCH'; // Add more as needed
    pane: Pane;
    indicator: RSIIndicator; // Will need to make this generic later
    series: Series<'Line'>; // RSI uses line series
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

    public addRSI(
        mainSeriesData: readonly PriceData[], 
        createPaneCallback: () => Pane,
        createSeriesCallback: (pane: Pane, type: 'Line') => Series<'Line'>
    ): string {
        const id = `RSI_${this._nextId++}`;
        
        // Create RSI indicator
        const rsi = new RSIIndicator();
        
        // Calculate initial RSI values
        const rsiData = rsi.calculate(mainSeriesData);
        
        // Create new pane for the indicator
        const pane = createPaneCallback();
        
        // Create line series for RSI
        const series = createSeriesCallback(pane, 'Line');
        
        // Configure series for RSI - omit lineWidth to avoid type issues
        series.applyOptions({
            color: rsi.options().color,
            // lineWidth: 1, // Remove this line to avoid type conflict
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => rsi.formatValue(price),
            },
            title: 'RSI(14)',
            visible: rsi.options().visible,
            priceScaleId: 'rsi',
        });

        // Set RSI data to series
        const seriesData = rsiData.map(point => ({
            time: point.time as any, // Cast to match expected time type
            value: point.value,
        }));
        
        if (seriesData.length > 0) {
            (series as any).setData(seriesData); // Cast to bypass type checking for now
        }

        // Create indicator pane object
        const indicatorPane: IndicatorPane = {
            id,
            type: 'RSI',
            pane,
            indicator: rsi,
            series,
            height: 100, // Default height for RSI pane
        };

        // Store the indicator
        this._indicators.set(id, indicatorPane);

        // Notify callback
        this._callbacks.onIndicatorAdded(indicatorPane);

        return id;
    }

    public removeIndicator(id: string): boolean {
        const indicatorPane = this._indicators.get(id);
        if (!indicatorPane) {
            return false;
        }

        // Clean up the indicator
        this._indicators.delete(id);

        // Notify callback
        this._callbacks.onIndicatorRemoved(id);

        return true;
    }

    public updateIndicator(id: string, newData: readonly PriceData[]): void {
        const indicatorPane = this._indicators.get(id);
        if (!indicatorPane) {
            return;
        }

        if (indicatorPane.type === 'RSI') {
            // Recalculate RSI
            const rsiData = indicatorPane.indicator.calculate(newData);
            
            // Update series data
            const seriesData = rsiData.map(point => ({
                time: point.time as any, // Cast to match expected time type
                value: point.value,
            }));
            
            if (seriesData.length > 0) {
                (indicatorPane.series as any).setData(seriesData); // Cast to bypass type checking for now
            }

            // Notify callback
            this._callbacks.onIndicatorUpdated(id);
        }
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

    // Helper method to convert series data to price data format
    public static seriesToPriceData(series: Series<SeriesType>): PriceData[] {
        // We need to access the series data through the dataSource interface
        // This is a simplified approach - in the real implementation we'd need to
        // properly interface with the series data structure
        try {
            // Try to access data through series methods
            const seriesData = (series as any).dataSource?.dataSource?.data() || [];
            return seriesData.map((point: any) => ({
                time: point.time as number,
                close: point.close || point.value || 0
            }));
        } catch (error) {
            console.warn('Could not extract series data for indicator calculation:', error);
            return [];
        }
    }
}