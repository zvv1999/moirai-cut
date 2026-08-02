function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function parseHexColor(color: string): [number, number, number] {
	const normalized = color.trim().replace(/^#/, "");
	if (!/^[0-9a-f]{6}$/i.test(normalized)) {
		throw new Error("Key color must be a six-digit hex color");
	}
	return [
		Number.parseInt(normalized.slice(0, 2), 16),
		Number.parseInt(normalized.slice(2, 4), 16),
		Number.parseInt(normalized.slice(4, 6), 16),
	];
}

function alphaFromDistance({
	distance,
	threshold,
	softness,
}: {
	distance: number;
	threshold: number;
	softness: number;
}): number {
	const safeSoftness = Math.max(0.0001, softness);
	return clamp01((distance - threshold) / safeSoftness);
}

export function applyChromaKey({
	pixels,
	keyColor,
	similarity,
	softness,
	spill,
}: {
	pixels: Uint8ClampedArray;
	keyColor: string;
	similarity: number;
	softness: number;
	spill: number;
}): Uint8ClampedArray {
	const output = new Uint8ClampedArray(pixels);
	const [keyRed, keyGreen, keyBlue] = parseHexColor(keyColor);
	const threshold = clamp01(similarity);
	const edge = clamp01(softness);
	const spillStrength = clamp01(spill);

	for (let index = 0; index < output.length; index += 4) {
		const red = output[index] ?? 0;
		const green = output[index + 1] ?? 0;
		const blue = output[index + 2] ?? 0;
		const distance =
			Math.hypot(red - keyRed, green - keyGreen, blue - keyBlue) /
			Math.sqrt(3 * 255 ** 2);
		const alpha = alphaFromDistance({
			distance,
			threshold,
			softness: edge,
		});
		output[index + 3] = Math.round((output[index + 3] ?? 255) * alpha);
		if (alpha === 0) {
			output[index] = 0;
			output[index + 1] = 0;
			output[index + 2] = 0;
			continue;
		}
		const excessGreen = Math.max(0, green - Math.max(red, blue));
		output[index + 1] = Math.round(green - excessGreen * spillStrength);
	}
	return output;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function applyBackgroundRemoval({
	pixels,
	width,
	height,
	threshold,
	softness,
}: {
	pixels: Uint8ClampedArray;
	width: number;
	height: number;
	threshold: number;
	softness: number;
}): Uint8ClampedArray {
	if (pixels.length !== width * height * 4 || width <= 0 || height <= 0) {
		throw new Error("Background-removal pixels do not match their dimensions");
	}
	const cornerIndexes = [
		0,
		(width - 1) * 4,
		width * (height - 1) * 4,
		(width * height - 1) * 4,
	];
	const background: [number, number, number] = [
		median(cornerIndexes.map((index) => pixels[index] ?? 0)),
		median(cornerIndexes.map((index) => pixels[index + 1] ?? 0)),
		median(cornerIndexes.map((index) => pixels[index + 2] ?? 0)),
	];
	const output = new Uint8ClampedArray(pixels);

	for (let index = 0; index < output.length; index += 4) {
		const distance =
			Math.hypot(
				(output[index] ?? 0) - background[0],
				(output[index + 1] ?? 0) - background[1],
				(output[index + 2] ?? 0) - background[2],
			) / Math.sqrt(3 * 255 ** 2);
		const alpha = alphaFromDistance({
			distance,
			threshold: clamp01(threshold),
			softness: clamp01(softness),
		});
		output[index + 3] = Math.round((output[index + 3] ?? 255) * alpha);
	}
	return output;
}

export function resolveStabilizedPosition({
	position,
	offset,
	canvasSize,
	strength,
}: {
	position: { x: number; y: number };
	offset: { x: number; y: number; confidence: number };
	canvasSize: { width: number; height: number };
	strength: number;
}): { x: number; y: number } {
	const amount = clamp01(strength / 100);
	return {
		x: position.x - offset.x * canvasSize.width * amount,
		y: position.y - offset.y * canvasSize.height * amount,
	};
}
