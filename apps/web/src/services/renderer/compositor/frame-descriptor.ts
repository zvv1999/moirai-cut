import { drawCssBackground } from "@/gradients";
import { getMaskDefinition } from "@/masks";
import { buildMaskStackPlan } from "@/masks/stack";
import type { Mask } from "@/masks/types";
import { incrementCounter } from "@/diagnostics/render-perf";
import type { AnyBaseNode } from "../nodes/base-node";
import type { CanvasRenderer } from "../canvas-renderer";
import { createCanvasSurface } from "../canvas-utils";
import { BlurBackgroundNode } from "../nodes/blur-background-node";
import { ColorNode } from "../nodes/color-node";
import { EffectLayerNode } from "../nodes/effect-layer-node";
import {
	GraphicNode,
	type ResolvedGraphicNodeState,
} from "../nodes/graphic-node";
import { ImageNode } from "../nodes/image-node";
import { RootNode } from "../nodes/root-node";
import { StickerNode } from "../nodes/sticker-node";
import { renderTextToContext, TextNode } from "../nodes/text-node";
import { VideoNode } from "../nodes/video-node";
import type { ResolvedVisualSourceNodeState } from "../nodes/visual-node";
import type {
	FrameDescriptor,
	FrameItemDescriptor,
	LayerMaskDescriptor,
	QuadTransformDescriptor,
	TextureCanvasDrawFn,
	TextureUploadDescriptor,
} from "./types";
import { DEFAULT_GRAPHIC_SOURCE_SIZE } from "@/graphics";
import {
	drawCanvasEffectSource,
	drawStyledVisualSource,
	hasVisualDecoration,
} from "@/visual/render-appearance";
import type { CanvasEffectTreatment } from "@/effects/types";

export async function buildFrameDescriptor({
	node,
	renderer,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
}): Promise<{
	frame: FrameDescriptor;
	textures: TextureUploadDescriptor[];
}> {
	const items: FrameItemDescriptor[] = [];
	const textures = new Map<string, TextureUploadDescriptor>();

	await collectNode({
		node,
		renderer,
		path: "root",
		items,
		textures,
	});

	incrementCounter({ name: "frameItems", by: items.length });
	incrementCounter({ name: "frameTextures", by: textures.size });

	return {
		frame: {
			width: renderer.width,
			height: renderer.height,
			clear: {
				color: [0, 0, 0, 1],
			},
			items,
		},
		textures: [...textures.values()],
	};
}

