import {
	BitmapCoordinatesRenderingScope,
	CanvasElementBitmapSizeBinding,
	CanvasRenderingTarget2D,
	equalSizes,
	Size,
	size,
	tryCreateCanvasRenderingTarget2D,
} from 'fancy-canvas';
import { Trendline } from '../model/trendline';
import { FibonacciRetracement } from '../model/fibonacci-retracement';

import { ensureNotNull } from '../helpers/assertions';
import { clearRect, clearRectWithGradient } from '../helpers/canvas-helpers';
import { Delegate } from '../helpers/delegate';
import { IDestroyable } from '../helpers/idestroyable';
import { ISubscription } from '../helpers/isubscription';

import { IChartModelBase, TrackingModeExitMode } from '../model/chart-model';
import { Coordinate } from '../model/coordinate';
import { IDataSourcePaneViews } from '../model/idata-source';
import { InvalidationLevel } from '../model/invalidate-mask';
import { KineticAnimation } from '../model/kinetic-animation';
import { Pane } from '../model/pane';
import { hitTestPane, HitTestResult } from '../model/pane-hit-test';
import { Point } from '../model/point';
import { TimePointIndex } from '../model/time-data';
import { TouchMouseEventData } from '../model/touch-mouse-event-data';
import { IPaneRenderer } from '../renderers/ipane-renderer';
import { IPaneView } from '../views/pane/ipane-view';

import { AttributionLogoWidget } from './attribution-logo-widget';
import { createBoundCanvas, releaseCanvas } from './canvas-utils';
import { IChartWidgetBase } from './chart-widget';
import { drawBackground, drawForeground, DrawFunction, drawSourceViews, ViewsGetter } from './draw-functions';
import { MouseEventHandler, MouseEventHandlerEventBase, MouseEventHandlerMouseEvent, MouseEventHandlers, MouseEventHandlerTouchEvent, Position, TouchMouseEvent } from './mouse-event-handler';
import { PriceAxisWidget, PriceAxisWidgetSide } from './price-axis-widget';

const enum KineticScrollConstants {
	MinScrollSpeed = 0.2,
	MaxScrollSpeed = 7,
	DumpingCoeff = 0.997,
	ScrollMinMove = 15,
}

function sourceBottomPaneViews(source: IDataSourcePaneViews, pane: Pane): readonly IPaneView[] {
	return source.bottomPaneViews?.(pane) ?? [];
}
function sourcePaneViews(source: IDataSourcePaneViews, pane: Pane): readonly IPaneView[] {
	return source.paneViews?.(pane) ?? [];
}
function sourceLabelPaneViews(source: IDataSourcePaneViews, pane: Pane): readonly IPaneView[] {
	return source.labelPaneViews?.(pane) ?? [];
}
function sourceTopPaneViews(source: IDataSourcePaneViews, pane: Pane): readonly IPaneView[] {
	return source.topPaneViews?.(pane) ?? [];
}

interface StartScrollPosition extends Point {
	timestamp: number;
	localX: Coordinate;
	localY: Coordinate;
}

export class PaneWidget implements IDestroyable, MouseEventHandlers {
	private readonly _chart: IChartWidgetBase;
	private _state: Pane | null;
	private _size: Size = size({ width: 0, height: 0 });
	private _leftPriceAxisWidget: PriceAxisWidget | null = null;
	private _rightPriceAxisWidget: PriceAxisWidget | null = null;
	private _attributionLogoWidget: AttributionLogoWidget | null = null;
	private readonly _paneCell: HTMLElement;
	private readonly _leftAxisCell: HTMLElement;
	private readonly _rightAxisCell: HTMLElement;
	private readonly _canvasBinding: CanvasElementBitmapSizeBinding;
	private readonly _topCanvasBinding: CanvasElementBitmapSizeBinding;
	private readonly _rowElement: HTMLElement;
	private readonly _mouseEventHandler: MouseEventHandler;
	private _startScrollingPos: StartScrollPosition | null = null;
	private _isScrolling: boolean = false;
	private _clicked: Delegate<TimePointIndex | null, Point, TouchMouseEventData> = new Delegate();
	private _dblClicked: Delegate<TimePointIndex | null, Point, TouchMouseEventData> = new Delegate();
	private _prevPinchScale: number = 0;
	private _longTap: boolean = false;
	private _startTrackPoint: Point | null = null;
	private _exitTrackingModeOnNextTry: boolean = false;
	private _initCrosshairPosition: Point | null = null;

	private _scrollXAnimation: KineticAnimation | null = null;

	private _isSettingSize: boolean = false;
	private _trendlines: Map<string, Trendline> = new Map();
	private _fibonacciRetracements: Map<string, FibonacciRetracement> = new Map();

