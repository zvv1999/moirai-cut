import { afterEach, expect, spyOn, test } from "bun:test";
import { EditorCore } from "@/core";
import type { SceneTracks, TimelineElement } from "@/timeline";
import { DuplicateElementsCommand } from "../duplicate-elements";

const originalFetch = globalThis.fetch;
let restoreEditor: (() => void) | undefined;
afterEach(() => { globalThis.fetch = originalFetch; restoreEditor?.(); });

function fixture() {
	const scene = { id: "scene", tracks: {
		main: { id: "main", type: "video", elements: [] }, audio: [],
		overlay: [
			{ id: "text-track", type: "text", elements: [{ id: "text", type: "text", name: "重点", startTime: 0, duration: 120000, params: { content: "重点" } }] },
			{ id: "icon-track", type: "graphic", elements: [{ id: "icon", type: "graphic", name: "装饰", startTime: 0, duration: 120000, params: {}, textAttachment: { parent: { elementId: "text", trackId: "text-track", groupPath: [] }, anchor: [1, 0.5] } }] },
		],
	} as unknown as SceneTracks };
	let projectId = "project";
	const editor = {
		scenes: { getActiveScene: () => scene },
		project: { getActiveOrNull: () => ({ metadata: { id: projectId } }) },
		timeline: { updateTracks: (tracks: SceneTracks) => { scene.tracks = tracks; } },
	};
	const spy = spyOn(EditorCore, "getInstance").mockReturnValue(editor as unknown as EditorCore);
	restoreEditor = () => spy.mockRestore();
	const command = new DuplicateElementsCommand({ elements: [{ trackId: "text-track", elementId: "text" }, { trackId: "icon-track", elementId: "icon" }] });
	return { scene, command, switchProject: () => { projectId = "other"; } };
}

test("native prepared copies are applied together, detached from originals, and survive undo/redo", async () => {
	const { scene, command } = fixture();
	const original = structuredClone(scene.tracks);
	let requests = 0;
	globalThis.fetch = (async (_url, init) => {
		requests++;
		const { copies } = JSON.parse(init!.body as string);
		expect(copies[0].source.elementId).toBe("text");
		expect(copies[1].source.elementId).toBe("icon");
		copies[1].element.textAttachment.parent = copies[0].destination;
		return Response.json({ elements: copies.map((copy: { element: unknown }) => copy.element) });
	}) as typeof fetch;
	await command.prepare();
	expect(scene.tracks).toEqual(original);
	command.execute();
	const applied = structuredClone(scene.tracks);
	const selected = command.getDuplicatedElements();
	const copiedIcon = scene.tracks.overlay.flatMap<TimelineElement>(track => track.elements).find(element => element.id === selected[1].elementId)!;
	expect(copiedIcon.textAttachment!.parent).toEqual({ ...selected[0], groupPath: [] });
	expect(scene.tracks.overlay.find(track => track.id === "icon-track")!.elements[0].textAttachment!.parent.elementId).toBe("text");
	command.undo();
	expect(scene.tracks).toEqual(original);
	command.redo();
	expect(scene.tracks).toEqual(applied);
	expect(requests).toBe(1);
});

test("service failure never mutates the scene and unprepared attachment copy fails explicitly", async () => {
	const { scene, command } = fixture();
	const original = structuredClone(scene.tracks);
	globalThis.fetch = (async () => Response.json({ error: "Unavailable" }, { status: 503 })) as unknown as typeof fetch;
	await expect(command.prepare()).rejects.toThrow("Unavailable");
	expect(() => command.execute()).toThrow("原生引用准备");
	command.undo();
	expect(scene.tracks).toEqual(original);
});

test("pending copy cannot overwrite an intervening edit or another project", async () => {
	for (const change of ["edit", "project"]) {
		const { scene, command, switchProject } = fixture();
		let release!: () => void;
		globalThis.fetch = (async (_url, init) => {
			await new Promise<void>(resolve => { release = resolve; });
			const { copies } = JSON.parse(init!.body as string);
			return Response.json({ elements: copies.map((copy: { element: unknown }) => copy.element) });
		}) as typeof fetch;
		const pending = command.prepare();
		if (change === "edit") scene.tracks.main.name = "Human edit";
		else switchProject();
		release(); await pending;
		const current = structuredClone(scene.tracks);
		expect(() => command.execute()).toThrow("工程已改变");
		command.undo();
		expect(scene.tracks).toEqual(current);
		restoreEditor?.();
	}
});