async function collectNode({
	node,
	renderer,
	path,
	items,
	textures,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
}): Promise<void> {
	if (node instanceof RootNode) {
		for (let index = 0; index < node.children.length; index++) {
			await collectNode({
				node: node.children[index],
				renderer,
				path: `${path}:${index}`,
				items,
				textures,
			});
		}
		return;
	}

	if (node instanceof ColorNode) {
		const textureId = `${path}:color`;
		const { width, height } = renderer;
		textures.set(textureId, {
			kind: "rendered",
			id: textureId,
			contentHash: `color:${node.params.color}:${width}x${height}`,
			width,
			height,
			draw: (ctx) => {
				if (/gradient\(/i.test(node.params.color)) {
					drawCssBackground({ ctx, width, height, css: node.params.color });
				} else {
					ctx.fillStyle = node.params.color;
					ctx.fillRect(0, 0, width, height);
				}
			},
		});
		items.push({
			type: "layer",
			textureId,
			transform: fullCanvasTransform(renderer),
			opacity: 1,
			blendMode: "normal",
			effectPassGroups: [],
			mask: null,
		});
		return;
	}

	if (node instanceof EffectLayerNode) {
		if (!node.resolved) {
			return;
		}
		if (node.resolved.canvasEffects.length > 0) {
			applyCanvasAdjustmentToCollectedLayers({
				path,
				items,
				textures,
				canvasEffects: node.resolved.canvasEffects,
			});
		}
		if (node.resolved.passes.length > 0) {
			items.push({
				type: "sceneEffect",
				effectPassGroups: [node.resolved.passes],
			});
		}
		return;
	}

	if (node instanceof BlurBackgroundNode) {
		if (!node.resolved) {
			return;
		}
		const textureId = `${path}:blur-background`;
		const { width, height } = renderer;
		const { backdropSource, passes } = node.resolved;
		// Backdrop pixels come from a decoded video/image frame whose identity
		// already changes when it changes. Hashing the source reference is
		// enough to let us skip redraws on frozen frames.
		const contentHash = `blur:${identityKey(backdropSource.source)}:${backdropSource.width}x${backdropSource.height}:${width}x${height}`;
		textures.set(textureId, {
			kind: "rendered",
			id: textureId,
			contentHash,
			width,
			height,
			draw: (ctx) => {
				const coverScale = Math.max(
					width / backdropSource.width,
					height / backdropSource.height,
				);
				const scaledWidth = backdropSource.width * coverScale;
				const scaledHeight = backdropSource.height * coverScale;
				const offsetX = (width - scaledWidth) / 2;
				const offsetY = (height - scaledHeight) / 2;
				ctx.drawImage(
					backdropSource.source,
					offsetX,
					offsetY,
					scaledWidth,
					scaledHeight,
				);
			},
		});
		items.push({
			type: "layer",
			textureId,
			transform: fullCanvasTransform(renderer),
			opacity: 1,
			blendMode: "normal",
			effectPassGroups: [passes],
			mask: null,
		});
		return;
	}

	if (
		node instanceof VideoNode ||
		node instanceof ImageNode ||
		node instanceof StickerNode ||
		node instanceof GraphicNode
	) {
		await collectVisualSourceNode({
			node,
			renderer,
			path,
			items,
			textures,
		});
		return;
	}

	if (node instanceof TextNode) {
		collectTextNode({
			node,
			renderer,
			path,
			items,
			textures,
		});
	}
}

async function collectVisualSourceNode({
	node,
	renderer,
	path,
	items,
	textures,
}: {
	node: VideoNode | ImageNode | StickerNode | GraphicNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
}) {
	if (!node.resolved) {
		return;
	}

	const source =
		node instanceof GraphicNode
			? node.getSource({ resolvedParams: node.resolved.resolvedParams })
			: node.resolved.source;
	if (!source) {
		return;
	}

	const sourceWidth =
		node instanceof GraphicNode
			? DEFAULT_GRAPHIC_SOURCE_SIZE
			: (node.resolved as ResolvedVisualSourceNodeState).sourceWidth;
	const sourceHeight =
		node instanceof GraphicNode
			? DEFAULT_GRAPHIC_SOURCE_SIZE
			: (node.resolved as ResolvedVisualSourceNodeState).sourceHeight;

	const textureId = `${path}:source`;
	const needsCanvasRendering =
		hasVisualDecoration({ appearance: node.resolved.appearance }) ||
		node.resolved.canvasEffects.length > 0;
	if (needsCanvasRendering) {
		textures.set(textureId, {
			kind: "rendered",
			id: textureId,
			contentHash: `visual:${identityKey(source)}:${sourceWidth}x${sourceHeight}:${JSON.stringify({
				appearance: node.resolved.appearance,
				canvasEffects: node.resolved.canvasEffects,
			})}`,
			width: sourceWidth,
			height: sourceHeight,
			draw: (ctx) => {
				drawStyledVisualSource({
					ctx,
					source,
					width: sourceWidth,
					height: sourceHeight,
					appearance: node.resolved!.appearance,
					canvasEffects: node.resolved!.canvasEffects,
				});
			},
		});
	} else {
		textures.set(textureId, {
			kind: "external",
			id: textureId,
			source,
			width: sourceWidth,
			height: sourceHeight,
		});
	}

	const transform = computeVisualTransform({
		renderer,
		resolved: node.resolved,
		sourceWidth,
		sourceHeight,
	});
	const { mask, strokeLayers } = buildMaskArtifacts({
		node,
		renderer,
		path,
		transform,
		textures,
	});

	items.push({
		type: "layer",
		textureId,
		transform,
		opacity: node.resolved.opacity,
		blendMode: node.params.blendMode ?? "normal",
		effectPassGroups: node.resolved.effectPasses,
		mask,
	});
	for (const strokeLayer of strokeLayers) {
		items.push(strokeLayer);
	}
}

function collectTextNode({
	node,
	renderer,
	path,
	items,
	textures,
}: {
	node: TextNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
}) {
	if (!node.resolved) {
		return;
	}

	const textureId = `${path}:text`;
	const { width, height } = renderer;
	// Text output is fully determined by node.params + node.resolved. Both are
	// plain data we can stringify cheaply; the resolved measured layout is the
	// expensive part of text setup, so stringifying it here is orders of
	// magnitude cheaper than re-rasterizing when nothing changed.
	const contentHash = `text:${width}x${height}:${JSON.stringify({
		params: node.params,
		resolved: node.resolved,
	})}`;
	textures.set(textureId, {
		kind: "rendered",
		id: textureId,
		contentHash,
		width,
		height,
		draw: (ctx) => {
			if (node.resolved!.canvasEffects.length === 0) {
				renderTextToContext({ node, ctx });
				return;
			}
			const { canvas, context } = createCanvasSurface({ width, height });
			renderTextToContext({ node, ctx: context });
			drawCanvasEffectSource({
				ctx,
				source: canvas,
				width,
				height,
				canvasEffects: node.resolved!.canvasEffects,
			});
		},
	});
	items.push({
		type: "layer",
		textureId,
		transform: fullCanvasTransform(renderer),
		opacity: node.resolved.opacity,
		blendMode: node.params.blendMode ?? "normal",
		effectPassGroups: node.resolved.effectPasses,
		mask: null,
	});
}

function applyCanvasAdjustmentToCollectedLayers({
	path,
	items,
	textures,
	canvasEffects,
}: {
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
	canvasEffects: CanvasEffectTreatment[];
}): void {
	const serializedEffects = JSON.stringify(canvasEffects);
	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		if (item.type !== "layer") continue;
		if (
			item.textureId.endsWith(":color") ||
			item.textureId.endsWith(":blur-background") ||
			item.textureId.includes(":mask-stroke")
		) {
			continue;
		}
		const sourceTexture = textures.get(item.textureId);
		if (!sourceTexture) continue;
		const adjustedTextureId = `${path}:adjustment:${index}:${item.textureId}`;
		const sourceHash =
			sourceTexture.kind === "external"
				? identityKey(sourceTexture.source)
				: sourceTexture.contentHash;
		textures.set(adjustedTextureId, {
			kind: "rendered",
			id: adjustedTextureId,
			contentHash: `adjustment:${sourceHash}:${serializedEffects}`,
			width: sourceTexture.width,
			height: sourceTexture.height,
			draw: (ctx) => {
				if (sourceTexture.kind === "external") {
					drawCanvasEffectSource({
						ctx,
						source: sourceTexture.source,
						width: sourceTexture.width,
						height: sourceTexture.height,
						canvasEffects,
					});
					return;
				}
				const { canvas, context } = createCanvasSurface({
					width: sourceTexture.width,
					height: sourceTexture.height,
				});
				sourceTexture.draw(context);
				drawCanvasEffectSource({
					ctx,
					source: canvas,
					width: sourceTexture.width,
					height: sourceTexture.height,
					canvasEffects,
				});
			},
		});
		item.textureId = adjustedTextureId;
	}
}

