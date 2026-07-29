import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	JIANYING_SPEED_LABELS,
	JIANYING_SPEED_TABS,
} from "@/speed/components/speed-tab";
import {
	JIANYING_ADJUSTMENT_SECTIONS,
	JIANYING_ADJUSTMENT_TABS,
} from "../components/jianying-adjustments-tab";

describe("Jianying speed and adjustment parity", () => {
	const speedTabSource = readFileSync(
		new URL(
			"../../../../../speed/components/speed-tab.tsx",
			import.meta.url,
		),
		"utf8",
	);

	test("matches Jianying's speed hierarchy and primary copy", () => {
		expect(JIANYING_SPEED_TABS).toEqual([
			{ id: "constant", label: "常规变速" },
			{ id: "curve", label: "曲线变速" },
			{ id: "beat", label: "变速卡点" },
		]);
		expect(JIANYING_SPEED_LABELS).toEqual([
			"倍数",
			"时长",
			"声音变调",
			"智能补帧",
		]);
	});

	test("matches Jianying's constant-speed interaction contract", () => {
		expect(speedTabSource).toContain('aria-label="倍数滑杆"');
		expect(speedTabSource).toContain('aria-label="结果时长"');
		expect(speedTabSource).toContain("data-speed-reset-footer");
		expect(speedTabSource).toContain("仅对慢速片段补帧");
		expect(speedTabSource).toContain("限免");
		expect(speedTabSource).not.toContain("<SectionTitle>更多</SectionTitle>");
		expect(speedTabSource).not.toContain("<SectionTitle>源素材边界</SectionTitle>");
	});

	test("matches Jianying's adjustment hierarchy and basic sections", () => {
		expect(JIANYING_ADJUSTMENT_TABS).toEqual([
			{ id: "basic", label: "基础" },
			{ id: "hsl", label: "HSL" },
			{ id: "curve", label: "曲线" },
			{ id: "wheel", label: "色轮" },
			{ id: "mask", label: "蒙版" },
		]);
		expect(JIANYING_ADJUSTMENT_SECTIONS).toEqual([
			"智能调色",
			"色彩克隆",
			"色彩校正",
			"LUT",
			"调整",
		]);
	});
});
