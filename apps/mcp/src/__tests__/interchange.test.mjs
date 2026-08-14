import { strict as assert } from "node:assert";
import test from "node:test";

import { exportFcpxml } from "../interchange.mjs";

test("exportFcpxml sends the project revision to the unified web API", async () => {
	let request;
	const result = await exportFcpxml({
		projectId: "project",
		baseRevision: 7,
		sceneId: "scene-main",
		name: "handoff",
		fetchImpl: async (url, init) => {
			request = { url, init };
			return Response.json({
				data: { name: "handoff-r7.fcpxml", stable: true },
			});
		},
	});

	assert.equal(
		request.url,
		"http://localhost:3000/api/interchange/project/fcpxml",
	);
	assert.deepEqual(JSON.parse(request.init.body), {
		baseRevision: 7,
		sceneId: "scene-main",
		name: "handoff",
		target: "jianying-desktop",
	});
	assert.equal(result.name, "handoff-r7.fcpxml");
});

test("exportFcpxml surfaces revision conflicts as a typed MCP client error", async () => {
	await assert.rejects(
		() =>
			exportFcpxml({
				projectId: "project",
				baseRevision: 7,
				fetchImpl: async () =>
					Response.json(
						{
							error: {
								code: "revision_conflict",
								message: "Project is at revision 8",
								revision: 8,
							},
						},
						{ status: 409 },
					),
			}),
		(error) => {
			assert.equal(error.code, "revision_conflict");
			assert.equal(error.status, 409);
			assert.equal(error.revision, 8);
			return true;
		},
	);
});
