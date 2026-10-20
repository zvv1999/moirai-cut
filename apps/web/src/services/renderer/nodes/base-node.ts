import type {TimelineTextAttachment} from "@/timeline/types";

export type BaseNodeParams = object | undefined;
export type AnyBaseNode = BaseNode<BaseNodeParams, unknown>;

/** Origin in the expanded timeline, independent of a node's rendering params. */
export type RenderNodeSource = {
	elementId: string;
	trackId: string;
	groupPath: readonly string[];
	/** Add to the enclosing group's local clock to obtain scene time (ticks). */
	sceneTimeOffset: number;
	templateElementId?: string;
	templateInstanceId?: string;
	/** Legacy following uses an activation-relative basis, not a current pose. */
	layoutAttachment?: boolean;
	/** Native authored layout in text-local pixels, before animation. */
	textLayoutBox?: {left:number;top:number;width:number;height:number};
};

export class BaseNode<
	Params extends BaseNodeParams = BaseNodeParams,
	Resolved = unknown,
> {
	params: Params;
	resolved: Resolved | null = null;
	source?: RenderNodeSource;
	textAttachment?: TimelineTextAttachment;

	constructor(params?: Params) {
		this.params = params ?? ({} as Params);
	}

	children: AnyBaseNode[] = [];

	add(child: AnyBaseNode) {
		this.children.push(child);
		return this;
	}

	remove(child: AnyBaseNode) {
		this.children = this.children.filter((c) => c !== child);
		return this;
	}
}