	public constructor(chart: IChartWidgetBase, state: Pane) {
		this._chart = chart;

		this._state = state;
		this._state.onDestroyed().subscribe(this._onStateDestroyed.bind(this), this, true);

		this._paneCell = document.createElement('td');
		this._paneCell.style.padding = '0';
		this._paneCell.style.position = 'relative';

		const paneWrapper = document.createElement('div');
		paneWrapper.style.width = '100%';
		paneWrapper.style.height = '100%';
		paneWrapper.style.position = 'relative';
		paneWrapper.style.overflow = 'hidden';

		this._leftAxisCell = document.createElement('td');
		this._leftAxisCell.style.padding = '0';

		this._rightAxisCell = document.createElement('td');
		this._rightAxisCell.style.padding = '0';

		this._paneCell.appendChild(paneWrapper);

		this._canvasBinding = createBoundCanvas(paneWrapper, size({ width: 16, height: 16 }));
		this._canvasBinding.subscribeSuggestedBitmapSizeChanged(this._canvasSuggestedBitmapSizeChangedHandler);
		const canvas = this._canvasBinding.canvasElement;
		canvas.style.position = 'absolute';
		canvas.style.zIndex = '1';
		canvas.style.left = '0';
		canvas.style.top = '0';

		this._topCanvasBinding = createBoundCanvas(paneWrapper, size({ width: 16, height: 16 }));
		this._topCanvasBinding.subscribeSuggestedBitmapSizeChanged(this._topCanvasSuggestedBitmapSizeChangedHandler);
		const topCanvas = this._topCanvasBinding.canvasElement;
		topCanvas.style.position = 'absolute';
		topCanvas.style.zIndex = '2';
		topCanvas.style.left = '0';
		topCanvas.style.top = '0';

		this._rowElement = document.createElement('tr');
		this._rowElement.appendChild(this._leftAxisCell);
		this._rowElement.appendChild(this._paneCell);
		this._rowElement.appendChild(this._rightAxisCell);
		this.updatePriceAxisWidgetsStates();

		this._mouseEventHandler = new MouseEventHandler(
			this._topCanvasBinding.canvasElement,
			this,
			{
				treatVertTouchDragAsPageScroll: () => this._startTrackPoint === null && !this._chart.options()['handleScroll'].vertTouchDrag,
				treatHorzTouchDragAsPageScroll: () => this._startTrackPoint === null && !this._chart.options()['handleScroll'].horzTouchDrag,
			}
		);
	}

	public destroy(): void {
		if (this._leftPriceAxisWidget !== null) {
			this._leftPriceAxisWidget.destroy();
		}
		if (this._rightPriceAxisWidget !== null) {
			this._rightPriceAxisWidget.destroy();
		}
		this._attributionLogoWidget = null;

		this._topCanvasBinding.unsubscribeSuggestedBitmapSizeChanged(this._topCanvasSuggestedBitmapSizeChangedHandler);
		releaseCanvas(this._topCanvasBinding.canvasElement);
		this._topCanvasBinding.dispose();

		this._canvasBinding.unsubscribeSuggestedBitmapSizeChanged(this._canvasSuggestedBitmapSizeChangedHandler);
		releaseCanvas(this._canvasBinding.canvasElement);
		this._canvasBinding.dispose();

		if (this._state !== null) {
			this._state.onDestroyed().unsubscribeAll(this);
			this._state.destroy();
		}

		this._mouseEventHandler.destroy();
	}

	public state(): Pane {
		return ensureNotNull(this._state);
	}

	public setState(pane: Pane | null): void {
		if (this._state !== null) {
			this._state.onDestroyed().unsubscribeAll(this);
		}

		this._state = pane;

		if (this._state !== null) {
			this._state.onDestroyed().subscribe(PaneWidget.prototype._onStateDestroyed.bind(this), this, true);
		}

		this.updatePriceAxisWidgetsStates();

		if (this._chart.paneWidgets().indexOf(this) === this._chart.paneWidgets().length - 1) {
			this._attributionLogoWidget = this._attributionLogoWidget ?? new AttributionLogoWidget(this._paneCell, this._chart);
			this._attributionLogoWidget.update();
		} else {
			this._attributionLogoWidget?.removeElement();
			this._attributionLogoWidget = null;
		}
	}

	public chart(): IChartWidgetBase {
		return this._chart;
	}

	public getElement(): HTMLElement {
		return this._rowElement;
	}

	public updatePriceAxisWidgetsStates(): void {
		if (this._state === null) {
			return;
		}

		this._recreatePriceAxisWidgets();
		if (this._model().serieses().length === 0) {
			return;
		}

		if (this._leftPriceAxisWidget !== null) {
			const leftPriceScale = this._state.leftPriceScale();
			this._leftPriceAxisWidget.setPriceScale(ensureNotNull(leftPriceScale));
		}
		if (this._rightPriceAxisWidget !== null) {
			const rightPriceScale = this._state.rightPriceScale();
			this._rightPriceAxisWidget.setPriceScale(ensureNotNull(rightPriceScale));
		}
	}

	public updatePriceAxisWidgets(): void {
		if (this._leftPriceAxisWidget !== null) {
			this._leftPriceAxisWidget.update();
		}
		if (this._rightPriceAxisWidget !== null) {
			this._rightPriceAxisWidget.update();
		}
	}

	public updateTrendlines(trendlines: Map<string, Trendline>): void {
    // Store trendlines for rendering
    this._trendlines = trendlines;
}

public updateFibonacciRetracements(fibonacciRetracements: Map<string, FibonacciRetracement>): void {
    // Store fibonacci retracements for rendering
    this._fibonacciRetracements = fibonacciRetracements;
}

	public stretchFactor(): number {
		return this._state !== null ? this._state.stretchFactor() : 0;
	}

	public setStretchFactor(stretchFactor: number): void {
		if (this._state) {
			this._state.setStretchFactor(stretchFactor);
		}
	}

	public mouseEnterEvent(event: MouseEventHandlerMouseEvent): void {
		if (!this._state) {
			return;
		}
		this._onMouseEvent();
		const x = event.localX;
		const y = event.localY;
		this._setCrosshairPosition(x, y, event);
	}

