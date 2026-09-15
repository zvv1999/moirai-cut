import {
	existsSync,
	readFileSync,
	mkdirSync,
	writeFileSync,
	chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";

const file =
	process.env.MOIRAI_FOOTAGE_CONFIG ||
	path.join(homedir(), ".moirai-cut/footage-team.json");
if (!process.stdin.isTTY) throw Error("团队配置需要交互终端。");
const old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
if (old.dataDir && !old.serverUrl)
	throw Error("该文件已有单机配置。请使用另一个 MOIRAI_FOOTAGE_CONFIG 路径。");
const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(label, value) {
	return (await rl.question(`${label} [${value}]: `)).trim() || value;
}
try {
	const serverUrl = await ask(
		"团队 API 地址（HTTPS 或本机 SSH 隧道）",
		old.serverUrl || "http://127.0.0.1:14318",
	);
	const url = new URL(serverUrl);
	if (
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		!(
			url.protocol === "https:" ||
			(url.protocol === "http:" &&
				["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
		)
	)
		throw Error("地址必须是 HTTPS 或本机隧道，且不能包含凭据。");
	const serverTokenFile = await ask(
		"管理员提供的服务令牌文件绝对路径（不要输入令牌内容）",
		old.serverTokenFile || "",
	);
	if (!path.isAbsolute(serverTokenFile) || !existsSync(serverTokenFile))
		throw Error("请先通过安全连接获取令牌文件。");
	const dataDir = await ask(
		"本地 Worker 缓存绝对路径",
		old.dataDir || path.join(homedir(), ".moirai-cut/team-worker"),
	);
	if (!path.isAbsolute(dataDir)) throw Error("缓存路径必须是本机绝对路径。");
	const port = Number(await ask("本地 Worker 端口", String(old.port || 14319)));
	if (!Number.isInteger(port) || port < 1024 || port > 65535)
		throw Error("端口无效。");
	const bundled = path.join(homedir(), ".local/share/moirai-cut/bin");
	const config = {
		serverUrl,
		serverTokenFile,
		dataDir,
		workerId: old.workerId || randomUUID(),
		port,
		ffmpeg:
			old.ffmpeg ||
			(existsSync(path.join(bundled, "ffmpeg"))
				? path.join(bundled, "ffmpeg")
				: "ffmpeg"),
		ffprobe:
			old.ffprobe ||
			(existsSync(path.join(bundled, "ffprobe"))
				? path.join(bundled, "ffprobe")
				: "ffprobe"),
	};
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
	chmodSync(file, 0o600);
	console.log(
		`团队配置：${file}\n启动时将 MOIRAI_FOOTAGE_CONFIG 指向此文件，执行 bun run setup:local。\n本机 LLM 可用 bun run setup:footage 配置；API Key 仅在隐藏终端提示中输入。`,
	);
} finally {
	rl.close();
}
