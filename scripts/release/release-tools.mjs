import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function componentKey(component) {
	return `${component.type}:${component.purl}`;
}

function npmPurl(name, version) {
	return `pkg:npm/${name.replace(/^@/, "%40")}@${version}`;
}

function flattenBunTree(node, components = []) {
	for (const [name, value] of Object.entries(node?.dependencies ?? {})) {
		if (!value?.version) continue;
		const packageName = value.name ?? name;
		components.push({
			type: "library",
			name: packageName,
			version: value.version,
			purl: npmPurl(packageName, value.version),
		});
		flattenBunTree(value, components);
	}
	return components;
}

export function parseBunList(output) {
	const dependencies = {};
	const matches = output.matchAll(
		/(?:^|\s)((?:@[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+|[a-zA-Z0-9_.-]+)@([0-9][^\s]*))/gm,
	);
	for (const match of matches) {
		const packageAndVersion = match[1];
		const separator = packageAndVersion.lastIndexOf("@");
		const name = packageAndVersion.slice(0, separator);
		const version = packageAndVersion.slice(separator + 1);
		dependencies[`${name}@${version}`] = { name, version };
	}
	return {
		dependencies: Object.fromEntries(
			Object.values(dependencies).map(({ name, version }) => [
				`${name}@${version}`,
				{ name, version },
			]),
		),
	};
}

export function parseCargoPackages(lockfile) {
	const records = lockfile.split(/\n(?=\[\[package\]\])/g);
	return records.flatMap((record) => {
		const name = record.match(/^name = "([^"]+)"/m)?.[1];
		const version = record.match(/^version = "([^"]+)"/m)?.[1];
		if (!name || !version) return [];
		const checksum = record.match(/^checksum = "([^"]+)"/m)?.[1];
		return [{ name, version, ...(checksum ? { checksum } : {}) }];
	});
}

export function buildCycloneDx({
	root,
	bunTree,
	cargoPackages,
	serialNumber = `urn:uuid:${randomUUID()}`,
	timestamp = new Date().toISOString(),
}) {
	const npmComponents = flattenBunTree(bunTree).map((component) => {
		const source = component.name.includes("@")
			? component.name.slice(0, component.name.lastIndexOf("@"))
			: component.name;
		return { ...component, name: source || component.name };
	});
	const cargoComponents = cargoPackages.map((cargoPackage) => ({
		type: "library",
		name: cargoPackage.name,
		version: cargoPackage.version,
		purl: `pkg:cargo/${cargoPackage.name}@${cargoPackage.version}`,
		...(cargoPackage.checksum
			? {
					hashes: [
						{ alg: "SHA-256", content: cargoPackage.checksum },
					],
				}
			: {}),
	}));
	const components = Array.from(
		new Map(
			[...npmComponents, ...cargoComponents].map((component) => [
				componentKey(component),
				component,
			]),
		).values(),
	).sort((left, right) => left.purl.localeCompare(right.purl));

	return {
		bomFormat: "CycloneDX",
		specVersion: "1.5",
		serialNumber,
		version: 1,
		metadata: {
			timestamp,
			component: {
				type: "application",
				name: root.name,
				version: root.version,
				purl: npmPurl(root.name, root.version),
			},
		},
		components,
	};
}

export function findSensitiveTrackedPaths(paths) {
	return paths.flatMap((path) => {
		if (
			/(^|\/)\.env(?:\.|$)/.test(path) &&
			!path.endsWith(".env.example") &&
			!path.endsWith(".env.sample")
		) {
			return [{ path, reason: "environment file" }];
		}
		if (/^docs\/reports\//.test(path) && /\.(png|jpe?g|gif|webp|mp4|mov)$/i.test(path)) {
			return [{ path, reason: "private acceptance-report media" }];
		}
		if (/\.(pem|key|p12|pfx)$/i.test(path)) {
			return [{ path, reason: "private key or certificate" }];
		}
		return [];
	});
}

export function isPublicSnapshotPath(path) {
	if (path === ".codex/config.toml") return true;
	return ![
		"docs/reports/",
		"director-agent/",
		"artifacts/",
		".codex/",
		".cursor/",
	].some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

export async function sha256File(path) {
	const contents = await readFile(path);
	return createHash("sha256").update(contents).digest("hex");
}

export async function writeSbom({ rootDir, outputPath }) {
	const [root, cargoLock, bunList] = await Promise.all([
		readFile(resolve(rootDir, "package.json"), "utf8").then(JSON.parse),
		readFile(resolve(rootDir, "Cargo.lock"), "utf8"),
		Bun.$`bun pm ls --all`.cwd(rootDir).text(),
	]);
	const document = buildCycloneDx({
		root,
		bunTree: parseBunList(bunList),
		cargoPackages: parseCargoPackages(cargoLock),
	});
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
	return { outputPath, components: document.components.length };
}
