import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

// This adapter only transports HTTP to the native Rust service.
export async function proxyFootage(request: Request, segments: string[]) {
	const url = new URL(request.url);
	const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
	// Next may use its internal hostname in request.url; Host is the browser's authority.
	const host = request.headers.get("host") ?? url.host;
	let publicUrl: URL;
	try {
		publicUrl = new URL(`${url.protocol}//${host}`);
		if (publicUrl.host !== host || publicUrl.username || publicUrl.password) {
			throw new Error("Invalid host");
		}
	} catch {
		return Response.json({ error: "无效主机地址。" }, { status: 403 });
	}
	if (!localHosts.has(url.hostname) || !localHosts.has(publicUrl.hostname)) {
		return Response.json(
			{ error: "素材库服务当前仅允许本机访问。" },
			{ status: 403 },
		);
	}
	const origin = request.headers.get("origin");
	if (origin && origin !== publicUrl.origin) {
		return Response.json({ error: "请求来源不匹配。" }, { status: 403 });
	}
	if (
		request.method !== "GET" &&
		request.method !== "HEAD" &&
		request.headers.get("x-requested-with") !== "moirai-footage"
	) {
		return Response.json({ error: "缺少素材库请求标识。" }, { status: 403 });
	}
	if (segments.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))) {
		return Response.json({ error: "无效路径。" }, { status: 400 });
	}
	try {
		const configPath =
			process.env.MOIRAI_FOOTAGE_CONFIG ??
			path.join(homedir(), ".moirai-cut", "footage-runtime.json");
		const config = JSON.parse(await readFile(configPath, "utf8")) as {
			dataDir: string;
			port: number;
		};
		const token = await readFile(
			path.join(config.dataDir, "service-token"),
			"utf8",
		);
		const headers = new Headers({ "x-footage-token": token.trim() });
		for (const name of ["content-type", "range"]) {
			const value = request.headers.get(name);
			if (value) headers.set(name, value);
		}
		const init: RequestInit & { duplex?: "half" } = {
			method: request.method,
			headers,
			cache: "no-store",
			signal: request.signal,
		};
		if (request.method !== "GET" && request.method !== "HEAD") {
			init.body = request.body;
			init.duplex = "half";
		}
		const response = await fetch(
			`http://127.0.0.1:${config.port}/${segments.join("/")}${url.search}`,
			init,
		);
		const responseHeaders = new Headers();
		for (const name of [
			"content-type",
			"content-length",
			"content-range",
			"accept-ranges",
		]) {
			const value = response.headers.get(name);
			if (value) responseHeaders.set(name, value);
		}
		responseHeaders.set("cache-control", "private, no-store");
		return new Response(response.body, {
			status: response.status,
			headers: responseHeaders,
		});
	} catch {
		return Response.json(
			{ error: "素材库服务未连接。请启动 Rust 素材库服务。" },
			{ status: 503 },
		);
	}
}
