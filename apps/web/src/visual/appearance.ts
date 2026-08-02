import type { ParamValues } from "@/params";
import { clamp } from "@/utils/math";

export interface VisualAppearance {
	crop: { left: number; right: number; top: number; bottom: number };
	mirrorX: boolean;
	mirrorY: boolean;
	cornerRadius: number;
	shadow: {
		enabled: boolean;
		blur: number;
		offsetX: number;
		offsetY: number;
		color: string;
	};
	stroke: { width: number; color: string };
}

export interface VisualColorGrade {
	exposure: number;
	contrast: number;
	temperature: number;
	saturation: number;
	highlights: number;
	shadows: number;
	curve: number;
}

export interface CubeLut {
	title: string;
	size: number;
	domainMin: [number, number, number];
	domainMax: [number, number, number];
	values: Array<[number, number, number]>;
}

const DEFAULT_APPEARANCE: VisualAppearance = {
	crop: { left: 0, right: 0, top: 0, bottom: 0 },
	mirrorX: false,
	mirrorY: false,
	cornerRadius: 0,
	shadow: {
		enabled: false,
		blur: 0,
		offsetX: 0,
		offsetY: 8,
		color: "#00000080",
	},
	stroke: { width: 0, color: "#ffffff" },
};

function numberParam({
	params,
	key,
	fallback,
	min,
	max,
}: {
	params: ParamValues;
	key: string;
	fallback: number;
	min: number;
	max: number;
}): number {
	const value = params[key];
	return clamp({
		value: typeof value === "number" && Number.isFinite(value) ? value : fallback,
		min,
		max,
	});
}

function booleanParam({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: boolean;
}): boolean {
	const value = params[key];
	return typeof value === "boolean" ? value : fallback;
}

function colorParam({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: string;
}): string {
	const value = params[key];
	return typeof value === "string" && value.trim() ? value : fallback;
}

export function normalizeVisualAppearance(
	params: ParamValues,
): VisualAppearance {
	return {
		crop: {
			left: numberParam({
				params,
				key: "crop.left",
				fallback: DEFAULT_APPEARANCE.crop.left,
				min: 0,
				max: 49.5,
			}),
			right: numberParam({
				params,
				key: "crop.right",
				fallback: DEFAULT_APPEARANCE.crop.right,
				min: 0,
				max: 49.5,
			}),
			top: numberParam({
				params,
				key: "crop.top",
				fallback: DEFAULT_APPEARANCE.crop.top,
				min: 0,
				max: 49.5,
			}),
			bottom: numberParam({
				params,
				key: "crop.bottom",
				fallback: DEFAULT_APPEARANCE.crop.bottom,
				min: 0,
				max: 49.5,
			}),
		},
		mirrorX: booleanParam({
			params,
			key: "geometry.mirrorX",
			fallback: DEFAULT_APPEARANCE.mirrorX,
		}),
		mirrorY: booleanParam({
			params,
			key: "geometry.mirrorY",
			fallback: DEFAULT_APPEARANCE.mirrorY,
		}),
		cornerRadius: numberParam({
			params,
			key: "geometry.cornerRadius",
			fallback: DEFAULT_APPEARANCE.cornerRadius,
			min: 0,
			max: 50,
		}),
		shadow: {
			enabled: booleanParam({
				params,
				key: "geometry.shadow.enabled",
				fallback: DEFAULT_APPEARANCE.shadow.enabled,
			}),
			blur: numberParam({
				params,
				key: "geometry.shadow.blur",
				fallback: DEFAULT_APPEARANCE.shadow.blur,
				min: 0,
				max: 200,
			}),
			offsetX: numberParam({
				params,
				key: "geometry.shadow.offsetX",
				fallback: DEFAULT_APPEARANCE.shadow.offsetX,
				min: -500,
				max: 500,
			}),
			offsetY: numberParam({
				params,
				key: "geometry.shadow.offsetY",
				fallback: DEFAULT_APPEARANCE.shadow.offsetY,
				min: -500,
				max: 500,
			}),
			color: colorParam({
				params,
				key: "geometry.shadow.color",
				fallback: DEFAULT_APPEARANCE.shadow.color,
			}),
		},
		stroke: {
			width: numberParam({
				params,
				key: "geometry.stroke.width",
				fallback: DEFAULT_APPEARANCE.stroke.width,
				min: 0,
				max: 200,
			}),
			color: colorParam({
				params,
				key: "geometry.stroke.color",
				fallback: DEFAULT_APPEARANCE.stroke.color,
			}),
		},
	};
}

function formatFilterNumber(value: number): string {
	return String(Number(value.toFixed(4)));
}

export function buildVisualCssFilter({
	exposure,
	contrast,
	temperature,
	saturation,
	highlights,
	shadows,
	curve,
}: VisualColorGrade): string {
	const brightness = clamp({
		value:
			2 ** clamp({ value: exposure, min: -3, max: 3 }) -
			clamp({ value: highlights, min: -100, max: 100 }) / 400 +
			clamp({ value: shadows, min: -100, max: 100 }) / 800,
		min: 0.05,
		max: 8,
	});
	const contrastValue = clamp({
		value:
			1 +
			clamp({ value: contrast, min: -100, max: 100 }) / 100 +
			clamp({ value: curve, min: -100, max: 100 }) / 400,
		min: 0,
		max: 3,
	});
	const saturationValue = clamp({
		value: 1 + clamp({ value: saturation, min: -100, max: 200 }) / 100,
		min: 0,
		max: 3,
	});
	const normalizedTemperature = clamp({
		value: temperature,
		min: -100,
		max: 100,
	});
	const sepia = Math.abs(normalizedTemperature) / 250;
	const hue = normalizedTemperature * 0.12;

	return [
		`brightness(${formatFilterNumber(brightness)})`,
		`contrast(${formatFilterNumber(contrastValue)})`,
		`saturate(${formatFilterNumber(saturationValue)})`,
		`sepia(${formatFilterNumber(sepia)})`,
		`hue-rotate(${formatFilterNumber(hue)}deg)`,
	].join(" ");
}

