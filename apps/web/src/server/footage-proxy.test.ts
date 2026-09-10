import { expect, test } from "bun:test";
import { proxyFootage } from "./footage-proxy";

const check = (host: string, origin: string, marker = "moirai-footage") =>
	proxyFootage(
		new Request("http://localhost:3000/api/footage/invalid", {
			method: "POST",
			headers: { host, origin, "x-requested-with": marker },
		}),
		["invalid/path"],
	);

test("accepts the browser loopback authority despite Next's internal hostname", async () => {
	for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000"]) {
		// Invalid segments return 400 only after the request passes origin validation.
		expect((await check(host, `http://${host}`)).status).toBe(400);
	}
});

test("rejects external hosts, different origins and missing mutation markers", async () => {
	for (const [host, origin, marker] of [
		["evil.example:3000", "http://evil.example:3000", "moirai-footage"],
		["127.0.0.1:3000", "http://evil.example:3000", "moirai-footage"],
		["127.0.0.1:3000", "http://127.0.0.1:3001", "moirai-footage"],
		["127.0.0.1:3000", "http://localhost:3000", "moirai-footage"],
		["127.0.0.1:3000", "null", "moirai-footage"],
		["127.0.0.1:3000", "http://127.0.0.1:3000", ""],
		["localhost:3000/evil", "http://localhost:3000", "moirai-footage"],
	]) {
		expect((await check(host, origin, marker)).status).toBe(403);
	}
});
