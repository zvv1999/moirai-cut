import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createOpenCutMcpServer } from "../server.mjs";
import { buildNewProjectDocument } from "../document.mjs";

test("edit replay is scoped to the project and rejects changed payloads", async () => {
	const documents = new Map(
		["replay-first", "replay-second"].map((id) => [
			id,
			{
				...buildNewProjectDocument({
					name: id,
					id,
					sceneId: "scene",
					mainTrackId: "main",
					now: new Date().toISOString(),
					fps: 30,
					canvasSize: { width: 1080, height: 1920 },
				}),
				revision: 0,
			},
		]),
	);
	const previous = globalThis.fetch;
	let writes = 0;
	globalThis.fetch = async (url, init = {}) => {
		const pathname = new URL(url).pathname;
		if (pathname.startsWith("/api/media/"))
			return Response.json({ assets: {} });
		if (pathname.includes("/activity")) return Response.json({ ok: true });
		const id = pathname.split("/").at(-1);
		assert(documents.has(id), pathname);
		if (init.method === "PUT") {
			const old = documents.get(id);
			assert.equal(Number(init.headers["if-match"]), old.revision);
			const document = JSON.parse(init.body);
			document.revision = old.revision + 1;
			documents.set(id, document);
			writes++;
			return Response.json({ revision: document.revision });
		}
		return Response.json(documents.get(id));
	};
	const server = createOpenCutMcpServer();
	const client = new Client({ name: "replay-test", version: "1" });
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	try {
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		const args = {
			baseRevision: 0,
			idempotencyKey: "shared-key",
			operations: [
				{
					type: "element.insert",
					element: {
						type: "text",
						name: "Title",
						params: { content: "One" },
						startTimeSeconds: 0,
						durationSeconds: 2,
					},
				},
			],
		};
		const call = async (projectId, extra = {}) =>
			client.callTool({
				name: "edit_project",
				arguments: { ...args, projectId, ...extra },
			});
		for (const id of documents.keys()) {
			const result = await call(id);
			assert(!result.isError, JSON.stringify(result));
			assert.equal(documents.get(id).revision, 1);
			const replay = await call(id);
			assert.equal(JSON.parse(replay.content[0].text).deduplicated, true);
		}
		assert.equal(writes, 2);
		const changed = await call("replay-first", {
			operations: [
				{
					type: "element.insert",
					element: {
						type: "text",
						name: "Title",
						params: { content: "Two" },
						startTimeSeconds: 0,
						durationSeconds: 2,
					},
				},
			],
		});
		assert(changed.isError);
		assert.equal(
			JSON.parse(changed.content[0].text).code,
			"idempotency_conflict",
		);
		const revision = await call("replay-first", { baseRevision: 1 });
		assert(revision.isError);
		assert.equal(writes, 2);
	} finally {
		await client.close();
		await server.close();
		globalThis.fetch = previous;
	}
});