function computeVisualTransform({
	renderer,
	resolved,
	sourceWidth,
	sourceHeight,
}: {
	renderer: CanvasRenderer;
	resolved: ResolvedVisualSourceNodeState | ResolvedGraphicNodeState;
	sourceWidth: number;
	sourceHeight: number;
}): QuadTransformDescriptor {
	const containScale = Math.min(
		renderer.width / sourceWidth,
		renderer.height / sourceHeight,
	);
	const scaledWidth = sourceWidth * containScale * resolved.transform.scaleX;
	const scaledHeight = sourceHeight * containScale * resolved.transform.scaleY;
	const absWidth = Math.abs(scaledWidth);
	const absHeight = Math.abs(scaledHeight);

	return {
		centerX: renderer.width / 2 + resolved.transform.position.x,
		centerY: renderer.height / 2 + resolved.transform.position.y,
		width: absWidth,
		height: absHeight,
		rotationDegrees: resolved.transform.rotate,
		flipX: (scaledWidth < 0) !== resolved.appearance.mirrorX,
		flipY: (scaledHeight < 0) !== resolved.appearance.mirrorY,
	};
}

function fullCanvasTransform(
	renderer: CanvasRenderer,
): QuadTransformDescriptor {
	return {
		centerX: renderer.width / 2,
		centerY: renderer.height / 2,
		width: renderer.width,
		height: renderer.height,
		rotationDegrees: 0,
		flipX: false,
		flipY: false,
	};
}

