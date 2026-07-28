import type { SubtitleStyleOverrides } from "./types";

export interface CaptionStyle {
	id: string;
	name: string;
	style: SubtitleStyleOverrides;
}

export function createCaptionStyle({
	id,
	name,
	style,
}: {
	id: string;
	name: string;
	style: SubtitleStyleOverrides;
}): CaptionStyle {
	return {
		id,
		name: name.trim() || "Untitled style",
		style: { ...style },
	};
}

export function updateCaptionStyle({
	style,
	updates,
}: {
	style: CaptionStyle;
	updates: {
		name?: string;
		style?: SubtitleStyleOverrides;
	};
}): CaptionStyle {
	return {
		...style,
		...(updates.name !== undefined
			? { name: updates.name.trim() || style.name }
			: {}),
		style: {
			...style.style,
			...(updates.style ?? {}),
		},
	};
}

export function duplicateCaptionStyle({
	style,
	id,
}: {
	style: CaptionStyle;
	id: string;
}): CaptionStyle {
	return {
		id,
		name: `${style.name} copy`,
		style: { ...style.style },
	};
}

export function detachCaptionStyle({
	style,
	cueStyle,
}: {
	style: CaptionStyle;
	cueStyle?: SubtitleStyleOverrides;
}): {
	styleId: null;
	styleDetached: true;
	style: SubtitleStyleOverrides;
} {
	return {
		styleId: null,
		styleDetached: true,
		style: {
			...style.style,
			...(cueStyle ?? {}),
		},
	};
}
