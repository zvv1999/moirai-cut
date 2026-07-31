export async function fetchAgentSnapshot(baseUrl) {
	const response = await fetch(`${baseUrl}/api/agent/setup`, {
		signal: AbortSignal.timeout(30_000),
		cache: "no-store",
	});
	const value = await response.json().catch(() => null);
	if (!response.ok || !value || typeof value !== "object") {
		throw new Error(value?.error ?? `环境检查失败（HTTP ${response.status}）`);
	}
	return value;
}

export function printAgentSnapshot(snapshot) {
	const statusMark = (status) =>
		status === "pass" ? "✓" : status === "warning" ? "!" : "×";
	const width = Math.max(...snapshot.checks.map((check) => check.label.length));
	console.log(
		`\n智能剪辑环境 ${snapshot.score}/100 · ${
			snapshot.ready ? "浏览器模式已就绪" : "需要处理阻塞项"
		}`,
	);
	for (const check of snapshot.checks) {
		console.log(
			`  ${statusMark(check.status)}  ${check.label.padEnd(width)}  ${check.detail}`,
		);
	}
	const providers = snapshot.providers
		.filter((provider) => provider.status !== "unavailable")
		.map(
			(provider) =>
				`${provider.label} ${provider.status === "ready" ? "已登录" : "需要登录"}${
					provider.mcpInstalled ? " / MCP 已安装" : ""
				}`,
		);
	if (providers.length > 0) console.log(`\n  Agent：${providers.join("；")}`);
}