function buildMaskArtifacts({
	node,
	renderer,
	path,
	transform,
	textures,
}: {
	node: VideoNode | ImageNode | StickerNode | GraphicNode;
	renderer: CanvasRenderer;
	path: string;
	transform: QuadTransformDescriptor;
	textures: Map<string, TextureUploadDescriptor>;
}): {
	mask: LayerMaskDescriptor | null;
	strokeLayers: FrameItemDescriptor[];
} {
	// The RESOLVED masks, not node.params.masks: the latter holds the static
	// authored values, so an animated feather or position would never move.
	const masks = (node.resolved?.masks ?? node.params.masks ?? []).filter(
		(mask) => getMaskDefinition(mask.type).isActive?.(mask.params) !== false,
	);
	if (masks.length === 0) {
		return { mask: null, strokeLayers: [] };
	}

	const maskTextureId = `${path}:mask`;
	const { width: canvasWidth, height: canvasHeight } = renderer;
	const stackPlan = buildMaskStackPlan({
		masks: masks.map((mask) => ({
			id: mask.id,
			combineMode: mask.combineMode,
			feather: mask.params.feather,
			inverted: mask.params.inverted,
		})),
	});
	const maskContentHash = `mask-stack:${JSON.stringify(masks)}:${transformHash(transform)}:${canvasWidth}x${canvasHeight}`;
	const drawMask: TextureCanvasDrawFn = (ctx) => {
		for (let index = 0; index < masks.length; index++) {
			const authoredMask = masks[index];
			const { canvas: fullMaskCanvas, context: fullMaskCtx } =
				createCanvasSurface({
					width: canvasWidth,
					height: canvasHeight,
				});
			const { canvas: elementMaskCanvas, context: elementMaskCtx } =
				createCanvasSurface({
					width: Math.max(1, Math.round(transform.width)),
					height: Math.max(1, Math.round(transform.height)),
				});
			drawMaskBody({
				mask: authoredMask,
				ctx: elementMaskCtx,
				width: transform.width,
				height: transform.height,
			});
			drawTransformedCanvas({
				ctx: fullMaskCtx,
				source: elementMaskCanvas,
				transform,
			});

			if (stackPlan.steps[index]?.inverted) {
				const { canvas: invertedCanvas, context: invertedCtx } =
					createCanvasSurface({
						width: canvasWidth,
						height: canvasHeight,
					});
				invertedCtx.fillStyle = "white";
				invertedCtx.fillRect(0, 0, canvasWidth, canvasHeight);
				invertedCtx.globalCompositeOperation = "destination-out";
				invertedCtx.drawImage(fullMaskCanvas, 0, 0);
				invertedCtx.globalCompositeOperation = "source-over";
				ctx.globalCompositeOperation =
					stackPlan.steps[index]?.compositeOperation ?? "source-over";
				ctx.drawImage(invertedCanvas, 0, 0);
			} else {
				ctx.globalCompositeOperation =
					stackPlan.steps[index]?.compositeOperation ?? "source-over";
				ctx.drawImage(fullMaskCanvas, 0, 0);
			}
		}
		ctx.globalCompositeOperation = "source-over";
	};
	textures.set(maskTextureId, {
		kind: "rendered",
		id: maskTextureId,
		contentHash: maskContentHash,
		width: canvasWidth,
		height: canvasHeight,
		draw: drawMask,
	});

	const strokeLayers: FrameItemDescriptor[] = [];
	for (let index = 0; index < masks.length; index++) {
		const authoredMask = masks[index];
		const definition = getMaskDefinition(authoredMask.type);
		const stroke = definition.renderer.stroke;
		if (authoredMask.params.strokeWidth <= 0 || !stroke) continue;
		const strokeTextureId = `${path}:mask-stroke:${index}`;
		const strokeContentHash = `stroke:${authoredMask.type}:${JSON.stringify(authoredMask.params)}:${transformHash(transform)}:${canvasWidth}x${canvasHeight}:stroke=${stroke.kind}`;
		const drawStroke: TextureCanvasDrawFn = (ctx) => {
			const { canvas: strokeCanvas, context: strokeCtx } = createCanvasSurface({
				width: Math.max(1, Math.round(transform.width)),
				height: Math.max(1, Math.round(transform.height)),
			});

			switch (stroke.kind) {
				case "renderStroke":
					stroke.renderStroke({
						resolvedParams: authoredMask.params,
						ctx: strokeCtx,
						width: transform.width,
						height: transform.height,
					});
					break;
				case "strokeFromPath": {
					const strokePath = stroke.buildStrokePath({
						resolvedParams: authoredMask.params,
						width: transform.width,
						height: transform.height,
					});
					strokeCtx.strokeStyle = authoredMask.params.strokeColor;
					strokeCtx.lineWidth = authoredMask.params.strokeWidth;
					strokeCtx.stroke(strokePath);
					break;
				}
			}

			drawTransformedCanvas({ ctx, source: strokeCanvas, transform });
		};
		textures.set(strokeTextureId, {
			kind: "rendered",
			id: strokeTextureId,
			contentHash: strokeContentHash,
			width: canvasWidth,
			height: canvasHeight,
			draw: drawStroke,
		});
		strokeLayers.push({
			type: "layer",
			textureId: strokeTextureId,
			transform: fullCanvasTransform(renderer),
			opacity: 1,
			blendMode: "normal",
			effectPassGroups: [],
			mask: null,
		});
	}

	return {
		mask: {
			textureId: maskTextureId,
			feather: stackPlan.maxFeather,
			inverted: false,
		},
		strokeLayers,
	};
}

