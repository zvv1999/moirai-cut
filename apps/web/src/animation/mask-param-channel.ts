import type { ElementAnimations } from "@/animation/types";
import type { ParamValues } from "@/params";
import { removeElementKeyframe } from "./keyframes";
import { resolveAnimationPathValueAtTime } from "./resolve";

/**
 * Animation paths that address a mask's parameters.
 *
 * Mirrors the effect-param channel: `masks.<maskId>.params.<key>`. Masks were
 * previously the one parameterised thing on a clip that could not be keyframed,
 * so a feather or a position could be set but never made to move.
 */

export const MASK_PARAM_PATH_PREFIX = "masks.";
export const MASK_PARAM_PATH_SUFFIX = ".params.";

export function buildMaskParamPath({
	maskId,
	paramKey,
}: {
	maskId: string;
	paramKey: string;
}): string {
	return `${MASK_PARAM_PATH_PREFIX}${maskId}${MASK_PARAM_PATH_SUFFIX}${paramKey}`;
}

export function isMaskParamPath(propertyPath: string): boolean {
	return (
		propertyPath.startsWith(MASK_PARAM_PATH_PREFIX) &&
		propertyPath.includes(MASK_PARAM_PATH_SUFFIX)
	);
}

export function parseMaskParamPath({
	propertyPath,
}: {
	propertyPath: string;
}): { maskId: string; paramKey: string } | null {
	if (!isMaskParamPath(propertyPath)) {
		return null;
	}

	const withoutPrefix = propertyPath.slice(MASK_PARAM_PATH_PREFIX.length);
	const separatorIndex = withoutPrefix.indexOf(MASK_PARAM_PATH_SUFFIX);
	if (separatorIndex <= 0) {
		return null;
	}

	const maskId = withoutPrefix.slice(0, separatorIndex);
	const paramKey = withoutPrefix.slice(
		separatorIndex + MASK_PARAM_PATH_SUFFIX.length,
	);
	if (!maskId || !paramKey) {
		return null;
	}

	return { maskId, paramKey };
}

/**
 * A mask's parameters at a moment, with any animated ones sampled.
 *
 * Only params that actually carry a channel are sampled; everything else passes
 * through untouched, so an unanimated mask costs nothing.
 */
export function resolveMaskParamsAtTime({
	maskId,
	params,
	animations,
	localTime,
}: {
	maskId: string;
	params: ParamValues;
	animations: ElementAnimations | undefined;
	localTime: number;
}): ParamValues {
	if (!animations) {
		return params;
	}

	const safeLocalTime = Math.max(0, localTime);
	let resolved: ParamValues | null = null;

	for (const [paramKey, staticValue] of Object.entries(params)) {
		const path = buildMaskParamPath({ maskId, paramKey });
		if (!animations[path]) {
			continue;
		}
		resolved = resolved ?? { ...params };
		resolved[paramKey] = resolveAnimationPathValueAtTime({
			animations,
			propertyPath: path,
			localTime: safeLocalTime,
			fallbackValue: staticValue,
		});
	}

	return resolved ?? params;
}

export function removeMaskParamKeyframe({
	animations,
	maskId,
	paramKey,
	keyframeId,
}: {
	animations: ElementAnimations | undefined;
	maskId: string;
	paramKey: string;
	keyframeId: string;
}): ElementAnimations | undefined {
	return removeElementKeyframe({
		animations,
		propertyPath: buildMaskParamPath({ maskId, paramKey }),
		keyframeId,
	});
}
