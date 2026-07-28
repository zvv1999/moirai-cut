import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorGradeEffectDefinition } from "./color-grade";
import { chromaKeyEffectDefinition } from "./chroma-key";
import { backgroundRemovalEffectDefinition } from "./background-removal";

const defaultEffects = [
	blurEffectDefinition,
	colorGradeEffectDefinition,
	chromaKeyEffectDefinition,
	backgroundRemovalEffectDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