	public mouseDownEvent(event: MouseEventHandlerMouseEvent): void {
		this._onMouseEvent();
		this._mouseTouchDownEvent();
		this._setCrosshairPosition(event.localX, event.localY, event);
	}

	public mouseMoveEvent(event: MouseEventHandlerMouseEvent): void {
    if (!this._state) {
        return;
    }
    this._onMouseEvent();
    const x = event.localX;
    const y = event.localY;
    
    // Check if chart widget is in trendline drawing mode
    const chartWidget = this._chart as any;
    console.log('Chart widget debug:', {
        hasChart: !!chartWidget,
        isDrawing: chartWidget._isDrawingTrendline,
        startPoint: chartWidget._trendlineStartPoint,
        chartType: typeof chartWidget
    });
    
    if (chartWidget._isDrawingTrendline) {
        console.log('In trendline drawing mode, start point:', chartWidget._trendlineStartPoint);
        // If we have a start point, update the preview line
        if (chartWidget._trendlineStartPoint) {
            console.log('Updating preview to:', x, y);
            this._updateTrendlinePreview(x, y);
        }
        // Still update crosshair position for the dot, but don't use magnet
        this._setCrosshairPosition(x, y, event);
        return;
    }
    
    this._setCrosshairPosition(x, y, event);
}

private _updateTrendlinePreview(currentX: number, currentY: number): void {
    const chartWidget = this._chart as any;
    if (!chartWidget._trendlineStartPoint) {
        return;
    }
    
    // Store the preview end point for rendering
const priceScale = this._state?.defaultPriceScale();
const firstValue = priceScale?.firstValue();
if (!priceScale || firstValue === null || firstValue === undefined) {
    return;
}

const currentPrice = (priceScale as any)._internal_coordinateToPrice(currentY as Coordinate, firstValue);
    if (currentPrice === null) {
        return;
    }
    
    let currentTime: number;
    
    // Use the same extrapolation logic as trendline creation
    const timeScale = this._model().timeScale() as any;
    const baseIndex = timeScale._internal_baseIndex();
    const baseCoord = timeScale._internal_indexToCoordinate(baseIndex);
    
    if (baseCoord !== null && currentX > baseCoord) {
        currentTime = chartWidget._extrapolateTimeFromCoordinate(currentX);
    } else {
    const index = timeScale.coordinateToIndex(currentX as Coordinate);
    if (index !== null && index !== undefined) {
        const timePoint = timeScale.indexToTimeScalePoint(index)?.originalTime;
        currentTime = timePoint !== undefined ? (timePoint as number) : chartWidget._extrapolateTimeFromCoordinate(currentX);
    } else {
        currentTime = chartWidget._extrapolateTimeFromCoordinate(currentX);
    }
}
    
    // Set the preview data for rendering
    (chartWidget as any)._trendlinePreviewEnd = {
        x: currentX,
        y: currentY,
        time: currentTime,
        price: currentPrice
    };
    
    // Trigger a light update to redraw the preview
    this._model().lightUpdate();
}

	public mouseClickEvent(event: MouseEventHandlerMouseEvent): void {
		if (this._state === null) {
			return;
		}
		this._onMouseEvent();
		this._fireClickedDelegate(event);
	}

	public mouseDoubleClickEvent(event: MouseEventHandlerMouseEvent | MouseEventHandlerTouchEvent): void {
		if (this._state === null) {
			return;
		}
		this._fireMouseClickDelegate(this._dblClicked, event);
	}

	public doubleTapEvent(event: MouseEventHandlerTouchEvent): void {
		this.mouseDoubleClickEvent(event);
	}

	public pressedMouseMoveEvent(event: MouseEventHandlerMouseEvent): void {
		this._onMouseEvent();
		this._pressedMouseTouchMoveEvent(event);
		this._setCrosshairPosition(event.localX, event.localY, event);
	}

	public mouseUpEvent(event: MouseEventHandlerMouseEvent): void {
		if (this._state === null) {
			return;
		}
		this._onMouseEvent();

		this._longTap = false;

		this._endScroll(event);
	}

	public tapEvent(event: MouseEventHandlerTouchEvent): void {
		if (this._state === null) {
			return;
		}
		this._fireClickedDelegate(event);
	}

	public longTapEvent(event: MouseEventHandlerTouchEvent): void {
		this._longTap = true;

		if (this._startTrackPoint === null) {
			const point: Point = { x: event.localX, y: event.localY };
			this._startTrackingMode(point, point, event);
		}
	}

	public mouseLeaveEvent(event: MouseEventHandlerMouseEvent): void {
		if (this._state === null) {
			return;
		}
		this._onMouseEvent();

		this._state.model().setHoveredSource(null);
		this._clearCrosshairPosition();
	}

	public clicked(): ISubscription<TimePointIndex | null, Point, TouchMouseEventData> {
		return this._clicked;
	}

	public dblClicked(): ISubscription<TimePointIndex | null, Point, TouchMouseEventData> {
		return this._dblClicked;
	}

	public pinchStartEvent(): void {
		this._prevPinchScale = 1;
		this._model().stopTimeScaleAnimation();
	}

	public pinchEvent(middlePoint: Position, scale: number): void {
		if (!this._chart.options()['handleScale'].pinch) {
			return;
		}

		const zoomScale = (scale - this._prevPinchScale) * 5;
		this._prevPinchScale = scale;

		this._model().zoomTime(middlePoint.x as Coordinate, zoomScale);
	}

