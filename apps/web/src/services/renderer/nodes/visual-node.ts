import { BaseNode } from "./base-node";
import type {
	CanvasEffectTreatment,
	Effect,
	EffectPass,
} from "@/effects/types";
import type { Mask } from "@/masks/types";
import type { BlendMode, Transform } from "@/rendering";
import type { RetimeConfig, VisualElement } from "@/timeline";
import type { VisualAppearance } from "@/visual/appearance";

export interface VisualNodeParams {
	duration: number;
	timeOffset: number;
	trimStart: number;
	trimEnd: number;
	retime?: RetimeConfig;
	transform: Transform;
	animations?: VisualElement["animations"];
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	masks?: Mask[];
	appearance: VisualAppearance;
}

export interface ResolvedVisualNodeState {
	localTime: number;
	transform: Transform;
	opacity: number;
	effectPasses: EffectPass[][];
	canvasEffects: CanvasEffectTreatment[];
	appearance: VisualAppearance;
	/**
	 * Masks with any keyframed parameters sampled at `localTime`. Resolved here
	 * alongside transform and opacity so the compositor never has to decide
	 * whether it is looking at a static or an animated value.
	 */
	masks: Mask[];
}

export interface ResolvedVisualSourceNodeState extends ResolvedVisualNodeState {
	source: CanvasImageSource;
	sourceWidth: number;
	sourceHeight: number;
}

export abstract class VisualNode<
	Params extends VisualNodeParams = VisualNodeParams,
	Resolved extends ResolvedVisualNodeState = ResolvedVisualNodeState,
> extends BaseNode<Params, Resolved> {}
