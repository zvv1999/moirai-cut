"use client";
import { useState } from "react";
import "./asset-picker.css";

export interface VisualAsset {
	id: string;
	name: string;
	kind: "image" | "video";
	width: number;
	height: number;
	tags: string[];
	provenance: string;
}

export function AssetPicker({
	label,
	assets,
	value,
	onChange,
	emptyLabel = "使用模板默认素材",
	disabled = false,
}: {
	label: string;
	assets: VisualAsset[];
	value: string;
	onChange: (id: string) => void;
	emptyLabel?: string;
	disabled?: boolean;
}) {
	const [query, setQuery] = useState("");
	const current = assets.find((asset) => asset.id === value);
	return (
		<details className="tp-asset-picker">
			<summary>
				{label} · {current?.name ?? (value ? "当前素材未在库中找到" : emptyLabel)}
			</summary>
			<input
				aria-label={`搜索${label}`}
				placeholder="搜索素材名称或标签"
				value={query}
				disabled={disabled}
				onChange={(event) => setQuery(event.target.value)}
			/>
			<select
				aria-label={label}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
			>
				<option value="">{emptyLabel}</option>
				{value && !current && <option value={value}>当前素材未在库中找到</option>}
				{assets
					.filter(
						(asset) =>
							asset.id === value ||
							`${asset.name} ${asset.tags.join(" ")}`
								.toLowerCase()
								.includes(query.toLowerCase()),
					)
					.map((asset) => (
						<option key={asset.id} value={asset.id}>
							{asset.name} · {asset.width} × {asset.height}
						</option>
					))}
			</select>
			{current && (
				<figure className="tp-asset-preview">
					{current.kind === "image" ? (
						<img
							src={`/api/footage/templates/assets/${current.id}/media`}
							alt={current.name}
						/>
					) : (
						<video
							src={`/api/footage/templates/assets/${current.id}/media`}
							controls
							muted
							loop
							playsInline
							preload="metadata"
						/>
					)}
					<figcaption>
						{current.tags.join(" · ")}
						<details>
							<summary>素材来源</summary>
							<p>{current.provenance}</p>
						</details>
					</figcaption>
				</figure>
			)}
		</details>
	);
}