	public touchStartEvent(event: MouseEventHandlerTouchEvent): void {
		this._longTap = false;
		this._exitTrackingModeOnNextTry = this._startTrackPoint !== null;

		this._mouseTouchDownEvent();

		const crosshair = this._model().crosshairSource();
		if (this._startTrackPoint !== null && crosshair.visible()) {
			this._initCrosshairPosition = { x: crosshair.appliedX(), y: crosshair.appliedY() };
			this._startTrackPoint = { x: event.localX, y: event.localY };
		}
	}

	public touchMoveEvent(event: MouseEventHandlerTouchEvent): void {
		if (this._state === null) {
			return;
		}

		const x = event.localX;
		const y = event.localY;
		if (this._startTrackPoint !== null) {
			// tracking mode: move crosshair
			this._exitTrackingModeOnNextTry = false;
			const origPoint = ensureNotNull(this._initCrosshairPosition);
			const newX = origPoint.x + (x - this._startTrackPoint.x) as Coordinate;
			const newY = origPoint.y + (y - this._startTrackPoint.y) as Coordinate;
			this._setCrosshairPosition(newX, newY, event);
			return;
		}

		this._pressedMouseTouchMoveEvent(event);
	}

	public touchEndEvent(event: MouseEventHandlerTouchEvent): void {
		if (this.chart().options().trackingMode.exitMode === TrackingModeExitMode.OnTouchEnd) {
			this._exitTrackingModeOnNextTry = true;
		}
		this._tryExitTrackingMode();
		this._endScroll(event);
	}

	public hitTest(x: Coordinate, y: Coordinate): HitTestResult | null {
		const state = this._state;
		if (state === null) {
			return null;
		}

		return hitTestPane(state, x, y);
	}

	public setPriceAxisSize(width: number, position: PriceAxisWidgetSide): void {
		const priceAxisWidget = position === 'left' ? this._leftPriceAxisWidget : this._rightPriceAxisWidget;
		ensureNotNull(priceAxisWidget).setSize(size({ width, height: this._size.height }));
	}

	public getSize(): Size {
		return this._size;
	}

	public setSize(newSize: Size): void {
		if (equalSizes(this._size, newSize)) {
			return;
		}

		this._size = newSize;
		this._isSettingSize = true;
		this._canvasBinding.resizeCanvasElement(newSize);
		this._topCanvasBinding.resizeCanvasElement(newSize);
		this._isSettingSize = false;
		this._paneCell.style.width = newSize.width + 'px';
		this._paneCell.style.height = newSize.height + 'px';
	}

	public recalculatePriceScales(): void {
		const pane = ensureNotNull(this._state);
		pane.recalculatePriceScale(pane.leftPriceScale());
		pane.recalculatePriceScale(pane.rightPriceScale());

		for (const source of pane.dataSources()) {
			if (pane.isOverlay(source)) {
				const priceScale = source.priceScale();
				if (priceScale !== null) {
					pane.recalculatePriceScale(priceScale);
				}

				// for overlay drawings price scale is owner's price scale
				// however owner's price scale could not contain ds
				source.updateAllViews();
			}
		}
		for (const primitive of pane.primitives()) {
			primitive.updateAllViews();
		}
	}

	public getBitmapSize(): Size {
		return this._canvasBinding.bitmapSize;
	}

	public drawBitmap(ctx: CanvasRenderingContext2D, x: number, y: number): void {
		const bitmapSize = this.getBitmapSize();
		if (bitmapSize.width > 0 && bitmapSize.height > 0) {
			ctx.drawImage(this._canvasBinding.canvasElement, x, y);
		}
	}

