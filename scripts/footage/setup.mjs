import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	renameSync,
	chmodSync,
	openSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

const repository = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const home = homedir();
const configPath =
	process.env.MOIRAI_FOOTAGE_CONFIG ||
	path.join(home, ".moirai-cut/footage-runtime.json");
const configure = process.argv.includes("--configure");
const local = process.argv.includes("--local");
const configOnly = process.argv.includes("--config-only");

function savePrivate(file, value) {
	mkdirSync(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
		mode: 0o600,
	});
	renameSync(temporary, file);
	chmodSync(file, 0o600);
}

function binary(name, override) {
	const bundled = path.join(home, ".local/share/moirai-cut/bin", name);
	const cargo = path.join(
		home,
		".cargo/bin",
		process.platform === "win32" ? "cargo.exe" : "cargo",
	);
	const command =
		override ||
		(name === "cargo" && existsSync(cargo)
			? cargo
			: existsSync(bundled)
				? bundled
				: name);
	const result = spawnSync(
		command,
		[name === "cargo" ? "--version" : "-version"],
		{ encoding: "utf8" },
	);
	if (result.status !== 0)
		throw new Error(
			`缺少可用的 ${name}。请安装 Rust (https://rustup.rs) 和 FFmpeg/ffprobe，并加入 PATH 后重试。`,
		);
	return command;
}

export async function setup() {
	let config = existsSync(configPath)
		? JSON.parse(readFileSync(configPath, "utf8"))
		: null;
	if (!config || configure) {
		if (!process.stdin.isTTY && !local)
			throw new Error(
				"首次启动需要交互终端配置 NAS 和 LLM；无人值守本地模式请显式传入 --local。",
			);
		config ??= { dataDir: path.join(home, ".moirai-cut/footage"), port: 4318 };
		if (!local) {
			let muted = false;
			const output = new Writable({
				write(chunk, encoding, callback) {
					if (!muted) process.stdout.write(chunk, encoding);
					callback();
				},
			});
			const rl = createInterface({
				input: process.stdin,
				output,
				terminal: true,
			});
			try {
				const nas = (
					await rl.question("是否配置团队 NAS？[y/N，回车保留已有配置] ")
				)
					.trim()
					.toLowerCase();
				if (nas === "y" || nas === "yes") {
					const root = (
						await rl.question("已挂载 NAS 的素材库绝对路径：")
					).trim();
					if (!path.isAbsolute(root))
						throw new Error(
							"NAS 路径必须是绝对路径。请先挂载共享目录，不要填写 smb:// 地址。",
						);
					config.nasRoot = root;
					config.requireSmb = true;
				}
				const llm = (
					await rl.question(
						"是否配置素材识别 LLM 端点？[y/N，跳过则保留或复用当前端点] ",
					)
				)
					.trim()
					.toLowerCase();
				if (llm === "y" || llm === "yes") {
					const baseUrl = (
						await rl.question(
							"兼容 chat/completions 且支持视频的 Base URL（含 /v1）：",
						)
					)
						.trim()
						.replace(/\/+$/, "");
					const url = new URL(baseUrl);
					if (
						!["http:", "https:"].includes(url.protocol) ||
						url.username ||
						url.password ||
						url.search ||
						url.hash
					)
						throw new Error("端点必须为不含凭据、查询参数的 HTTP(S) URL。");
					process.stdout.write("API Key（输入隐藏）：");
					muted = true;
					const apiKey = (await rl.question("")).trim();
					muted = false;
					process.stdout.write("\n");
					if (!apiKey) throw new Error("API Key 不能为空。");
					savePrivate(path.join(home, ".moirai-cut/footage-endpoint.json"), {
						baseUrl,
						apiKey,
					});
				}
			} finally {
				rl.close();
			}
		}
		config.ffmpeg = binary("ffmpeg", config.ffmpeg || process.env.FFMPEG_PATH);
		config.ffprobe = binary(
			"ffprobe",
			config.ffprobe || process.env.FFPROBE_PATH,
		);
		savePrivate(configPath, config);
	}
	if (!path.isAbsolute(config.dataDir))
		throw new Error("dataDir 必须是本地绝对路径。");
	binary("ffmpeg", config.ffmpeg);
	binary("ffprobe", config.ffprobe);
	console.log(
		"素材库配置已就绪。NAS 同步默认关闭，可在工作台开启；LLM 模型可在工作台选择，未配置端点时可使用本地导入和人工审核。",
	);
	if (configOnly) return;
	const tokenPath = path.join(config.dataDir, "service-token");
	async function ready() {
		try {
			const response = await fetch(`http://127.0.0.1:${config.port}/state`, {
				headers: { "x-footage-token": readFileSync(tokenPath, "utf8").trim() },
				signal: AbortSignal.timeout(2000),
			});
			return (
				response.ok &&
				(await response.json()).runtime?.localRoot === config.dataDir
			);
		} catch {
			return false;
		}
	}
	if (await ready()) {
		console.log("已复用运行中的素材库服务。");
		return;
	}
	const cargo = binary("cargo", process.env.CARGO);
	console.log("正在构建素材库服务，首次编译可能需要数分钟…");
	const build = spawnSync(
		cargo,
		["build", "--locked", "-p", "moirai-footage"],
		{ cwd: repository, stdio: "inherit" },
	);
	if (build.status !== 0)
		throw new Error("Rust 构建失败，请修复上方依赖错误后重试。");
	const metadata = spawnSync(
		cargo,
		["metadata", "--no-deps", "--format-version", "1"],
		{ cwd: repository, encoding: "utf8" },
	);
	if (metadata.status !== 0) throw new Error("无法获取 Rust 构建目录。");
	const target = JSON.parse(metadata.stdout).target_directory;
	mkdirSync(config.dataDir, { recursive: true });
	const logPath = path.join(config.dataDir, "service.log");
	const log = openSync(logPath, "a", 0o600);
	const child = spawn(
		path.join(
			target,
			"debug",
			process.platform === "win32" ? "moirai-footage.exe" : "moirai-footage",
		),
		[],
		{
			cwd: repository,
			detached: true,
			stdio: ["ignore", log, log],
			env: { ...process.env, MOIRAI_FOOTAGE_CONFIG: configPath },
		},
	);
	let failure;
	child.on("error", (error) => {
		failure = error;
	});
	child.unref();
	for (let attempt = 0; attempt < 60; attempt++) {
		if (failure || child.exitCode !== null) break;
		if (await ready()) {
			console.log(`素材库服务已启动。日志：${logPath}`);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(
		`素材库启动失败或端口 ${config.port} 被占用，请查看 ${logPath}`,
	);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	setup().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
