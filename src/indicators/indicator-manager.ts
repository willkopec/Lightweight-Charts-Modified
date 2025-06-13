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
    
    console.log('Creating RSI with data points:', mainSeriesData.length);
    
    // Create RSI indicator
    const rsi = new RSIIndicator();
    
    // Calculate initial RSI values
    const rsiData = rsi.calculate(mainSeriesData);
    console.log('RSI calculated, data points:', rsiData.length);
    
    if (rsiData.length > 0) {
        console.log('First RSI data point:', rsiData[0]);
        console.log('Last RSI data point:', rsiData[rsiData.length - 1]);
        console.log('Sample RSI values:', rsiData.slice(0, 5).map(p => p.value));
    }
    
    // Create new pane for the indicator
    const pane = createPaneCallback();
    
    // Create line series for RSI  
    const series = createSeriesCallback(pane, 'Line');
    
    // Configure series for RSI
    series.applyOptions({
        color: rsi.options().color,
        lineWidth: 2 as any,
        priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
        },
        title: 'RSI(14)',
        visible: true,
        priceScaleId: 'right',
        lastValueVisible: true,
        priceLineVisible: false,
    });

    // Convert RSI data to line series format
    console.log('Converting RSI data to series format...');
    const seriesData = rsiData.map((point, index) => {
        // Ensure we're using the correct property names
        const dataPoint = {
            time: point.time,
            value: point.value
        };
        if (index < 3) {
            console.log('RSI series data point', index, ':', dataPoint);
            console.log('Original RSI point:', point);
            console.log('Point.time type:', typeof point.time, 'Point.value type:', typeof point.value);
        }
        return dataPoint;
    });
    
    console.log('Setting RSI series data, points:', seriesData.length);
    
    if (seriesData.length > 0) {
        // CRITICAL: Check if all timestamps are the same (this would break the chart)
        const firstTime = seriesData[0].time;
        const lastTime = seriesData[seriesData.length - 1].time;
        const allSameTime = seriesData.every(point => point.time === firstTime);
        
        console.log('Time analysis:');
        console.log('First time:', firstTime);
        console.log('Last time:', lastTime);
        console.log('All times the same:', allSameTime);
        
        if (allSameTime) {
            console.error('ERROR: All RSI data points have the same timestamp! This will break the chart.');
            console.log('Sample timestamps:', seriesData.slice(0, 10).map(p => p.time));
            
            // Try to fix by using incremental timestamps
            console.log('Attempting to fix timestamps...');
            const baseTime = firstTime;
            seriesData.forEach((point, index) => {
                point.time = baseTime + index; // Add index to make unique timestamps
            });
            console.log('Fixed timestamps, first few:', seriesData.slice(0, 5).map(p => p.time));
        }
        
        // Set the data using simple format first
        console.log('About to call series.setData with:', seriesData.length, 'points');
        console.log('First series data point:', seriesData[0]);
        console.log('Last series data point:', seriesData[seriesData.length - 1]);
        
        // Create clean data without _internal_ prefixes for setData
        const cleanSeriesData = seriesData.map(point => ({
            time: point.time,
            value: point.value
        }));
        
        console.log('Clean series data sample:', cleanSeriesData.slice(0, 3));
        
        try {
            series.setData(cleanSeriesData as any);
            console.log('Series data set successfully with clean format');
        } catch (error) {
            console.error('Failed to set series data:', error);
        }
        
        // Check what the series now contains
        const seriesBars = series.bars();
        const seriesIndices = seriesBars.indices();
        console.log('Series now has', seriesIndices.length, 'data points');
        
        if (seriesIndices.length > 0) {
            const firstSeriesBar = seriesBars.valueAt(seriesIndices[0]);
            console.log('First series bar after setData:', firstSeriesBar);
            if (firstSeriesBar && firstSeriesBar.value) {
                console.log('First series bar value:', firstSeriesBar.value);
            }
        }
        
        // CRITICAL FIX: Force recalculation of the pane
        const model = series.model();
        model.recalculatePane(pane);
        model.fullUpdate();
        
        // Add reference lines after a delay
        setTimeout(() => {
            series.createPriceLine({
                price: 70,
                color: '#787B86',
                lineWidth: 1 as any,
                lineStyle: 2 as any,
                lineVisible: true,
                axisLabelVisible: true,
                axisLabelColor: '#787B86',
                axisLabelTextColor: '#000000',
                title: '',
            });
            
            series.createPriceLine({
                price: 30,
                color: '#787B86',
                lineWidth: 1 as any,
                lineStyle: 2 as any,
                lineVisible: true,
                axisLabelVisible: true,
                axisLabelColor: '#787B86',
                axisLabelTextColor: '#000000',
                title: '',
            });
        }, 100);
    } else {
        console.error('No RSI series data to set!');
    }

    // Create indicator pane object
    const indicatorPane: IndicatorPane = {
        id,
        type: 'RSI',
        pane,
        indicator: rsi,
        series,
        height: 100,
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
            
            // Convert RSI data to series format - need proper plot row structure
            const seriesData = rsiData.map((point, index) => {
                return {
                    index: index as any, // TimePointIndex
                    time: point.time as any, // TimeScalePoint
                    value: [point.value], // Line series expects array with single value [close]
                    originalTime: point.time,
                };
            });
            
            if (seriesData.length > 0) {
                (indicatorPane.series.setData as any)(seriesData, {
                    lastBarUpdatedOrNewBarsAddedToTheRight: true,
                    historicalUpdate: false
                });
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

    public static seriesToPriceData(series: Series<SeriesType>): PriceData[] {
    console.log('Converting series to price data...');
    
    try {
        // Get the series bars data
        const bars = series.bars();
        const indices = bars.indices();
        
        console.log('Found', indices.length, 'data points in series');
        
        // Debug: Let's see what the actual data structure looks like
        if (indices.length > 0) {
            const firstBar = bars.valueAt(indices[0]);
            console.log('First bar structure:', firstBar);
            if (firstBar && firstBar.value) {
                console.log('First bar value structure:', firstBar.value);
                console.log('First bar value type:', typeof firstBar.value);
                console.log('First bar value length:', Array.isArray(firstBar.value) ? firstBar.value.length : 'not array');
                console.log('First bar value contents:', firstBar.value);
            }
            if (firstBar && firstBar.time) {
                console.log('First bar time:', firstBar.time);
            }
        }
        
        const priceData: PriceData[] = [];
        
        for (const index of indices) {
            const bar = bars.valueAt(index);
            if (bar && bar.value) {
                // Extract time - FIXED timestamp handling
                let timestamp: number;
                const timePoint = bar.time;
                
                if (typeof timePoint === 'number') {
                    timestamp = timePoint;
                } else if (typeof timePoint === 'string') {
                    // Parse string time to timestamp
                    const date = new Date(timePoint);
                    timestamp = date.getTime() / 1000; // Convert to seconds
                } else if (timePoint && typeof timePoint === 'object') {
                    // FIXED: Use direct property access instead of 'in' operator
                    const internalTimestamp = (timePoint as any)._internal_timestamp;
                    
                    if (internalTimestamp !== undefined && typeof internalTimestamp === 'number') {
                        timestamp = internalTimestamp;
                        if (index < 3) {
                            console.log('Using _internal_timestamp:', timestamp);
                        }
                    } else if ('year' in timePoint && 'month' in timePoint && 'day' in timePoint) {
                        // Handle business day format like { year: 2023, month: 12, day: 15 }
                        const businessDay = timePoint as any;
                        const date = new Date(businessDay.year, businessDay.month - 1, businessDay.day);
                        timestamp = date.getTime() / 1000;
                    } else {
                        // Try to use originalTime if available
                        timestamp = (bar as any).originalTime || Date.now() / 1000;
                        if (index < 3) {
                            console.log('Using fallback timestamp:', timestamp);
                        }
                    }
                } else {
                    // Use originalTime as fallback
                    timestamp = (bar as any).originalTime || Date.now() / 1000;
                }
                
                // Extract close price - handle different series types
                let closePrice: number;
                const values = bar.value;
                
                if (Array.isArray(values)) {
                    // For OHLC data, close is typically the last value (index 3)
                    // Check if we have at least 4 values for OHLC
                    if (values.length >= 4) {
                        closePrice = values[3]; // Close price at index 3
                    } else if (values.length > 0) {
                        closePrice = values[values.length - 1]; // Last available value
                    } else {
                        console.warn('Empty values array for bar at index:', index);
                        continue; // Skip this bar if no values
                    }
                } else if (typeof values === 'number') {
                    // Single value (like Line series)
                    closePrice = values;
                } else {
                    console.warn('Unknown value type for bar at index:', index, 'values:', values);
                    continue; // Skip if we can't determine price
                }
                
                // Additional validation for closePrice
                if (typeof closePrice !== 'number' || isNaN(closePrice) || !isFinite(closePrice)) {
                    console.warn('Invalid close price for bar at index:', index, 'closePrice:', closePrice);
                    continue;
                }
                
                // Create the data object with explicit property assignment to avoid any proxy issues
                const dataPoint: PriceData = {} as PriceData;
                dataPoint.time = timestamp;
                dataPoint.close = closePrice;
                
                priceData.push(dataPoint);
                
                // Debug: check what we're actually creating
                if (priceData.length <= 3) {
                    const justAdded = priceData[priceData.length - 1];
                    console.log(`Created price data[${priceData.length - 1}]:`, justAdded);
                    console.log('Properties:', Object.keys(justAdded));
                    console.log('time value:', justAdded.time, 'close value:', justAdded.close);
                }
            } else {
                console.warn('Invalid bar data at index:', index, 'bar:', bar);
            }
        }
        
        // Sort by time to ensure proper order
        priceData.sort((a, b) => a.time - b.time);
        
        console.log('Converted to', priceData.length, 'price data points');
        if (priceData.length > 0) {
            console.log('First price data point:', priceData[0]);
            console.log('Last price data point:', priceData[priceData.length - 1]);
            console.log('Sample prices:', priceData.slice(0, 5).map(p => p.close));
        }
        
        return priceData;
        
    } catch (error) {
        console.error('Error converting series to price data:', error);
        if (error instanceof Error) {
            console.error('Error stack:', error.stack);
        }
        return [];
    }
}
}