	public paint(type: InvalidationLevel): void {
		if (type === InvalidationLevel.None) {
			return;
		}

		if (this._state === null) {
			return;
		}

		if (type > InvalidationLevel.Cursor) {
			this.recalculatePriceScales();
		}

		if (this._leftPriceAxisWidget !== null) {
			this._leftPriceAxisWidget.paint(type);
		}
		if (this._rightPriceAxisWidget !== null) {
			this._rightPriceAxisWidget.paint(type);
		}

		const canvasOptions: CanvasRenderingContext2DSettings = {
			colorSpace: this._chart.options().layout.colorSpace,
		};

		if (type !== InvalidationLevel.Cursor) {
			this._canvasBinding.applySuggestedBitmapSize();
			const target = tryCreateCanvasRenderingTarget2D(this._canvasBinding, canvasOptions);
			if (target !== null) {
				target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
					this._drawBackground(scope);
				});
				if (this._state) {
					this._drawSources(target, sourceBottomPaneViews);
					this._drawGrid(target);
					this._drawSources(target, sourcePaneViews);
					this._drawSources(target, sourceLabelPaneViews);
				}
				// Draw trendlines
				this._drawTrendlines(target);
				// Draw trendline preview
				this._drawTrendlinePreview(target);
				// Draw fibonacci retracements
				this._drawFibonacciRetracements(target);
			}
		}

		this._topCanvasBinding.applySuggestedBitmapSize();
		const topTarget = tryCreateCanvasRenderingTarget2D(this._topCanvasBinding, canvasOptions);
		if (topTarget !== null) {
			topTarget.useBitmapCoordinateSpace(({ context: ctx, bitmapSize }: BitmapCoordinatesRenderingScope) => {
				ctx.clearRect(0, 0, bitmapSize.width, bitmapSize.height);
			});
			this._drawCrosshair(topTarget);
			this._drawSources(topTarget, sourceTopPaneViews);
			this._drawSources(topTarget, sourceLabelPaneViews);
		}
	}

	private _drawTrendlinePreview(target: CanvasRenderingTarget2D): void {
    const chartWidget = this._chart as any;
    
    console.log('Drawing preview check:', {
        isDrawing: chartWidget._isDrawingTrendline,
        hasStart: !!chartWidget._trendlineStartPoint,
        hasPreview: !!chartWidget._trendlinePreviewEnd
    });
    
    // Only draw preview if we're in trendline drawing mode and have both start and preview end points
    if (!chartWidget._isDrawingTrendline || 
        !chartWidget._trendlineStartPoint || 
        !chartWidget._trendlinePreviewEnd) {
        return;
    }
    
    console.log('Actually drawing preview line');

    const timeScale = this._model().timeScale() as any;
    const priceScale = this._state?.defaultPriceScale() as any;
    const firstValue = priceScale?._internal_firstValue();
    
    if (!priceScale || firstValue === null) {
        return;
    }

    target.useBitmapCoordinateSpace((scope) => {
        const ctx = scope.context;
        
        try {
            // Convert start point coordinates
            const coords1 = this._timeAndPriceToCoordinates(
                chartWidget._trendlineStartPoint.time, 
                chartWidget._trendlineStartPoint.price, 
                timeScale, 
                priceScale, 
                firstValue
            );
            
            // Convert preview end point coordinates
            const coords2 = this._timeAndPriceToCoordinates(
                chartWidget._trendlinePreviewEnd.time, 
                chartWidget._trendlinePreviewEnd.price, 
                timeScale, 
                priceScale, 
                firstValue
            );
            
            if (coords1 === null || coords2 === null) {
                return;
            }
            
            const { x: x1, y: y1 } = coords1;
            const { x: x2, y: y2 } = coords2;
            
            ctx.save();
            ctx.strokeStyle = '#2196F3'; // Blue color for preview
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.6; // Make it semi-transparent
            ctx.setLineDash([5, 5]); // Dashed line for preview
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.restore();
            
        } catch (error) {
            console.error('Error drawing trendline preview:', error);
        }
    });
}

	public leftPriceAxisWidget(): PriceAxisWidget | null {
		return this._leftPriceAxisWidget;
	}

	public rightPriceAxisWidget(): PriceAxisWidget | null {
		return this._rightPriceAxisWidget;
	}

	public drawAdditionalSources(target: CanvasRenderingTarget2D, paneViewsGetter: ViewsGetter<IDataSourcePaneViews>): void {
		this._drawSources(target, paneViewsGetter);
	}

	private _onStateDestroyed(): void {
		if (this._state !== null) {
			this._state.onDestroyed().unsubscribeAll(this);
		}

		this._state = null;
	}

	private _fireClickedDelegate(event: MouseEventHandlerEventBase): void {
		this._fireMouseClickDelegate(this._clicked, event);
	}

	private _fireMouseClickDelegate(delegate: Delegate<TimePointIndex | null, Point, TouchMouseEventData>, event: MouseEventHandlerEventBase): void {
		const x = event.localX;
		const y = event.localY;
		if (delegate.hasListeners()) {
			delegate.fire(this._model().timeScale().coordinateToIndex(x), { x, y }, event);
		}
	}

	private _drawBackground({ context: ctx, bitmapSize }: BitmapCoordinatesRenderingScope): void {
		const { width, height } = bitmapSize;
		const model = this._model();
		const topColor = model.backgroundTopColor();
		const bottomColor = model.backgroundBottomColor();

		if (topColor === bottomColor) {
			clearRect(ctx, 0, 0, width, height, bottomColor);
		} else {
			clearRectWithGradient(ctx, 0, 0, width, height, topColor, bottomColor);
		}
	}

	private _drawGrid(target: CanvasRenderingTarget2D): void {
		const state = ensureNotNull(this._state);
		const paneView = state.grid().paneView();
		const renderer = paneView.renderer(state);

		if (renderer !== null) {
			renderer.draw(target, false);
		}
	}

	private _drawCrosshair(target: CanvasRenderingTarget2D): void {
		this._drawSourceImpl(target, sourcePaneViews, drawForeground, this._model().crosshairSource());
	}

	private _drawSources(target: CanvasRenderingTarget2D, paneViewsGetter: ViewsGetter<IDataSourcePaneViews>): void {
		const state = ensureNotNull(this._state);
		const sources = state.orderedSources();

		const panePrimitives = state.primitives();
		for (const panePrimitive of panePrimitives) {
			this._drawSourceImpl(target, paneViewsGetter, drawBackground, panePrimitive);
		}
		for (const source of sources) {
			this._drawSourceImpl(target, paneViewsGetter, drawBackground, source);
		}

		for (const panePrimitive of panePrimitives) {
			this._drawSourceImpl(target, paneViewsGetter, drawForeground, panePrimitive);
		}
		for (const source of sources) {
			this._drawSourceImpl(target, paneViewsGetter, drawForeground, source);
		}
	}

	private _drawSourceImpl(
		target: CanvasRenderingTarget2D,
		paneViewsGetter: ViewsGetter<IDataSourcePaneViews>,
		drawFn: DrawFunction,
		source: IDataSourcePaneViews
	): void {
		const state = ensureNotNull(this._state);
		const hoveredSource = state.model().hoveredSource();
		const isHovered = hoveredSource !== null && hoveredSource.source === source;
		const objecId = hoveredSource !== null && isHovered && hoveredSource.object !== undefined
			? hoveredSource.object.hitTestData
			: undefined;

		const drawRendererFn = (renderer: IPaneRenderer) => drawFn(renderer, target, isHovered, objecId);
		drawSourceViews(paneViewsGetter, drawRendererFn, source, state);
	}

	private _recreatePriceAxisWidgets(): void {
		if (this._state === null) {
			return;
		}
		const chart = this._chart;
		const leftAxisVisible = this._state.leftPriceScale().options().visible;
		const rightAxisVisible = this._state.rightPriceScale().options().visible;
		if (!leftAxisVisible && this._leftPriceAxisWidget !== null) {
			this._leftAxisCell.removeChild(this._leftPriceAxisWidget.getElement());
			this._leftPriceAxisWidget.destroy();
			this._leftPriceAxisWidget = null;
		}
		if (!rightAxisVisible && this._rightPriceAxisWidget !== null) {
			this._rightAxisCell.removeChild(this._rightPriceAxisWidget.getElement());
			this._rightPriceAxisWidget.destroy();
			this._rightPriceAxisWidget = null;
		}
		const rendererOptionsProvider = chart.model().rendererOptionsProvider();
		if (leftAxisVisible && this._leftPriceAxisWidget === null) {
			this._leftPriceAxisWidget = new PriceAxisWidget(this, chart.options(), rendererOptionsProvider, 'left');
			this._leftAxisCell.appendChild(this._leftPriceAxisWidget.getElement());
		}
		if (rightAxisVisible && this._rightPriceAxisWidget === null) {
			this._rightPriceAxisWidget = new PriceAxisWidget(this, chart.options(), rendererOptionsProvider, 'right');
			this._rightAxisCell.appendChild(this._rightPriceAxisWidget.getElement());
		}
	}

	private _preventScroll(event: TouchMouseEvent): boolean {
		return event.isTouch && this._longTap || this._startTrackPoint !== null;
	}

	private _correctXCoord(x: Coordinate): Coordinate {
		return Math.max(0, Math.min(x, this._size.width - 1)) as Coordinate;
	}

	private _correctYCoord(y: Coordinate): Coordinate {
		return Math.max(0, Math.min(y, this._size.height - 1)) as Coordinate;
	}

	private _setCrosshairPosition(x: Coordinate, y: Coordinate, event: MouseEventHandlerEventBase): void {
    // Check if chart widget is in trendline drawing mode
    const chartWidget = this._chart as any;
    if (chartWidget._isDrawingTrendline) {
        // During trendline drawing, set position without magnet alignment
        const priceScale = ensureNotNull(this._state).defaultPriceScale();
        const firstValue = priceScale.firstValue();
        if (firstValue !== null) {
            const price = priceScale.coordinateToPrice(y, firstValue);
            const timeScale = this._model().timeScale();
            const index = timeScale.coordinateToIndex(x); // Remove the second parameter
            
            // Set crosshair position directly without magnet
            this._model().crosshairSource().setPosition(index, price, ensureNotNull(this._state));
            this._model().cursorUpdate();
            console.log('Set crosshair position without magnet:', x, y, 'price:', price);
        }
        return;
    }
    
    // Normal crosshair positioning (with magnet)
    this._model().setAndSaveCurrentPosition(this._correctXCoord(x), this._correctYCoord(y), event, ensureNotNull(this._state));
}

	private _clearCrosshairPosition(): void {
		this._model().clearCurrentPosition();
	}

	private _tryExitTrackingMode(): void {
		if (this._exitTrackingModeOnNextTry) {
			this._startTrackPoint = null;
			this._clearCrosshairPosition();
		}
	}

	private _startTrackingMode(startTrackPoint: Point, crossHairPosition: Point, event: MouseEventHandlerEventBase): void {
		this._startTrackPoint = startTrackPoint;
		this._exitTrackingModeOnNextTry = false;
		this._setCrosshairPosition(crossHairPosition.x, crossHairPosition.y, event);
		const crosshair = this._model().crosshairSource();
		this._initCrosshairPosition = { x: crosshair.appliedX(), y: crosshair.appliedY() };
	}

	private _model(): IChartModelBase {
		return this._chart.model();
	}

	private _endScroll(event: TouchMouseEvent): void {
		if (!this._isScrolling) {
			return;
		}

		const model = this._model();
		const state = this.state();

		model.endScrollPrice(state, state.defaultPriceScale());

		this._startScrollingPos = null;
		this._isScrolling = false;
		model.endScrollTime();

		if (this._scrollXAnimation !== null) {
			const startAnimationTime = performance.now();
			const timeScale = model.timeScale();

			this._scrollXAnimation.start(timeScale.rightOffset() as Coordinate, startAnimationTime);

			if (!this._scrollXAnimation.finished(startAnimationTime)) {
				model.setTimeScaleAnimation(this._scrollXAnimation);
			}
		}
	}

	private _onMouseEvent(): void {
		this._startTrackPoint = null;
	}

	private _mouseTouchDownEvent(): void {
		if (!this._state) {
			return;
		}

		this._model().stopTimeScaleAnimation();

		if (document.activeElement !== document.body && document.activeElement !== document.documentElement) {
			// If any focusable element except the page itself is focused, remove the focus
			(ensureNotNull(document.activeElement) as HTMLElement).blur();
		} else {
			// Clear selection
			const selection = document.getSelection();
			if (selection !== null) {
				selection.removeAllRanges();
			}
		}

		const priceScale = this._state.defaultPriceScale();

		if (priceScale.isEmpty() || this._model().timeScale().isEmpty()) {
			return;
		}
	}

	// eslint-disable-next-line complexity
	private _pressedMouseTouchMoveEvent(event: TouchMouseEvent): void {
		if (this._state === null) {
			return;
		}

		const model = this._model();
		const timeScale = model.timeScale();

		if (timeScale.isEmpty()) {
			return;
		}

		const chartOptions = this._chart.options();
		const scrollOptions = chartOptions['handleScroll'];
		const kineticScrollOptions = chartOptions.kineticScroll;
		if (
			(!scrollOptions.pressedMouseMove || event.isTouch) &&
			(!scrollOptions.horzTouchDrag && !scrollOptions.vertTouchDrag || !event.isTouch)
		) {
			return;
		}

		const priceScale = this._state.defaultPriceScale();

		const now = performance.now();

		if (this._startScrollingPos === null && !this._preventScroll(event)) {
			this._startScrollingPos = {
				x: event.clientX,
				y: event.clientY,
				timestamp: now,
				localX: event.localX,
				localY: event.localY,
			};
		}

		if (
			this._startScrollingPos !== null &&
			!this._isScrolling &&
			(this._startScrollingPos.x !== event.clientX || this._startScrollingPos.y !== event.clientY)
		) {
			if (event.isTouch && kineticScrollOptions.touch || !event.isTouch && kineticScrollOptions.mouse) {
				const barSpacing = timeScale.barSpacing();
				this._scrollXAnimation = new KineticAnimation(
					KineticScrollConstants.MinScrollSpeed / barSpacing,
					KineticScrollConstants.MaxScrollSpeed / barSpacing,
					KineticScrollConstants.DumpingCoeff,
					KineticScrollConstants.ScrollMinMove / barSpacing
				);
				this._scrollXAnimation.addPosition(timeScale.rightOffset() as Coordinate, this._startScrollingPos.timestamp);
			} else {
				this._scrollXAnimation = null;
			}

			if (!priceScale.isEmpty()) {
				model.startScrollPrice(this._state, priceScale, event.localY);
			}

			model.startScrollTime(event.localX);
			this._isScrolling = true;
		}

		if (this._isScrolling) {
			// this allows scrolling not default price scales
			if (!priceScale.isEmpty()) {
				model.scrollPriceTo(this._state, priceScale, event.localY);
			}

			model.scrollTimeTo(event.localX);
			if (this._scrollXAnimation !== null) {
				this._scrollXAnimation.addPosition(timeScale.rightOffset() as Coordinate, now);
			}
		}
	}

	private readonly _canvasSuggestedBitmapSizeChangedHandler = () => {
		if (this._isSettingSize || this._state === null) {
			return;
		}

		this._model().lightUpdate();
	};

	private readonly _topCanvasSuggestedBitmapSizeChangedHandler = () => {
		if (this._isSettingSize || this._state === null) {
			return;
		}

		this._model().lightUpdate();
	};

	private _drawTrendlines(target: CanvasRenderingTarget2D): void {
    if (this._state === null || this._trendlines.size === 0) {
        return;
    }

    const timeScale = this._model().timeScale() as any;
    const priceScale = this._state.defaultPriceScale() as any;
    const firstValue = priceScale._internal_firstValue();
    
    if (firstValue === null) {
        return;
    }

    this._trendlines.forEach((trendline) => {
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const options = trendline.options();
            const data = trendline.data();
            
            try {
                // Try to convert both points using enhanced coordinate conversion
                const coords1 = this._timeAndPriceToCoordinates(data.point1.time as number, data.point1.value, timeScale, priceScale, firstValue);
                const coords2 = this._timeAndPriceToCoordinates(data.point2.time as number, data.point2.value, timeScale, priceScale, firstValue);
                
                if (coords1 === null || coords2 === null) {
                    console.log('Could not convert coordinates for trendline');
                    return;
                }
                
                const { x: x1, y: y1 } = coords1;
                const { x: x2, y: y2 } = coords2;
                
                ctx.save();
                ctx.strokeStyle = options.color;
                ctx.lineWidth = options.lineWidth;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                ctx.restore();
                
                console.log('Drew trendline from', x1, y1, 'to', x2, y2, 'times:', data.point1.time, data.point2.time);
                
            } catch (error) {
                console.error('Error drawing trendline:', error);
            }
        });
    });
}

