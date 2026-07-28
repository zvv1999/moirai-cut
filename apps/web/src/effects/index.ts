import { generateUUID } from "@/utils/id";
import { buildDefaultParamValues } from "@/params/registry";
import { effectsRegistry } from "./registry";
import type { ParamValues } from "@/params";
import type {
	CanvasEffectTreatment,
	Effect,
	EffectDefinition,
	EffectPass,
} from "@/effects/types";
import { VISUAL_ELEMENT_TYPES } from "@/timeline";

export { effectsRegistry } from "./registry";
export { registerDefaultEffects } from "./definitions";

export function resolveEffectPasses({
	definition,
	effectParams,
	width,
	height,
}: {
	definition: EffectDefinition;
	effectParams: ParamValues;
	width: number;
	height: number;
}): EffectPass[] {
	if (definition.renderer.buildPasses) {
		return definition.renderer.buildPasses({ effectParams, width, height });
	}
	return definition.renderer.passes.map((pass) => ({
		shader: pass.shader,
		uniforms: pass.uniforms({ effectParams, width, height }),
	}));
}

export function resolveCanvasEffectTreatment({
	definition,
	effectParams,
}: {
	definition: EffectDefinition;
	effectParams: ParamValues;
}): CanvasEffectTreatment | null {
	if (!definition.renderer.canvasFilter) return null;
	const lutSource = effectParams.lutSource;
	const lutStrength = effectParams.lutStrength;
	return {
		type: definition.type,
		filter: definition.renderer.canvasFilter(effectParams),
		...(typeof lutSource === "string" && lutSource.trim()
			? { lutSource }
			: {}),
		...(typeof lutStrength === "number" && Number.isFinite(lutStrength)
			? { lutStrength }
			: {}),
	};
}

export const EFFECT_TARGET_ELEMENT_TYPES = VISUAL_ELEMENT_TYPES;

export function buildDefaultEffectInstance({
	effectType,
}: {
	effectType: string;
}): Effect {
	const definition = effectsRegistry.get(effectType);
	const params: ParamValues = buildDefaultParamValues(definition.params);

	return {
		id: generateUUID(),
		type: effectType,
		params,
		enabled: true,
	};
}
