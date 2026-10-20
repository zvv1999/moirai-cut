// Browser readiness is a platform concern. Rust retains batch/job ownership.
// open_editor reuses the same project tab and already waits for readiness;
// retry only its explicit "still loading" result, never export mutations.
export async function callRendererTool(client, name, args, { onReadinessRetry } = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 90_000 });
    const text = response.content.find(content => content.type === "text")?.text;
    let payload;
    try { payload = JSON.parse(text); } catch {
      throw new Error(`${name}: invalid tool response`);
    }
    if (!response.isError) return payload;
    if (name === "open_editor" && payload?.code === "editor_not_ready" && attempt < 3) {
      onReadinessRetry?.({ projectId: args.projectId, attempt, code: payload.code });
      continue;
    }
    const error = new Error(`${name}: ${text}`);
    error.code = payload?.code;
    throw error;
  }
}
