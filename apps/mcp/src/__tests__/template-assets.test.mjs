import { strict as assert } from "node:assert";
import test from "node:test";
import { createHash } from "node:crypto";
import {
	materializeTemplateAssets,
	prepareProductionAssets,
} from "../template-assets.mjs";

test("shared assets copy verified bytes once per project and preserve batch snapshots", async () => {
	const previous = globalThis.fetch,
		bytes = Buffer.from("canonical-image");
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	const metadata = {
		id: "visual-one",
		type: "image",
		ext: "png",
		mimeType: "image/png",
		width: 32,
		height: 32,
		duration: null,
		size: bytes.length,
		hasAudio: false,
		tags: ["sticker"],
		templateAsset: { sha256 },
	};
	const template = {
		resourceBindings: [
			{ slotId: "sticker", assetId: "visual-one", enabled: true },
		],
	};
	const stores = new Map();
	let writes = 0;
	try {
		globalThis.fetch = async (url, init = {}) => {
			if (url.includes("/api/projects/"))
				return Response.json({ metadata: { id: url.split("/").at(-1) } });
			if (url.endsWith("/assets/resolve"))
				return Response.json({
					assets: [
						{
							asset: { id: metadata.id, sha256 },
							metadata,
							mediaPath: "/blob",
						},
					],
				});
			if (url.endsWith("/blob")) return new Response(bytes);
			const project = url.split("/media/")[1].split("/")[0];
			if (init.method === "PUT") {
				assert.deepEqual(Buffer.from(init.body), bytes);
				writes++;
				return Response.json({ ok: true });
			}
			if (init.method === "PATCH") {
				stores.set(project, JSON.parse(init.body).value);
				return Response.json({ ok: true });
			}
			if (url.endsWith("visual-one")) return new Response(bytes);
			return Response.json({
				assets: stores.has(project)
					? { "visual-one": stores.get(project) }
					: {},
			});
		};
		const original = {
			items: [
				{
					template,
					fixtures: [
						{
							document: { metadata: { id: "first" } },
							input: {},
							media: { local: { id: "local" } },
						},
						{ document: { metadata: { id: "second" } }, input: {} },
					],
				},
			],
		};
		const prepared = await prepareProductionAssets(original, "http://local");
		assert.equal(writes, 2);
		assert.equal(original.items[0].fixtures[0].media["visual-one"], undefined);
		assert.equal(prepared.items[0].fixtures[0].media.local.id, "local");
		assert.equal(
			prepared.items[0].fixtures[1].media["visual-one"].templateAsset.sha256,
			sha256,
		);
		assert.deepEqual(
			await prepareProductionAssets(original, "http://local"),
			prepared,
		);
		assert.equal(writes, 2);
		stores.get("first").width = 99;
		await assert.rejects(
			materializeTemplateAssets({
				projectId: "first",
				template,
				base: "http://local",
			}),
			/metadata changed/,
		);
	} finally {
		globalThis.fetch = previous;
	}
});

test("shared asset transport refuses wrong bytes and never writes an unverified file", async () => {
	const previous = globalThis.fetch;
	let writes = 0;
	try {
		globalThis.fetch = async (url, init = {}) => {
			if (init.method === "PUT" || init.method === "PATCH") writes++;
			if (url.includes("/api/projects/"))
				return Response.json({ metadata: { id: "target" } });
			if (url.endsWith("/assets/resolve"))
				return Response.json({
					assets: [
						{
							asset: { id: "visual-one", sha256: "a".repeat(64) },
							metadata: { ext: "png" },
							mediaPath: "/blob",
						},
					],
				});
			if (url.endsWith("/blob")) return new Response("wrong bytes");
			return Response.json({ assets: {} });
		};
		await assert.rejects(
			materializeTemplateAssets({
				projectId: "target",
				template: { resourceBindings: [{ assetId: "visual-one" }] },
				base: "http://local",
			}),
			/hash mismatch/,
		);
		assert.equal(writes, 0);
	} finally {
		globalThis.fetch = previous;
	}
});

test("shared asset retry completes only an intact interrupted upload", async () => {
	const previous = globalThis.fetch;
	const bytes = Buffer.from("complete-upload-before-metadata");
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	const metadata = {
		id: "visual-retry", type: "image", ext: "png", mimeType: "image/png",
		width: 32, height: 32, duration: null, size: bytes.length,
		hasAudio: false, tags: [], templateAsset: { sha256 },
	};
	let existing, storedBytes, patches = 0, uploads = 0;
	try {
		globalThis.fetch = async (url, init = {}) => {
			if (url.includes("/api/projects/"))
				return Response.json({ metadata: { id: "target" } });
			if (url.endsWith("/assets/resolve"))
				return Response.json({ assets: [{ asset: { id: metadata.id, sha256 }, metadata, mediaPath: "/blob" }] });
			if (url.endsWith("/blob")) return new Response(bytes);
			if (init.method === "PUT") {
				uploads++;
				storedBytes = Buffer.from(init.body);
				existing = { ext: "png", mimeType: "image/png" };
				return Response.json({ ok: true });
			}
			if (init.method === "PATCH") {
				patches++;
				if (patches === 1) throw new Error("connection lost before metadata patch");
				const mutation = JSON.parse(init.body);
				assert.deepEqual(mutation.expectedUpload, { ext: "png", mimeType: "image/png", sha256 });
				existing = mutation.value;
				return Response.json({ ok: true });
			}
			if (url.endsWith("/visual-retry"))
				return storedBytes ? new Response(storedBytes) : new Response("missing", { status: 404 });
			return Response.json({ assets: existing ? { [metadata.id]: existing } : {} });
		};
		const materialize = () => materializeTemplateAssets({
			projectId: "target", base: "http://local",
			template: { resourceBindings: [{ assetId: metadata.id }] },
		});
		await assert.rejects(materialize(), /connection lost/);
		assert.deepEqual(existing, { ext: "png", mimeType: "image/png" });
		assert.deepEqual(await materialize(), { [metadata.id]: metadata });
		assert.equal(uploads, 1, "retry must reuse verified project bytes");
		assert.equal(patches, 2);
		await materialize();
		assert.equal(patches, 2, "completed retry is read-only");

		existing = { ext: "png", mimeType: "image/png" };
		storedBytes = Buffer.from("corrupt");
		await assert.rejects(materialize(), /missing or corrupt/);
		storedBytes = undefined;
		await assert.rejects(materialize(), /missing or corrupt/);
		storedBytes = bytes;
		for (const changed of [
			{ ext: "jpg", mimeType: "image/png" },
			{ ext: "png", mimeType: "image/jpeg" },
			{ ext: "png", mimeType: "image/png", name: "user edited metadata" },
			{ ...metadata, templateAsset: { sha256: "different" } },
		]) {
			existing = changed;
			await assert.rejects(materialize(), /ID collision/);
		}
		assert.equal(patches, 2, "damaged bytes and edited metadata must not be repaired");
		assert.equal(uploads, 1);
	} finally {
		globalThis.fetch = previous;
	}
});
