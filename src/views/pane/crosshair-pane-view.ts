import { Crosshair, CrosshairMode } from '../../model/crosshair';
import { Pane } from '../../model/pane';
import { CrosshairRenderer, CrosshairRendererData } from '../../renderers/crosshair-renderer';
import { IPaneRenderer } from '../../renderers/ipane-renderer';

import { IPaneView } from './ipane-view';

export class CrosshairPaneView implements IPaneView {
	private _invalidated: boolean = true;
	private readonly _pane: Pane;
	private readonly _source: Crosshair;
	private readonly _rendererData: CrosshairRendererData = {
		vertLine: {
			lineWidth: 1,
			lineStyle: 0,
			color: '',
			visible: false,
		},
		horzLine: {
			lineWidth: 1,
			lineStyle: 0,
			color: '',
			visible: false,
		},
		x: 0,
		y: 0,
		showCenterDot: false,
		centerDotColor: '#2196F3',
		centerDotRadius: 3,
	};
	private _renderer: CrosshairRenderer = new CrosshairRenderer(this._rendererData);

	public constructor(source: Crosshair, pane: Pane) {
		this._source = source;
		this._pane = pane;
		console.log('CrosshairPaneView: Constructor called for pane');
	}

	public update(): void {
		this._invalidated = true;
	}

	public renderer(pane: Pane): IPaneRenderer {
		if (this._invalidated) {
			this._updateImpl();
			this._invalidated = false;
		}

		return this._renderer;
	}

	private _updateImpl(): void {
		const visible = this._source.visible();
		const crosshairOptions = this._pane.model().options().crosshair;
		const model = this._pane.model();

		console.log('Crosshair view: isInDrawingMode =', this._source.isDrawingMode(), 'visible =', visible);

		const data = this._rendererData;

		if (crosshairOptions.mode === CrosshairMode.Hidden) {
			data.horzLine.visible = false;
			data.vertLine.visible = false;
			data.showCenterDot = false;
			return;
		}

		// Check if we're in trendline drawing mode from the model
		const isDrawingTrendline = model.isDrawingTrendline();
		const isInDrawingMode = this._source.isDrawingMode() || isDrawingTrendline;
		
		console.log('Crosshair view: model.isDrawingTrendline() =', isDrawingTrendline);
		console.log('Crosshair view: combined isInDrawingMode =', isInDrawingMode);

		if (isInDrawingMode) {
			// Drawing mode: hide lines, show dot only
			data.horzLine.visible = false;
			data.vertLine.visible = false;
			data.showCenterDot = true;
			
			const dotOptions = this._source.centerDotOptions();
			data.centerDotColor = dotOptions.color;
			data.centerDotRadius = dotOptions.radius;
			
			data.x = this._source.appliedX();
			data.y = this._source.appliedY();
			
			console.log('Crosshair view: DRAWING MODE - showing dot only at', data.x, data.y);
			console.log('Crosshair view: dot color =', data.centerDotColor, 'radius =', data.centerDotRadius);
			return;
		}

		// Normal crosshair behavior
		data.horzLine.visible = visible && this._source.horzLineVisible(this._pane);
		data.vertLine.visible = visible && this._source.vertLineVisible();

		data.horzLine.lineWidth = crosshairOptions.horzLine.width;
		data.horzLine.lineStyle = crosshairOptions.horzLine.style;
		data.horzLine.color = crosshairOptions.horzLine.color;

		data.vertLine.lineWidth = crosshairOptions.vertLine.width;
		data.vertLine.lineStyle = crosshairOptions.vertLine.style;
		data.vertLine.color = crosshairOptions.vertLine.color;

		data.x = this._source.appliedX();
		data.y = this._source.appliedY();

		// Normal mode: don't show center dot
		data.showCenterDot = false;
		
		console.log('Crosshair view: NORMAL mode, lines visible:', data.horzLine.visible, data.vertLine.visible, 'dot visible:', data.showCenterDot);
	}
}