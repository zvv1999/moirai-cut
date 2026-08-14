import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_EXT = /^[A-Za-z0-9]{1,8}$/;

export interface MediaIndexEntry extends Record<string, unknown> {
	ext: string;
	mimeType?: string;
}

export type MediaIndex = Record<string, MediaIndexEntry>;

type MediaIndexGlobals = typeof globalThis & {
	__moiraiCutMediaIndexMutations?: Map<string, Promise<void>>;
};

function mutationQueues(): Map<string, Promise<void>> {
	const globals = globalThis as MediaIndexGlobals;
	globals.__moiraiCutMediaIndexMutations ??= new Map();
	return globals.__moiraiCutMediaIndexMutations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readMediaIndex({
	directory,
	allowMissing = false,
}: {
	directory: string;
	allowMissing?: boolean;
}): Promise<MediaIndex> {
	let raw: string;
	try {
		raw = await readFile(path.join(directory, "index.json"), "utf8");
	} catch (error) {
		if (
			allowMissing &&
			error instanceof Error &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return Object.create(null) as MediaIndex;
		}
		throw error;
	}
	const parsed: unknown = JSON.parse(raw);
	if (!isRecord(parsed)) {
		throw new Error("Invalid media index");
	}
	const index = Object.create(null) as MediaIndex;
	for (const [id, entry] of Object.entries(parsed)) {
		if (
			!SAFE_ID.test(id) ||
			!isRecord(entry) ||
			typeof entry.ext !== "string" ||
			!SAFE_EXT.test(entry.ext)
		) {
			throw new Error(`Invalid media index entry: ${JSON.stringify(id)}`);
		}
		index[id] = { ...entry, ext: entry.ext };
	}
	return index;
}

async function writeMediaIndexAtomic({
	directory,
	index,
}: {
	directory: string;
	index: MediaIndex;
}): Promise<void> {
	await mkdir(directory, { recursive: true });
	const filePath = path.join(directory, "index.json");
	const temporaryPath = path.join(directory, `.index.json.${randomUUID()}.tmp`);
	try {
		await writeFile(
			temporaryPath,
			`${JSON.stringify(index, null, 2)}\n`,
			"utf8",
		);
		await rename(temporaryPath, filePath);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

export async function withMediaIndexLock<T>({
	directory,
	action,
}: {
	directory: string;
	action: () => Promise<T> | T;
}): Promise<T> {
	const key = path.resolve(directory);
	const queues = mutationQueues();
	const previous = queues.get(key) ?? Promise.resolve();
	const current = previous.then(action);
	const queued = current.then(
		() => undefined,
		() => undefined,
	);
	queues.set(key, queued);
	try {
		return await current;
	} finally {
		if (queues.get(key) === queued) {
			queues.delete(key);
		}
	}
}

export async function mutateMediaIndex<T = void>({
	directory,
	allowMissing = false,
	update,
	onWriteError,
}: {
	directory: string;
	allowMissing?: boolean;
	update: (index: MediaIndex) => Promise<T> | T;
	onWriteError?: () => Promise<void> | void;
}): Promise<T> {
	return withMediaIndexLock({
		directory,
		action: async () => {
			const index = await readMediaIndex({ directory, allowMissing });
			const result = await update(index);
			try {
				await writeMediaIndexAtomic({ directory, index });
			} catch (error) {
				try {
					await onWriteError?.();
				} catch (rollbackError) {
					throw new AggregateError(
						[error, rollbackError],
						"Media index write and file rollback both failed",
					);
				}
				throw error;
			}
			return result;
		},
	});
}
