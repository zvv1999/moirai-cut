import type { CanvasEffectTreatment } from "@/effects/types";
import {
	parseCubeLut,
	sampleCubeLut,
	type CubeLut,
	type VisualAppearance,
} from "@/visual/appearance";

type TextCanvasContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

const lutCache = new Map<string, CubeLut | null>();

function getLut({ source }: { source: string }): CubeLut | null {
	if (lutCache.has(source)) return lutCache.get(source) ?? null;
	try {
		const parsed = parseCubeLut({ source });
		lutCache.set(source, parsed);
		return parsed;
	} catch {
		lutCache.set(source, null);
		return null;
	}
}

function applyLut({
	ctx,
	width,
	height,
	effects,
}: {
	ctx: TextCanvasContext;
	width: number;
	height: number;
	effects: CanvasEffectTreatment[];
}): void {
	const treatments = effects.flatMap((effect) => {
		if (!effect.lutSource) return [];
		const lut = getLut({ source: effect.lutSource });
		if (!lut) return [];
		return [
			{
				lut,
				strength: Math.min(
					1,
					Math.max(0, (effect.lutStrength ?? 100) / 100),
				),
			},
		];
	});
	if (treatments.length === 0 || width <= 0 || height <= 0) return;

	const pixels = ctx.getImageData(0, 0, width, height);
	for (const treatment of treatments) {
		for (let index = 0; index < pixels.data.length; index += 4) {
			if (pixels.data[index + 3] === 0) continue;
			const input: [number, number, number] = [
				pixels.data[index] / 255,
				pixels.data[index + 1] / 255,
				pixels.data[index + 2] / 255,
			];
			const graded = sampleCubeLut({ lut: treatment.lut, color: input });
			pixels.data[index] = Math.round(
				(input[0] + (graded[0] - input[0]) * treatment.strength) * 255,
			);
			pixels.data[index + 1] = Math.round(
				(input[1] + (graded[1] - input[1]) * treatment.strength) * 255,
			);
			pixels.data[index + 2] = Math.round(
				(input[2] + (graded[2] - input[2]) * treatment.strength) * 255,
			);
		}
	}
	ctx.putImageData(pixels, 0, 0);
}

export function hasVisualDecoration({
	appearance,
}: {
	appearance: VisualAppearance;
}): boolean {
	return (
		appearance.crop.left > 0 ||
		appearance.crop.right > 0 ||
		appearance.crop.top > 0 ||
		appearance.crop.bottom > 0 ||
		appearance.cornerRadius > 0 ||
		appearance.shadow.enabled ||
		appearance.stroke.width > 0
	);
}

function buildCropRect({
	appearance,
	width,
	height,
}: {
	appearance: VisualAppearance;
	width: number;
	height: number;
}) {
	const left = (appearance.crop.left / 100) * width;
	const right = (appearance.crop.right / 100) * width;
	const top = (appearance.crop.top / 100) * height;
	const bottom = (appearance.crop.bottom / 100) * height;
	return {
		x: left,
		y: top,
		width: Math.max(1, width - left - right),
		height: Math.max(1, height - top - bottom),
	};
}

function roundedRectPath({
	ctx,
	rect,
	radius,
}: {
	ctx: TextCanvasContext;
	rect: { x: number; y: number; width: number; height: number };
	radius: number;
}) {
	ctx.beginPath();
	ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
}

export function drawStyledVisualSource({
	ctx,
	source,
	width,
	height,
	appearance,
	canvasEffects,
}: {
	ctx: TextCanvasContext;
	source: CanvasImageSource;
	width: number;
	height: number;
	appearance: VisualAppearance;
	canvasEffects: CanvasEffectTreatment[];
}): void {
	const rect = buildCropRect({ appearance, width, height });
	const radius =
		(Math.min(rect.width, rect.height) / 2) *
		(appearance.cornerRadius / 50);

	ctx.save();
	if (appearance.shadow.enabled) {
		ctx.save();
		ctx.shadowBlur = appearance.shadow.blur;
		ctx.shadowOffsetX = appearance.shadow.offsetX;
		ctx.shadowOffsetY = appearance.shadow.offsetY;
		ctx.shadowColor = appearance.shadow.color;
		ctx.fillStyle = "#00000001";
		roundedRectPath({ ctx, rect, radius });
		ctx.fill();
		ctx.restore();
	}

	roundedRectPath({ ctx, rect, radius });
	ctx.clip();
	ctx.filter = canvasEffects.map((effect) => effect.filter).join(" ") || "none";
	ctx.drawImage(source, 0, 0, width, height);
	ctx.restore();

	applyLut({ ctx, width, height, effects: canvasEffects });

	if (appearance.stroke.width > 0) {
		ctx.save();
		ctx.strokeStyle = appearance.stroke.color;
		ctx.lineWidth = appearance.stroke.width;
		roundedRectPath({ ctx, rect, radius });
		ctx.stroke();
		ctx.restore();
	}
}

export function drawCanvasEffectSource({
	ctx,
	source,
	width,
	height,
	canvasEffects,
}: {
	ctx: TextCanvasContext;
	source: CanvasImageSource;
	width: number;
	height: number;
	canvasEffects: CanvasEffectTreatment[];
}): void {
	ctx.save();
	ctx.filter = canvasEffects.map((effect) => effect.filter).join(" ") || "none";
	ctx.drawImage(source, 0, 0, width, height);
	ctx.restore();
	applyLut({ ctx, width, height, effects: canvasEffects });
}
