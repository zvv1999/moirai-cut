import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { produceTemplates } from "../template-authoring.mjs";
import { buildNewProjectDocument } from "../document.mjs";

function harness() {
	const bytes = Buffer.from("verified source");
	const metadata = {
		id: "sample-input",
		ext: "bin",
		mimeType: "application/octet-stream",
		type: "audio",
		duration: 2,
		templateInput: {
			id: "input",
			sha256: createHash("sha256").update(bytes).digest("hex"),
		},
	};
	const document = {
		...buildNewProjectDocument({
			id: "preview",
			name: "Template Production / test",
		}),
		revision: 1,
	};
	const draft = {
		id: "draft",
		assets: [
			{ metadata, sha256: metadata.templateInput.sha256, mediaPath: "/source" },
		],
		manifest: {
			items: [{ fixtures: [{ document, media: { [metadata.id]: metadata } }] }],
		},
		warnings: [],
	};
	const state = {
		project: null,
		media: {},
		blob: null,
		writes: 0,
		submits: 0,
		failPatch: false,
		source: bytes,
		draft,
	};
	state.fetch = async (target, init = {}) => {
		const path = new URL(target).pathname;
		if (path.endsWith("/production/prepare")) return Response.json(draft);
		if (path.endsWith("/production")) {
			state.submits++;
			return Response.json({ id: "batch" });
		}
		if (path.endsWith("/projects/preview")) {
			if (init.method === "PUT") {
				assert.equal(init.headers["if-match"], "0");
				assert.equal(state.project, null);
				state.project = JSON.parse(init.body);
				state.writes++;
				return Response.json({ revision: 1 });
			}
			return Response.json(state.project);
		}
		if (path === "/source") return new Response(state.source);
		if (path.endsWith("/media/preview"))
			return Response.json({ assets: state.media });
		if (path.endsWith("/media/preview/sample-input")) {
			if (init.method === "PUT") {
				state.blob = Buffer.from(init.body);
				state.media[metadata.id] = {
					ext: metadata.ext,
					mimeType: metadata.mimeType,
				};
				state.writes++;
				return Response.json({ ok: true });
			}
			if (init.method === "PATCH") {
				if (state.failPatch) {
					state.failPatch = false;
					return new Response("interrupted", { status: 500 });
				}
				state.media[metadata.id] = JSON.parse(init.body).value;
				state.writes++;
				return Response.json({ ok: true });
			}
			return new Response(state.blob);
		}
		throw Error(target);
	};
	return state;
}

test("authoring resumes a partial source upload and replays an existing batch without touching edited projects", async () => {
	const previous = globalThis.fetch,
		state = harness();
	globalThis.fetch = state.fetch;
	try {
		state.failPatch = true;
		await assert.rejects(produceTemplates({ request: {} }), /interrupted/);
		assert.equal(state.submits, 0);
		const result = await produceTemplates({ request: {} });
		assert.equal(result.preparedProjects, 1);
		assert.equal(state.writes, 3);
		assert.equal(state.submits, 1);
		state.draft.batch = { id: "batch", summary: { published: 1 } };
		state.project.metadata.name = "Human edited this";
		const replay = await produceTemplates({ request: {} });
		assert.equal(replay.deduplicated, true);
		assert.equal(state.writes, 3);
		assert.equal(state.submits, 1);
	} finally {
		globalThis.fetch = previous;
	}
});

test("preparation refuses project edits and corrupted input bytes before submission", async () => {
	const previous = globalThis.fetch;
	try {
		const state = harness();
		globalThis.fetch = state.fetch;
		state.source = Buffer.from("corrupted");
		await assert.rejects(produceTemplates({ request: {} }), /hash mismatch/);
		assert.equal(state.writes, 1);
		assert.equal(state.submits, 0);
		state.project.metadata.name = "Human edited this";
		await assert.rejects(
			produceTemplates({ request: {} }),
			/Prepared project changed/,
		);
		assert.equal(state.project.metadata.name, "Human edited this");
		assert.equal(state.submits, 0);
	} finally {
		globalThis.fetch = previous;
	}
});

test("preparation validates existing project media instead of silently replacing it", async () => {
	const previous = globalThis.fetch,
		state = harness();
	globalThis.fetch = state.fetch;
	try {
		await produceTemplates({ request: {} });
		state.blob = Buffer.from("corrupted");
		await assert.rejects(produceTemplates({ request: {} }), /media is corrupt/);
		assert.equal(state.writes, 3);
		assert.equal(state.submits, 1);
	} finally {
		globalThis.fetch = previous;
	}
});
