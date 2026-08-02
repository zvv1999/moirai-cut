import type { Effect } from "@/effects/types";
import type { ParamValue, ParamValues } from "@/params";

export interface EffectPresetEntry {
	type: string;
	enabled: boolean;
	params: ParamValues;
}

export interface EffectPreset {
	id: string;
	name: string;
	folder: string;
	effects: EffectPresetEntry[];
}

function cloneParams(params: ParamValues): ParamValues {
	return { ...params };
}

export function createEffectPreset({
	id,
	name,
	folder,
	effects,
}: EffectPreset): EffectPreset {
	return {
		id,
		name: name.trim() || "Untitled preset",
		folder: folder.trim() || "Unsorted",
		effects: effects.map((effect) => ({
			...effect,
			params: cloneParams(effect.params),
		})),
	};
}

export function duplicateEffectPreset({
	preset,
	id,
	name,
}: {
	preset: EffectPreset;
	id: string;
	name?: string;
}): EffectPreset {
	return createEffectPreset({
		...preset,
		id,
		name: name ?? `${preset.name} copy`,
	});
}

export function applyEffectPreset({
	existing,
	preset,
	mode,
	idFactory,
}: {
	existing: Effect[];
	preset: EffectPreset;
	mode: "append" | "replace";
	idFactory: () => string;
}): Effect[] {
	const added = preset.effects.map((effect) => ({
		id: idFactory(),
		type: effect.type,
		enabled: effect.enabled,
		params: cloneParams(effect.params),
	}));
	return mode === "replace" ? added : [...existing, ...added];
}

export function exportEffectPresets({
	presets,
}: {
	presets: EffectPreset[];
}): string {
	return JSON.stringify({ version: 1, presets }, null, 2);
}

function isParamValue(value: unknown): value is ParamValue {
	return (
		typeof value === "number" ||
		typeof value === "string" ||
		typeof value === "boolean"
	);
}

function parseParams(value: unknown): ParamValues | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const params: ParamValues = {};
	for (const [key, item] of Object.entries(value)) {
		if (!isParamValue(item)) return null;
		params[key] = item;
	}
	return params;
}

function parsePreset(value: unknown): EffectPreset | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const id = Reflect.get(value, "id");
	const name = Reflect.get(value, "name");
	const folder = Reflect.get(value, "folder");
	const effects = Reflect.get(value, "effects");
	if (
		typeof id !== "string" ||
		typeof name !== "string" ||
		typeof folder !== "string" ||
		!Array.isArray(effects)
	) {
		return null;
	}
	const parsedEffects: EffectPresetEntry[] = [];
	for (const effect of effects) {
		if (!effect || typeof effect !== "object" || Array.isArray(effect))
			return null;
		const type = Reflect.get(effect, "type");
		const enabled = Reflect.get(effect, "enabled");
		const params = parseParams(Reflect.get(effect, "params"));
		if (typeof type !== "string" || typeof enabled !== "boolean" || !params) {
			return null;
		}
		parsedEffects.push({ type, enabled, params });
	}
	return createEffectPreset({ id, name, folder, effects: parsedEffects });
}

export function importEffectPresets({
	source,
}: {
	source: string;
}): EffectPreset[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		throw new Error("Effect preset file is not valid JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Effect preset file must be an object");
	}
	if (Reflect.get(parsed, "version") !== 1) {
		throw new Error("Unsupported effect preset version");
	}
	const presets = Reflect.get(parsed, "presets");
	if (!Array.isArray(presets)) {
		throw new Error("Effect preset file has no presets array");
	}
	return presets.map((preset) => {
		const valid = parsePreset(preset);
		if (!valid)
			throw new Error("Effect preset file contains an invalid preset");
		return valid;
	});
}
