import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	DELETE,
	PATCH,
	PUT,
} from "@/app/api/media/[projectId]/[[...assetId]]/route";
import { withMediaIndexLock } from "@/server/media-index";

const originalProjectsRoot = process.env.OPENCUT_PROJECTS_DIR;
const temporaryRoots: string[] = [];

afterEach(async () => {
	if (originalProjectsRoot === undefined) {
		delete process.env.OPENCUT_PROJECTS_DIR;
	} else {
		process.env.OPENCUT_PROJECTS_DIR = originalProjectsRoot;
	}
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function fixture() {
	const projectsRoot = await mkdtemp(
		path.join(tmpdir(), "opencut-media-route-"),
	);
	temporaryRoots.push(projectsRoot);
	process.env.OPENCUT_PROJECTS_DIR = projectsRoot;
	const projectId = "project-media-route";
	const assetId = "asset-media-route";
	const proxyStorageId = "current-generation-proxy";
	const mediaDirectory = path.join(projectsRoot, projectId, "media");
	await mkdir(mediaDirectory, { recursive: true });
	await writeFile(
		path.join(mediaDirectory, "index.json"),
		JSON.stringify({
			[assetId]: {
				id: assetId,
				ext: "mp4",
				mimeType: "video/mp4",
				name: "Source.mp4",
				proxy: {
					storageId: proxyStorageId,
					profile: "standard",
					sourceSha256: "current-source",
				},
			},
			[proxyStorageId]: {
				id: proxyStorageId,
				ext: "mp4",
				mimeType: "video/mp4",
			},
		}),
	);
	await writeFile(path.join(mediaDirectory, `${assetId}.mp4`), "source");
	await writeFile(path.join(mediaDirectory, `${proxyStorageId}.mp4`), "proxy");
	return { projectId, assetId, proxyStorageId, mediaDirectory };
}

function context({
	projectId,
	assetId,
}: {
	projectId: string;
	assetId?: string;
}) {
	return {
		params: Promise.resolve({
			projectId,
			assetId: assetId ? [assetId] : undefined,
		}),
	};
}

describe("media route index transactions", () => {
	test("preserves both entries when different assets are imported concurrently", async () => {
		const source = await fixture();
		const imports = [
			{ id: "concurrent-a", ext: "mov", mimeType: "video/quicktime" },
			{ id: "concurrent-b", ext: "webm", mimeType: "video/webm" },
		];
		const responses = await Promise.all(
			imports.map(({ id, ext, mimeType }) =>
				PUT(
					new Request(
						`http://localhost/api/media/${source.projectId}/${id}?ext=${ext}`,
						{
							method: "PUT",
							headers: { "content-type": mimeType },
							body: `bytes-${id}`,
						},
					),
					context({ projectId: source.projectId, assetId: id }),
				),
			),
		);
		expect(responses.map((response) => response.status)).toEqual([200, 200]);
		const index = JSON.parse(
			await readFile(path.join(source.mediaDirectory, "index.json"), "utf8"),
		);
		for (const { id, ext, mimeType } of imports) {
			expect(index[id]).toMatchObject({ ext, mimeType });
			expect(
				await readFile(
					path.join(source.mediaDirectory, `${id}.${ext}`),
					"utf8",
				),
			).toBe(`bytes-${id}`);
		}
	});

	test("merges metadata without restoring or clearing a newer proxy", async () => {
		const source = await fixture();
		const staleStorageId = "stale-generation-proxy";
		const mergeResponse = await PATCH(
			new Request(
				`http://localhost/api/media/${source.projectId}/${source.assetId}`,
				{
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						action: "merge",
						value: {
							name: "Renamed.mp4",
							proxy: { storageId: staleStorageId },
						},
						removeKeys: [],
					}),
				},
			),
			context(source),
		);
		expect(mergeResponse.status).toBe(200);
		let index = JSON.parse(
			await readFile(path.join(source.mediaDirectory, "index.json"), "utf8"),
		);
		expect(index[source.assetId]).toMatchObject({
			name: "Renamed.mp4",
			proxy: { storageId: source.proxyStorageId },
		});

		const removeResponse = await PATCH(
			new Request(
				`http://localhost/api/media/${source.projectId}/${source.assetId}`,
				{
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						action: "merge",
						value: { name: "Without Proxy.mp4" },
						removeKeys: ["proxy"],
					}),
				},
			),
			context(source),
		);
		expect(removeResponse.status).toBe(200);
		index = JSON.parse(
			await readFile(path.join(source.mediaDirectory, "index.json"), "utf8"),
		);
		expect(index[source.assetId].proxy).toEqual({
			storageId: source.proxyStorageId,
			profile: "standard",
			sourceSha256: "current-source",
		});
	});

	test("deleting proxy bytes clears every parent reference", async () => {
		const source = await fixture();
		const response = await DELETE(
			new Request(
				`http://localhost/api/media/${source.projectId}/${source.proxyStorageId}`,
				{ method: "DELETE" },
			),
			context({
				projectId: source.projectId,
				assetId: source.proxyStorageId,
			}),
		);
		expect(response.status).toBe(200);
		const index = JSON.parse(
			await readFile(path.join(source.mediaDirectory, "index.json"), "utf8"),
		);
		expect(index[source.assetId].proxy).toBeUndefined();
		expect(index[source.proxyStorageId]).toBeUndefined();
		await expect(
			stat(
				path.join(
					source.mediaDirectory,
					".trash",
					`${source.proxyStorageId}.mp4`,
				),
			),
		).resolves.toBeDefined();
	});

	test("replacing source bytes invalidates and removes its previous proxy", async () => {
		const source = await fixture();
		const response = await PUT(
			new Request(
				`http://localhost/api/media/${source.projectId}/${source.assetId}?ext=mp4`,
				{
					method: "PUT",
					headers: { "content-type": "video/replacement" },
					body: "replacement-source",
				},
			),
			context(source),
		);
		expect(response.status).toBe(200);
		expect(
			await readFile(
				path.join(source.mediaDirectory, `${source.assetId}.mp4`),
				"utf8",
			),
		).toBe("replacement-source");
		const index = JSON.parse(
			await readFile(path.join(source.mediaDirectory, "index.json"), "utf8"),
		);
		expect(index[source.assetId]).toMatchObject({
			ext: "mp4",
			mimeType: "video/replacement",
		});
		expect(index[source.assetId].proxy).toBeUndefined();
		expect(index[source.proxyStorageId]).toBeUndefined();
		await expect(
			stat(path.join(source.mediaDirectory, `${source.proxyStorageId}.mp4`)),
		).rejects.toThrow();
	});

	test("does not let an older cross-extension cleanup delete a newer source generation", async () => {
		const source = await fixture();
		let releaseBlocker!: () => void;
		let signalBlocked!: () => void;
		const blocked = new Promise<void>((resolve) => {
			signalBlocked = resolve;
		});
		const blocker = withMediaIndexLock({
			directory: source.mediaDirectory,
			action: async () => {
				signalBlocked();
				await new Promise<void>((resolve) => {
					releaseBlocker = resolve;
				});
			},
		});
		await blocked;
		const toMov = PUT(
			new Request(
				`http://localhost/api/media/${source.projectId}/${source.assetId}?ext=mov`,
				{ method: "PUT", body: "first-mov" },
			),
			context(source),
		);
		await Bun.sleep(10);
		const backToMp4 = PUT(
			new Request(
				`http://localhost/api/media/${source.projectId}/${source.assetId}?ext=mp4`,
				{ method: "PUT", body: "newest-mp4" },
			),
			context(source),
		);
		await Bun.sleep(10);
		releaseBlocker();
		await Promise.all([blocker, toMov, backToMp4]);

		const index = JSON.parse(
			await readFile(path.join(source.mediaDirectory, "index.json"), "utf8"),
		);
		expect(index[source.assetId].ext).toBe("mp4");
		expect(
			await readFile(
				path.join(source.mediaDirectory, `${source.assetId}.mp4`),
				"utf8",
			),
		).toBe("newest-mp4");
	});

	test("keeps index and bytes reachable when trashing fails", async () => {
		const source = await fixture();
		const trashCollision = path.join(
			source.mediaDirectory,
			".trash",
			`${source.proxyStorageId}.mp4`,
		);
		await mkdir(trashCollision, { recursive: true });
		const response = await DELETE(
			new Request(
				`http://localhost/api/media/${source.projectId}/${source.assetId}`,
				{ method: "DELETE" },
			),
			context(source),
		);

		expect(response.status).toBe(400);
		const index = JSON.parse(
			await readFile(path.join(source.mediaDirectory, "index.json"), "utf8"),
		);
		expect(index[source.assetId].proxy.storageId).toBe(source.proxyStorageId);
		expect(index[source.proxyStorageId]).toBeDefined();
		await expect(
			stat(path.join(source.mediaDirectory, `${source.proxyStorageId}.mp4`)),
		).resolves.toBeDefined();
		await expect(
			stat(path.join(source.mediaDirectory, `${source.assetId}.mp4`)),
		).resolves.toBeDefined();
	});
});
