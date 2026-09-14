"use client";

import type { Shot, ShotDetails } from "./types";

export const EMPTY_SHOT_DETAILS: ShotDetails = {
	subject: "",
	action: "",
	scene: "",
	composition: "",
	camera: "",
	mood: "",
};

const DETAIL_FIELDS: { key: keyof ShotDetails; label: string }[] = [
	{ key: "subject", label: "主体" },
	{ key: "action", label: "动作" },
	{ key: "scene", label: "场景" },
	{ key: "composition", label: "构图" },
	{ key: "camera", label: "镜头" },
	{ key: "mood", label: "氛围" },
];

export function ShotMetadata({
	shot,
	holidays,
	onChange,
}: {
	shot: Shot;
	holidays: string[];
	onChange: (patch: Partial<Shot>) => void;
}) {
	const details = { ...EMPTY_SHOT_DETAILS, ...shot.details };
	const selected = shot.holidayTags ?? [];
	const options = [...new Set([...holidays, ...selected])];
	return (
		<>
			<div className="footage-manual-flags" role="group" aria-label="素材属性">
				<label>
					<input
						type="checkbox"
						checked={shot.keepOriginalAudio ?? false}
						onChange={(e) => onChange({ keepOriginalAudio: e.target.checked })}
					/>
					保留原声
				</label>
				<label>
					<input
						type="checkbox"
						checked={shot.isFeatured ?? false}
						onChange={(e) => onChange({ isFeatured: e.target.checked })}
					/>
					精选素材
				</label>
				<label>
					<input
						type="checkbox"
						checked={shot.hasHoliday ?? false}
						onChange={(e) =>
							onChange({
								hasHoliday: e.target.checked,
								holidayTags: e.target.checked ? selected : [],
							})
						}
					/>
					有节日属性
				</label>
			</div>
			{shot.hasHoliday && (
				<div
					className="footage-tag-selection-group"
					role="group"
					aria-label="节日标签选择"
				>
					<h4>节日</h4>
					<div className="footage-tag-options">
						{options.length === 0 && (
							<span className="footage-subtle">暂无节日标签</span>
						)}
						{options.map((tag) => (
							<label key={tag}>
								<input
									type="checkbox"
									checked={selected.includes(tag)}
									onChange={(e) =>
										onChange({
											holidayTags: e.target.checked
												? [...selected, tag]
												: selected.filter((value) => value !== tag),
										})
									}
								/>
								{tag}
							</label>
						))}
					</div>
				</div>
			)}
			<div
				className="footage-detail-descriptions"
				role="group"
				aria-label="细节描述"
			>
				<div className="footage-detail-description-grid">
					{DETAIL_FIELDS.map(({ key, label }) => (
						<label key={key}>
							{label}
							<textarea
								rows={2}
								value={details[key]}
								onChange={(e) =>
									onChange({ details: { ...details, [key]: e.target.value } })
								}
							/>
						</label>
					))}
				</div>
			</div>
		</>
	);
}