private _drawFibonacciRetracements(target: CanvasRenderingTarget2D): void {
    if (this._state === null || this._fibonacciRetracements.size === 0) {
        return;
    }

    const timeScale = this._model().timeScale() as any;
    const priceScale = this._state.defaultPriceScale() as any;
    const firstValue = priceScale._internal_firstValue();
    
    if (firstValue === null) {
        return;
    }

    this._fibonacciRetracements.forEach((fibonacci) => {
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const options = fibonacci.options();
            const data = fibonacci.data();
            
            try {
                // Access the internal properties correctly
                const point1Time = (data as any)._internal_point1._internal_time;
                const point1Value = (data as any)._internal_point1._internal_value;
                const point2Time = (data as any)._internal_point2._internal_time;
                const point2Value = (data as any)._internal_point2._internal_value;
                
                console.log('Using times:', point1Time, point2Time);
                console.log('Using values:', point1Value, point2Value);
                
                // Use the same coordinate conversion as trendlines
                const coords1 = this._timeAndPriceToCoordinates(point1Time, point1Value, timeScale, priceScale, firstValue);
                const coords2 = this._timeAndPriceToCoordinates(point2Time, point2Value, timeScale, priceScale, firstValue);
                
                if (coords1 === null || coords2 === null) {
                    console.log('Could not convert coordinates for fibonacci retracement');
                    return;
                }
                
                // Get the X range for drawing
                const startX = Math.min(coords1.x, coords2.x);
                const endX = Math.max(coords1.x, coords2.x);
                
                // Calculate fibonacci levels manually since the model might not have access to internal data
                const priceRange = Math.abs(point2Value - point1Value);
                const isUptrend = point2Value > point1Value;
                const baseLevelPrice = isUptrend ? point2Value : point1Value;
                const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
                
                ctx.save();
                ctx.strokeStyle = options.color;
                ctx.lineWidth = options.lineWidth;
                ctx.setLineDash([]);
                
                // Draw each fibonacci level as a horizontal line
                levels.forEach((level) => {
                    const retracement = priceRange * level;
                    const levelPrice = isUptrend ? baseLevelPrice - retracement : baseLevelPrice + retracement;
                    const priceY = priceScale._internal_priceToCoordinate(levelPrice, firstValue);
                    
                    if (priceY !== null) {
                        // Draw horizontal line
                        ctx.beginPath();
                        ctx.moveTo(startX, priceY);
                        ctx.lineTo(endX, priceY);
                        ctx.stroke();
                        
                        // Draw label if enabled
                        if (options.showLabels) {
                            ctx.fillStyle = options.color;
                            ctx.font = '12px Arial';
                            ctx.textAlign = 'left';
                            const percentage = `${(level * 100).toFixed(1)}%`;
                            ctx.fillText(percentage, endX + 5, priceY + 4);
                        }
                    }
                });
                
                ctx.restore();
                
                console.log('Drew fibonacci retracement with', levels.length, 'levels from', startX, 'to', endX);
                
            } catch (error) {
                console.error('Error drawing fibonacci retracement:', error);
                //console.error('Error details:', error.stack);
            }
        });
    });
}

