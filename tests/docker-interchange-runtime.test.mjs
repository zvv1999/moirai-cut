import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { describe, expect, test } from "bun:test";

const dockerfile = readFileSync(
	new URL("../apps/web/Dockerfile", import.meta.url),
	"utf8",
);
const workflow = readFileSync(
	new URL("../.github/workflows/bun-ci.yml", import.meta.url),
	"utf8",
);
const smokeScriptUrl = new URL(
	"../scripts/ci/interchange-docker-http-smoke.sh",
	import.meta.url,
);
const smokeScript = existsSync(smokeScriptUrl)
	? readFileSync(smokeScriptUrl, "utf8")
	: "";

describe("web production image interchange runtime", () => {
	test("builds the Rust CLI in an independently pinned stage", () => {
		expect(dockerfile).toMatch(
			/^FROM rust:1\.93\.1-alpine AS interchange-builder$/m,
		);
		expect(dockerfile).toMatch(
			/^RUN cargo build --locked --release -p interchange --bin moirai-interchange$/m,
		);
	});

	test("installs the CLI in the runner and makes its path explicit", () => {
		expect(dockerfile).toMatch(
			/^COPY --from=interchange-builder --chown=nextjs:nodejs \/app\/target\/release\/moirai-interchange \/usr\/local\/bin\/moirai-interchange$/m,
		);
		expect(dockerfile).toMatch(
			/^ENV MOIRAI_INTERCHANGE_BIN="\/usr\/local\/bin\/moirai-interchange"$/m,
		);
	});

	test("does not bake optional hosted-service credentials into the build image", () => {
		for (const name of [
			"DATABASE_URL",
			"BETTER_AUTH_SECRET",
			"UPSTASH_REDIS_REST_URL",
			"UPSTASH_REDIS_REST_TOKEN",
			"MARBLE_WORKSPACE_KEY",
			"FREESOUND_CLIENT_ID",
			"FREESOUND_API_KEY",
		]) {
			expect(dockerfile).not.toMatch(
				new RegExp(`^(?:ARG|ENV) ${name}(?:=|$)`, "m"),
			);
		}
	});
});

describe("production image FCPXML HTTP smoke", () => {
	test("runs only for Ubuntu CI and delegates to a checked-in script", () => {
		expect(workflow).toMatch(
			/- name: Smoke-test production FCPXML handoff image\s+if: runner\.os == 'Linux'\s+run: sh scripts\/ci\/interchange-docker-http-smoke\.sh/,
		);
		expect(smokeScript).not.toBe("");
	});

	test("exercises the HTTP API and downloads both handoff artifacts", () => {
		expect(smokeScript).toContain("docker build --file apps/web/Dockerfile");
		expect(smokeScript).toContain("/api/interchange/ci-interchange/fcpxml");
		expect(smokeScript).toContain("downloadUrl");
		expect(smokeScript).toContain("reportDownloadUrl");
		expect(smokeScript).toContain("value.data?.name");
		expect(smokeScript).toContain("value.data?.reportName");
		expect(smokeScript).toContain('exports/$xml_name');
		expect(smokeScript).toContain('exports/$report_name');
		expect(smokeScript).toContain('chmod -R a+rwX "$project_root"');
	});

	test("keeps the smoke script POSIX-shell parseable without running Docker", () => {
		const result = spawnSync("sh", ["-n", smokeScriptUrl.pathname], {
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
	});
});
