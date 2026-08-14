import { describe, expect, test } from "bun:test";
import { requestProjectFcpxml } from "@/export/interchange-client";

describe("FCPXML export client", () => {
	test("flushes dirty state before reading and sending the file revision", async () => {
		const events: string[] = [];
		let dirty = true;
		let revision = 6;
		let received: Record<string, unknown> = {};
		const result = await requestProjectFcpxml({
			projectId: "project",
			projectName: "Demo",
			isDirty: () => dirty,
			flush: async () => {
				events.push("flush");
				dirty = false;
				revision = 7;
			},
			getRevision: () => {
				events.push("revision");
				return revision;
			},
			fetcher: async (_input, init) => {
				events.push("fetch");
				received = JSON.parse(String(init?.body));
				return Response.json({
					data: {
						name: "Demo-r7.fcpxml",
						stable: true,
						report: { issues: [] },
					},
				});
			},
		});

		expect(events).toEqual(["flush", "revision", "fetch"]);
		expect(received).toEqual({
			baseRevision: 7,
			name: "Demo",
			target: "jianying-desktop",
		});
		expect(result.name).toBe("Demo-r7.fcpxml");
	});

	test("refuses export when no persisted file revision is known", async () => {
		await expect(
			requestProjectFcpxml({
				projectId: "project",
				projectName: "Demo",
				isDirty: () => false,
				flush: async () => {},
				getRevision: () => null,
				fetcher: async () => {
					throw new Error("must not fetch");
				},
			}),
		).rejects.toThrow("尚未保存");
	});

	test("refuses export when flush returns while the project is still dirty", async () => {
		let fetched = false;
		await expect(
			requestProjectFcpxml({
				projectId: "project",
				projectName: "Demo",
				isDirty: () => true,
				flush: async () => {},
				getRevision: () => 7,
				fetcher: async () => {
					fetched = true;
					throw new Error("must not fetch");
				},
			}),
		).rejects.toThrow("仍有未保存");
		expect(fetched).toBe(false);
	});
});