private _timeAndPriceToCoordinates(
    targetTime: number, 
    targetPrice: number, 
    timeScale: any, 
    priceScale: any, 
    firstValue: any
): { x: number; y: number } | null {
    
    // Check if this time is beyond our data range by comparing to base time
    const baseIndex = timeScale._internal_baseIndex();
    const baseTime = timeScale._internal_indexToTimeScalePoint(baseIndex)?.originalTime;
    
    if (baseTime !== undefined && targetTime > (baseTime as number)) {
        // This is definitely an extrapolated time - force manual calculation
        console.log('Forcing extrapolation for time beyond data:', targetTime, 'vs base:', baseTime);
        return this._forceExtrapolateCoordinate(targetTime, targetPrice, timeScale, priceScale, firstValue);
    }
    
    // Try normal coordinate conversion for times within data range
    const index = timeScale._internal_timeToIndex(targetTime, true);
    
    if (index !== null) {
        // Normal case: time exists in data
        const x = timeScale._internal_indexToCoordinate(index);
        const y = priceScale._internal_priceToCoordinate(targetPrice, firstValue);
        
        if (x !== null && y !== null) {
            console.log('Using normal coordinate conversion for time:', targetTime);
            return { x, y };
        }
    }
    
    // Fallback to extrapolation
    console.log('Falling back to extrapolation for time:', targetTime);
    return this._forceExtrapolateCoordinate(targetTime, targetPrice, timeScale, priceScale, firstValue);
}

