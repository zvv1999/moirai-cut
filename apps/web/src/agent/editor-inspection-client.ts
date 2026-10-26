import type { EditorCore } from "@/core";

/** Read-only transport for browsers without a Chrome debugging port. */
export function serveEditorInspections(editor: EditorCore, projectId: string) {
	let disposed = false;
	let timer: ReturnType<typeof setTimeout>;
	const controller = new AbortController();
	const poll = async () => {
		try {
			const response = await fetch(
				`/api/editor-inspection?projectId=${encodeURIComponent(projectId)}`,
				{ signal: controller.signal },
			);
			const { job } = await response.json();
			if (job && !disposed) {
				let result;
				try {
					if (editor.project.getActiveOrNull()?.metadata.id !== projectId)
						throw new Error("Active project changed");
					const data =
						job.method === "getState"
							? editor.agent.getState()
							: job.method === "renderFrames"
								? await editor.agent.renderFrames(job.args)
								: null;
					if (
						!data ||
						editor.project.getActiveOrNull()?.metadata.id !== projectId
					)
						throw new Error("Invalid inspection or project changed");
					result = { ok: true, data };
				} catch (error) {
					result = {
						ok: false,
						error: {
							code: "editor_inspection_failed",
							message: error instanceof Error ? error.message : String(error),
						},
					};
				}
				if (!disposed)
					await fetch("/api/editor-inspection", {
						method: "PATCH",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							projectId,
							id: job.id,
							token: job.token,
							result,
						}),
						signal: controller.signal,
					});
			}
		} catch {
			/* The next poll reconnects after a server restart. */
		}
		if (!disposed) timer = setTimeout(poll, 1000);
	};
	void poll();
	return () => {
		disposed = true;
		controller.abort();
		clearTimeout(timer);
	};
}
