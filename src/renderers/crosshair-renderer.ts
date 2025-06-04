import { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { BitmapCoordinatesPaneRenderer } from './bitmap-coordinates-pane-renderer';
import { drawHorizontalLine, drawVerticalLine, LineStyle, LineWidth, setLineStyle } from './draw-line';

export interface CrosshairLineStyle {
	lineStyle: LineStyle;
	lineWidth: LineWidth;
	color: string;
	visible: boolean;
}

export interface CrosshairRendererData {
	vertLine: CrosshairLineStyle;
	horzLine: CrosshairLineStyle;
	x: number;
	y: number;
	showCenterDot?: boolean;
	centerDotColor?: string;
	centerDotRadius?: number;
}

export class CrosshairRenderer extends BitmapCoordinatesPaneRenderer {
	private readonly _data: CrosshairRendererData | null;

	public constructor(data: CrosshairRendererData | null) {
		super();
		this._data = data;
	}

	protected override _drawImpl({ context: ctx, bitmapSize, horizontalPixelRatio, verticalPixelRatio }: BitmapCoordinatesRenderingScope): void {
		if (this._data === null) {
			return;
		}

		const vertLinesVisible = this._data.vertLine.visible;
		const horzLinesVisible = this._data.horzLine.visible;

		if (!vertLinesVisible && !horzLinesVisible && !this._data.showCenterDot) {
			return;
		}

		const x = Math.round(this._data.x * horizontalPixelRatio);
		const y = Math.round(this._data.y * verticalPixelRatio);

		ctx.lineCap = 'butt';

		if (vertLinesVisible && x >= 0) {
			ctx.lineWidth = Math.floor(this._data.vertLine.lineWidth * horizontalPixelRatio);
			ctx.strokeStyle = this._data.vertLine.color;
			ctx.fillStyle = this._data.vertLine.color;
			setLineStyle(ctx, this._data.vertLine.lineStyle);
			drawVerticalLine(ctx, x, 0, bitmapSize.height);
		}

		if (horzLinesVisible && y >= 0) {
			ctx.lineWidth = Math.floor(this._data.horzLine.lineWidth * verticalPixelRatio);
			ctx.strokeStyle = this._data.horzLine.color;
			ctx.fillStyle = this._data.horzLine.color;
			setLineStyle(ctx, this._data.horzLine.lineStyle);
			drawHorizontalLine(ctx, y, 0, bitmapSize.width);
		}

		// Draw center dot if enabled
		if (this._data.showCenterDot && x >= 0 && y >= 0) {
			const dotRadius = (this._data.centerDotRadius || 3) * Math.min(horizontalPixelRatio, verticalPixelRatio);
			const dotColor = this._data.centerDotColor || this._data.vertLine.color || '#2196F3';
			
			ctx.fillStyle = dotColor;
			ctx.beginPath();
			ctx.arc(x, y, dotRadius, 0, 2 * Math.PI);
			ctx.fill();
		}
	}
}