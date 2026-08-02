export type PortableMediaMode =
	| "originals"
	| "proxies"
	| "originals-and-proxies";

export interface PortableProjectFile {
	path: string;
	sizeBytes: number;
	role: "project" | "original" | "proxy" | "captions" | "fonts";
}

export interface PortableProjectManifest {
	format: "opencut-portable";
	version: 1;
	projectId: string;
	projectName: string;
	revision: number;
	createdAt: string;
	mediaMode: PortableMediaMode;
	fonts: string[];
	captionCount: number;
	files: PortableProjectFile[];
	totalBytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parsePortableProjectManifest(
	value: unknown,
): PortableProjectManifest | null {
	if (
		!isRecord(value) ||
		value.format !== "opencut-portable" ||
		value.version !== 1 ||
		typeof value.projectId !== "string" ||
		typeof value.projectName !== "string" ||
		typeof value.revision !== "number" ||
		typeof value.createdAt !== "string" ||
		(value.mediaMode !== "originals" &&
			value.mediaMode !== "proxies" &&
			value.mediaMode !== "originals-and-proxies") ||
		!Array.isArray(value.fonts) ||
		!value.fonts.every((font) => typeof font === "string") ||
		typeof value.captionCount !== "number" ||
		!Array.isArray(value.files) ||
		typeof value.totalBytes !== "number"
	) {
		return null;
	}
	const files: PortableProjectFile[] = [];
	for (const file of value.files) {
		if (
			!isRecord(file) ||
			typeof file.path !== "string" ||
			typeof file.sizeBytes !== "number" ||
			(file.role !== "project" &&
				file.role !== "original" &&
				file.role !== "proxy" &&
				file.role !== "captions" &&
				file.role !== "fonts")
		) {
			return null;
		}
		files.push({
			path: file.path,
			sizeBytes: file.sizeBytes,
			role: file.role,
		});
	}
	return {
		format: "opencut-portable",
		version: 1,
		projectId: value.projectId,
		projectName: value.projectName,
		revision: value.revision,
		createdAt: value.createdAt,
		mediaMode: value.mediaMode,
		fonts: value.fonts,
		captionCount: value.captionCount,
		files,
		totalBytes: value.totalBytes,
	};
}

interface CompanionElement {
	id: string;
	name: string;
	type: string;
	params: Record<string, unknown>;
}

export function collectPortableProjectCompanions({
	tracks,
}: {
	tracks: Array<{
		id: string;
		type: string;
		elements: CompanionElement[];
	}>;
}): { fonts: string[]; captionCount: number } {
	const fonts = new Set<string>();
	let captionCount = 0;
	for (const track of tracks) {
		for (const element of track.elements) {
			const fontFamily = element.params.fontFamily;
			if (typeof fontFamily === "string" && fontFamily.trim()) {
				fonts.add(fontFamily.trim());
			}
			if (
				element.type === "text" &&
				(element.params["caption.enabled"] === true ||
					/^Caption(?:\s|$)/i.test(element.name))
			) {
				captionCount += 1;
			}
		}
	}
	return { fonts: [...fonts].sort(), captionCount };
}

export function buildPortableProjectManifest({
	projectId,
	projectName,
	revision,
	createdAt,
	mediaMode,
	fonts,
	captionCount,
	files,
}: Omit<
	PortableProjectManifest,
	"format" | "version" | "totalBytes"
>): PortableProjectManifest {
	return {
		format: "opencut-portable",
		version: 1,
		projectId,
		projectName,
		revision,
		createdAt,
		mediaMode,
		fonts: [...new Set(fonts)].sort(),
		captionCount,
		files,
		totalBytes: files.reduce(
			(total, file) =>
				total +
				(Number.isInteger(file.sizeBytes) && file.sizeBytes >= 0
					? file.sizeBytes
					: 0),
			0,
		),
	};
}

function isSafeArchivePath(path: string): boolean {
	return (
		path.length > 0 &&
		!path.startsWith("/") &&
		!path.includes("\\") &&
		path.split("/").every((segment) => segment !== "" && segment !== "..")
	);
}

export function validatePortableProjectManifest(
	manifest: PortableProjectManifest,
): { ok: boolean; errors: string[] } {
	const errors: string[] = [];
	if (manifest.files.some((file) => !isSafeArchivePath(file.path))) {
		errors.push("Package paths must stay inside the archive");
	}
	if (
		!manifest.files.some(
			(file) => file.path === "project.json" && file.role === "project",
		)
	) {
		errors.push("Package must contain project.json");
	}
	if (
		manifest.files.some(
			(file) => !Number.isInteger(file.sizeBytes) || file.sizeBytes < 0,
		)
	) {
		errors.push("Package file sizes must be non-negative integers");
	}
	const listedBytes = manifest.files.reduce(
		(total, file) => total + file.sizeBytes,
		0,
	);
	if (listedBytes !== manifest.totalBytes) {
		errors.push("Package byte total does not match its file entries");
	}
	return { ok: errors.length === 0, errors };
}
