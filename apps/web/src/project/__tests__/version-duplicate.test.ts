import { describe, expect, test } from "bun:test";
import { prepareRevisionDuplicate } from "../version-duplicate";

describe("version duplication", () => {
	test("creates an independent revision-one project without mutating the snapshot", () => {
		const snapshot = {
			revision: 24,
			version: 31,
			metadata: {
				id: "source",
				name: "Approved cut",
				createdAt: "2026-07-28T08:00:00.000Z",
				updatedAt: "2026-07-28T09:00:00.000Z",
			},
			scenes: [{ id: "scene-1" }],
		};

		const duplicate = prepareRevisionDuplicate({
			snapshot,
			newProjectId: "copy",
			newName: "Approved cut · revision 24",
			now: "2026-07-28T12:00:00.000Z",
		});

		expect(duplicate).toMatchObject({
			revision: 1,
			version: 31,
			metadata: {
				id: "copy",
				name: "Approved cut · revision 24",
				createdAt: "2026-07-28T12:00:00.000Z",
				updatedAt: "2026-07-28T12:00:00.000Z",
			},
			scenes: [{ id: "scene-1" }],
		});
		expect(snapshot.metadata.id).toBe("source");
		expect(snapshot.revision).toBe(24);
	});

	test("rejects malformed snapshots before any filesystem copy begins", () => {
		expect(() =>
			prepareRevisionDuplicate({
				snapshot: { metadata: null },
				newProjectId: "copy",
				newName: "Copy",
				now: "2026-07-28T12:00:00.000Z",
			}),
		).toThrow("metadata");
	});
});
