import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const config =
	process.env.MOIRAI_FOOTAGE_CONFIG ??
	path.join(homedir(), ".moirai-cut", "footage-runtime.json");
if (!existsSync(config))
	throw new Error(`Missing ${config}. Run bun run setup:local to configure NAS/LLM and start both services.`);
const localCargo = path.join(
	homedir(),
	".cargo",
	"bin",
	process.platform === "win32" ? "cargo.exe" : "cargo",
);
const cargo =
	process.env.CARGO ?? (existsSync(localCargo) ? localCargo : "cargo");
const child = spawn(cargo, ["run", "--locked", "-p", "moirai-footage"], {
	cwd: repository,
	stdio: "inherit",
	env: { ...process.env, MOIRAI_FOOTAGE_CONFIG: config },
});
child.on("error", (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
child.on("exit", (code) => {
	process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
	process.on(signal, () => child.kill(signal));