function parseTriplet({
	line,
	label,
}: {
	line: string;
	label: string;
}): [number, number, number] {
	const values = line
		.trim()
		.split(/\s+/)
		.slice(1)
		.map(Number);
	if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
		throw new Error(`Invalid ${label} declaration`);
	}
	const first = values[0];
	const second = values[1];
	const third = values[2];
	if (first === undefined || second === undefined || third === undefined) {
		throw new Error(`Invalid ${label} declaration`);
	}
	return [first, second, third];
}

export function parseCubeLut({ source }: { source: string }): CubeLut {
	let title = "Imported LUT";
	let size = 0;
	let domainMin: [number, number, number] = [0, 0, 0];
	let domainMax: [number, number, number] = [1, 1, 1];
	const values: Array<[number, number, number]> = [];

	for (const rawLine of source.replace(/\r\n?/g, "\n").split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		if (line.startsWith("TITLE ")) {
			title = line.slice(6).trim().replace(/^"|"$/g, "") || title;
			continue;
		}
		if (line.startsWith("LUT_3D_SIZE ")) {
			size = Number(line.slice(12).trim());
			continue;
		}
		if (line.startsWith("DOMAIN_MIN ")) {
			domainMin = parseTriplet({ line, label: "DOMAIN_MIN" });
			continue;
		}
		if (line.startsWith("DOMAIN_MAX ")) {
			domainMax = parseTriplet({ line, label: "DOMAIN_MAX" });
			continue;
		}
		const triplet = line.split(/\s+/).map(Number);
		if (triplet.length !== 3 || triplet.some((value) => !Number.isFinite(value))) {
			throw new Error(`Unsupported .cube line: ${line}`);
		}
		const red = triplet[0];
		const green = triplet[1];
		const blue = triplet[2];
		if (red === undefined || green === undefined || blue === undefined) {
			throw new Error(`Unsupported .cube line: ${line}`);
		}
		values.push([
			clamp({ value: red, min: 0, max: 1 }),
			clamp({ value: green, min: 0, max: 1 }),
			clamp({ value: blue, min: 0, max: 1 }),
		]);
	}

	if (!Number.isInteger(size) || size < 2 || size > 64) {
		throw new Error("LUT_3D_SIZE must be an integer between 2 and 64");
	}
	if (values.length !== size ** 3) {
		throw new Error(
			`Expected ${size ** 3} LUT entries but found ${values.length}`,
		);
	}
	return { title, size, domainMin, domainMax, values };
}

function lutValue({
	lut,
	r,
	g,
	b,
}: {
	lut: CubeLut;
	r: number;
	g: number;
	b: number;
}): [number, number, number] {
	return lut.values[r + g * lut.size + b * lut.size * lut.size];
}

function mix({
	a,
	b,
	amount,
}: {
	a: number;
	b: number;
	amount: number;
}): number {
	return a + (b - a) * amount;
}

export function sampleCubeLut({
	lut,
	color,
}: {
	lut: CubeLut;
	color: [number, number, number];
}): [number, number, number] {
	const normalized = color.map((component, index) => {
		const min = lut.domainMin[index];
		const max = lut.domainMax[index];
		return clamp({
			value: max === min ? 0 : (component - min) / (max - min),
			min: 0,
			max: 1,
		});
	});
	const scaled = normalized.map((component) => component * (lut.size - 1));
	const lower = scaled.map(Math.floor);
	const upper = scaled.map((component) => Math.min(lut.size - 1, Math.ceil(component)));
	const fraction = scaled.map((component, index) => component - lower[index]);
	const output: [number, number, number] = [0, 0, 0];

	for (let channel = 0; channel < 3; channel++) {
		const c000 = lutValue({
			lut,
			r: lower[0],
			g: lower[1],
			b: lower[2],
		})[channel];
		const c100 = lutValue({
			lut,
			r: upper[0],
			g: lower[1],
			b: lower[2],
		})[channel];
		const c010 = lutValue({
			lut,
			r: lower[0],
			g: upper[1],
			b: lower[2],
		})[channel];
		const c110 = lutValue({
			lut,
			r: upper[0],
			g: upper[1],
			b: lower[2],
		})[channel];
		const c001 = lutValue({
			lut,
			r: lower[0],
			g: lower[1],
			b: upper[2],
		})[channel];
		const c101 = lutValue({
			lut,
			r: upper[0],
			g: lower[1],
			b: upper[2],
		})[channel];
		const c011 = lutValue({
			lut,
			r: lower[0],
			g: upper[1],
			b: upper[2],
		})[channel];
		const c111 = lutValue({
			lut,
			r: upper[0],
			g: upper[1],
			b: upper[2],
		})[channel];
		const x00 = mix({ a: c000, b: c100, amount: fraction[0] });
		const x10 = mix({ a: c010, b: c110, amount: fraction[0] });
		const x01 = mix({ a: c001, b: c101, amount: fraction[0] });
		const x11 = mix({ a: c011, b: c111, amount: fraction[0] });
		output[channel] = mix({
			a: mix({ a: x00, b: x10, amount: fraction[1] }),
			b: mix({ a: x01, b: x11, amount: fraction[1] }),
			amount: fraction[2],
		});
	}
	return output;
}
