export function createCanvasSurface({
	width,
	height,
}: {
	width: number;
	height: number;
}): {
	canvas: OffscreenCanvas;
	context: OffscreenCanvasRenderingContext2D;
} {
	const canvas = new OffscreenCanvas(width, height);
	// OneCut's compositing working space is explicitly SDR sRGB. Wide-gamut or
	// HDR sources are converted before they reach this canvas (native proxies
	// tone-map PQ/HLG to tagged BT.709); authored colours are linearized by the
	// parameter layer and presented through this sRGB surface.
	const context = canvas.getContext("2d", { colorSpace: "srgb" });
	if (!context) {
		throw new Error("Failed to create 2D rendering context");
	}
	return { canvas, context };
}
