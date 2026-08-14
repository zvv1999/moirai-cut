import { describe, expect, test } from "bun:test";
import { withProjectLock } from "@/server/project-lock";

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("project file lock", () => {
	test("serializes work for one project without blocking another project", async () => {
		const releaseFirst = deferred();
		const firstStarted = deferred();
		const order: string[] = [];

		const first = withProjectLock("project-a", async () => {
			order.push("first:start");
			firstStarted.resolve();
			await releaseFirst.promise;
			order.push("first:end");
		});
		await firstStarted.promise;

		const second = withProjectLock("project-a", async () => {
			order.push("second");
		});
		const independent = withProjectLock("project-b", async () => {
			order.push("independent");
		});
		await independent;
		expect(order).toEqual(["first:start", "independent"]);

		releaseFirst.resolve();
		await Promise.all([first, second]);
		expect(order).toEqual([
			"first:start",
			"independent",
			"first:end",
			"second",
		]);
	});
});
