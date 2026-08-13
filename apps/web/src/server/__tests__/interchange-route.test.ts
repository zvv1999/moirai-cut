import { describe, expect, test } from "bun:test";
import {
	createFcpxmlRouteHandlers,
	type FcpxmlRouteExecutor,
} from "@/app/api/interchange/[projectId]/fcpxml/handlers";

describe("FCPXML interchange API", () => {
	test("passes a revision-bound Jianying desktop export to the executor", async () => {
		let received: Parameters<FcpxmlRouteExecutor>[0] | null = null;
		const execute: FcpxmlRouteExecutor = async (request) => {
			received = request;
			return {
				projectId: request.projectId,
				revision: request.baseRevision,
				stable: true,
				name: "demo-r7.fcpxml",
				path: "/tmp/demo-r7.fcpxml",
				downloadUrl: "/api/exports/project/demo-r7.fcpxml",
				reportName: "demo-r7.interchange-report.json",
				reportPath: "/tmp/demo-r7.interchange-report.json",
				reportDownloadUrl:
					"/api/exports/project/demo-r7.interchange-report.json",
				report: {
					schema: "moirai-cut.interchange-report.v1",
					issues: [],
				},
			};
		};
		const { POST } = createFcpxmlRouteHandlers({ execute });
		const response = await POST(
			new Request("http://localhost/api/interchange/project/fcpxml", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					baseRevision: 7,
					sceneId: "scene-main",
					name: "剪映交接",
				}),
			}),
			{ params: Promise.resolve({ projectId: "project" }) },
		);

		expect(response.status).toBe(200);
		expect((await response.json()).data.stable).toBe(true);
		expect(received).toEqual({
			projectId: "project",
			baseRevision: 7,
			sceneId: "scene-main",
			name: "剪映交接",
			target: "jianying-desktop",
		});
	});

	test("rejects missing revisions and preserves revision conflicts", async () => {
		const execute: FcpxmlRouteExecutor = async () => {
			throw Object.assign(new Error("Project moved to revision 8"), {
				code: "revision_conflict",
				status: 409,
				revision: 8,
			});
		};
		const { POST } = createFcpxmlRouteHandlers({ execute });
		const context = { params: Promise.resolve({ projectId: "project" }) };
		const invalid = await POST(
			new Request("http://localhost", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}),
			context,
		);
		expect(invalid.status).toBe(400);
		expect((await invalid.json()).error.code).toBe(
			"interchange_request_invalid",
		);

		const conflict = await POST(
			new Request("http://localhost", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ baseRevision: 7 }),
			}),
			context,
		);
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toEqual({
			error: {
				code: "revision_conflict",
				message: "Project moved to revision 8",
				revision: 8,
			},
		});
	});
});
