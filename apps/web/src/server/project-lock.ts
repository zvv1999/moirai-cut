const projectQueues = new Map<string, Promise<unknown>>();

/**
 * Serialize every filesystem operation that requires one stable project
 * revision. Writers and derived-artifact publishers must share this lock; a
 * private queue in either route leaves a check-to-publish race between them.
 */
export function withProjectLock<T>(
	projectId: string,
	work: () => Promise<T>,
): Promise<T> {
	const previous = projectQueues.get(projectId) ?? Promise.resolve();
	const next = previous.then(work, work);
	const tail = next.catch(() => undefined);
	projectQueues.set(projectId, tail);
	void tail.finally(() => {
		if (projectQueues.get(projectId) === tail) {
			projectQueues.delete(projectId);
		}
	});
	return next;
}