function drawMaskBody({
	mask,
	ctx,
	width,
	height,
}: {
	mask: Mask;
	ctx: OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
}): void {
	const body = getMaskDefinition(mask.type).renderer.body;
	const usesOpaqueFastPath =
		body.kind === "drawWithFeather" &&
		mask.params.feather === 0 &&
		Boolean(body.opaqueFastPath);
	switch (body.kind) {
		case "fillPath": {
			const path2d = body.buildPath({
				resolvedParams: mask.params,
				width,
				height,
			});
			ctx.fillStyle = "white";
			ctx.fill(path2d);
			break;
		}
		case "drawOpaque":
			body.drawOpaque({
				resolvedParams: mask.params,
				ctx,
				width: Math.round(width),
				height: Math.round(height),
			});
			break;
		case "drawWithFeather":
			if (usesOpaqueFastPath && body.opaqueFastPath) {
				const path2d = body.opaqueFastPath.buildPath({
					resolvedParams: mask.params,
					width,
					height,
				});
				ctx.fillStyle = "white";
				ctx.fill(path2d);
			} else {
				body.drawWithFeather({
					resolvedParams: mask.params,
					ctx,
					width: Math.round(width),
					height: Math.round(height),
					feather: mask.params.feather,
				});
			}
			break;
	}
}

function drawTransformedCanvas({
	ctx,
	source,
	transform,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	source: CanvasImageSource;
	transform: QuadTransformDescriptor;
}) {
	const x = transform.centerX - transform.width / 2;
	const y = transform.centerY - transform.height / 2;
	const flipX = transform.flipX ? -1 : 1;
	const flipY = transform.flipY ? -1 : 1;
	const requiresTransform =
		transform.rotationDegrees !== 0 || flipX !== 1 || flipY !== 1;

	ctx.save();
	if (requiresTransform) {
		ctx.translate(transform.centerX, transform.centerY);
		ctx.rotate((transform.rotationDegrees * Math.PI) / 180);
		ctx.scale(flipX, flipY);
		ctx.translate(-transform.centerX, -transform.centerY);
	}
	ctx.drawImage(source, x, y, transform.width, transform.height);
	ctx.restore();
}

function transformHash(transform: QuadTransformDescriptor): string {
	return `${transform.centerX}:${transform.centerY}:${transform.width}:${transform.height}:${transform.rotationDegrees}:${transform.flipX ? 1 : 0}:${transform.flipY ? 1 : 0}`;
}

// Stable identity key for CanvasImageSource. Using a WeakMap → counter keeps
// hash string length bounded and avoids holding sources alive.
const identityKeys = new WeakMap<object, number>();
let nextIdentity = 1;
function identityKey(source: CanvasImageSource): string {
	if (typeof source === "object" && source !== null) {
		let key = identityKeys.get(source);
		if (key === undefined) {
			key = nextIdentity++;
			identityKeys.set(source, key);
		}
		return `@${key}`;
	}
	return "@?";
}
