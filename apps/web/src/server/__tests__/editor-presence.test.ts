import { beforeEach, describe, expect, test } from "bun:test";
import {
	clearEditorPresenceForTests,
	getActiveEditor,
	recordEditorPresence,
} from "../editor-presence";

describe("active OpenCut editor presence", () => {
	beforeEach(() => clearEditorPresenceForTests());

	test("returns the freshest editor and its exact agent context packet", () => {
		recordEditorPresence({
			projectId: "older",
			sceneId: "scene-a",
			revision: 3,
			context: {
				schemaVersion: "opencut.agent-context.v1",
				project: { id: "older" },
			},
			now: 1_000,
		});
		recordEditorPresence({
			projectId: "current",
			sceneId: "scene-b",
			revision: 9,
			context: {
				schemaVersion: "opencut.agent-context.v1",
				project: { id: "current" },
			},
			now: 2_000,
		});

		expect(getActiveEditor({ now: 2_100 })).toEqual({
			active: true,
			projectId: "current",
			sceneId: "scene-b",
			revision: 9,
			lastSeen: 2_000,
			context: {
				schemaVersion: "opencut.agent-context.v1",
				project: { id: "current" },
			},
		});
	});

	test("drops stale presence and rejects oversized or mismatched context", () => {
		recordEditorPresence({
			projectId: "current",
			sceneId: "scene-b",
			revision: 9,
			context: {
				schemaVersion: "opencut.agent-context.v1",
				project: { id: "other" },
			},
			now: 1_000,
		});
		expect(getActiveEditor({ now: 60_001 })).toEqual({ active: false });

		expect(() =>
			recordEditorPresence({
				projectId: "current",
				sceneId: "scene-b",
				revision: 9,
				context: { payload: "x".repeat(140_000) },
				now: 2_000,
			}),
		).toThrow("上下文过大");
	});
});
