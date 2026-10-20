import { GraphicNode } from "./graphic-node";

/** An isolated surface; treatment and opacity apply after children are composited. */
export class GroupNode extends GraphicNode {
	childTimeOffset = 0;
}
