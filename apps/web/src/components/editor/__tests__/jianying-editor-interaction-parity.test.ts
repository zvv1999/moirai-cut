import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relativePath: string): string {
	return readFileSync(
		fileURLToPath(new URL(relativePath, import.meta.url)),
		"utf8",
	);
}

describe("Jianying editor interaction parity", () => {
	test("opens a media double-click in the central preview instead of a modal", () => {
		const assetsSource = readSource(
			"../panels/assets/views/assets.tsx",
		);
		const previewSource = readSource("../../../preview/components/index.tsx");

		expect(assetsSource).toContain("openSourcePreview");
		expect(assetsSource).not.toContain("<SourceMonitorDialog");
		expect(previewSource).toContain("<SourcePreviewPanel");
	});

	test("uses unambiguous Chinese timeline menu copy", () => {
		const timelineSource = readSource(
			"../../../timeline/components/timeline-element.tsx",
		);

		for (const label of ["创建副本", "隐藏", "显示", "删除素材"]) {
			expect(timelineSource).toContain(label);
		}
		for (const label of ['"Hide"', '"Show"', "`Delete "]) {
			expect(timelineSource).not.toContain(label);
		}
	});
});