private _forceExtrapolateCoordinate(
    targetTime: number, 
    targetPrice: number, 
    timeScale: any, 
    priceScale: any, 
    firstValue: any
): { x: number; y: number } | null {
    
    // Get reference points from actual data
    const baseIndex = timeScale._internal_baseIndex();
    const prevIndex = baseIndex - 1;
    
    const baseTime = timeScale._internal_indexToTimeScalePoint(baseIndex)?.originalTime;
    const baseCoord = timeScale._internal_indexToCoordinate(baseIndex);
    const prevTime = timeScale._internal_indexToTimeScalePoint(prevIndex)?.originalTime;
    const prevCoord = timeScale._internal_indexToCoordinate(prevIndex);
    
    if (baseTime !== undefined && baseCoord !== null && 
        prevTime !== undefined && prevCoord !== null) {
        
        // Calculate time to coordinate conversion using the same logic as chart-widget
        const timeInterval = (baseTime as number) - (prevTime as number);
        const coordInterval = baseCoord - prevCoord;
        
        if (coordInterval !== 0) {
            const timePerPixel = timeInterval / coordInterval;
            const timeBeyondBase = targetTime - (baseTime as number);
            const pixelsBeyondBase = timeBeyondBase / timePerPixel;
            const x = baseCoord + pixelsBeyondBase;
            
            // Price coordinate should always work
            const y = priceScale._internal_priceToCoordinate(targetPrice, firstValue);
            
            if (y !== null) {
                console.log('Extrapolated coordinates successfully:', {
                    targetTime,
                    baseTime,
                    baseCoord,
                    timeInterval,
                    coordInterval,
                    timePerPixel,
                    timeBeyondBase,
                    pixelsBeyondBase,
                    x,
                    y
                });
                
                return { x, y };
            }
        }
    }
    
    console.log('Could not extrapolate coordinates');
    return null;
}

}
