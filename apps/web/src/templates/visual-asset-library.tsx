"use client";
import { useEffect, useState } from "react";
import { Check, Plus, RefreshCw, Replace } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VisualAsset } from "./asset-picker";
import "./asset-picker.css";

export function VisualAssetLibrary({ busy, onInsert, onAssetsLoaded, onReplace, replaceKind, allowShapeConversion=false, insertLabel="加入画面" }: {
	busy: boolean;
	onInsert: (id: string) => void;
	onAssetsLoaded?: (assets: VisualAsset[]) => void;
	onReplace?: (id:string)=>void;
	replaceKind?: string;
	allowShapeConversion?: boolean;
	insertLabel?: string;
}) {
	const [assets, setAssets] = useState<VisualAsset[]>([]);
	const [selected, setSelected] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [attempt, setAttempt] = useState(0);
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState("all");
	const current = assets.find((asset) => asset.id === selected);
	const convertingShape = allowShapeConversion && (replaceKind === "rectangle" || replaceKind === "ellipse");
	const visible = assets.filter((asset) => (kind === "all" || asset.kind === kind) && `${asset.name} ${asset.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);
		setError("");
		void fetch("/api/footage/templates/assets", { signal: controller.signal, cache: "no-store" })
			.then(async (response) => {
				if (!response.ok) throw new Error("素材加载失败，请重试。");
				return response.json();
			})
			.then((data: { assets: VisualAsset[] }) => {
				if (controller.signal.aborted) return;
				setAssets(data.assets);
				onAssetsLoaded?.(data.assets);
			})
			.catch((cause: unknown) => {
				if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "素材加载失败");
			})
			.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		return () => controller.abort();
	}, [attempt, onAssetsLoaded]);
	return <section aria-label="插画与图标">
		{loading && <p role="status">正在加载素材…</p>}
		{error && <p role="alert">{error}</p>}
		{!loading && !error && assets.length === 0 && <p>素材库暂无插画或图标。</p>}
		<div className="tw-visual-toolbar">
			<input aria-label="搜索插画与图标" placeholder="搜索名称或标签" value={query} onChange={(event) => setQuery(event.target.value)} />
			<select aria-label="素材类型" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">全部素材</option><option value="image">图片</option><option value="video">视频</option></select>
			<Button disabled={busy || loading || !current} onClick={() => onInsert(selected)}><Plus />{insertLabel}</Button>
			{onReplace&&<Button variant="outline" disabled={busy||loading||!current||(!convertingShape&&replaceKind!==current.kind&&replaceKind!=="visual_media")} onClick={()=>onReplace(selected)}><Replace/>{convertingShape?"用素材替换图形":"替换所选图层"}</Button>}
		</div>
		{current && <div className="tw-visual-selection">
			<strong>{current.name}</strong>
			<span>{current.width} × {current.height}</span>
			{current.kind === "video" && <video aria-label={`预览 ${current.name}`} src={`/api/footage/templates/assets/${current.id}/media`} controls muted loop playsInline preload="metadata" />}
			<details><summary>素材来源</summary><p>{current.provenance}</p></details>
		</div>}
		{!loading && !error && assets.length > 0 && visible.length === 0 && <p role="status">没有匹配的素材</p>}
		<div className="tw-visual-assets" aria-label="素材缩略图">
			{visible.map((asset) => <button key={asset.id} type="button" aria-label={`选择素材 ${asset.name}`} aria-pressed={asset.id === selected} disabled={busy} onClick={() => setSelected(asset.id)}>
				<span className="tw-visual-thumbnail">
					{asset.kind === "image" ? <img src={`/api/footage/templates/assets/${asset.id}/media`} alt="" loading="lazy" /> : <video src={`/api/footage/templates/assets/${asset.id}/media`} muted playsInline preload="metadata" />}
					{asset.id === selected && <Check size={18} />}
				</span>
				<span>{asset.name}</span><small>{asset.kind === "image" ? "图片" : "视频"} · {asset.width} × {asset.height}</small>
			</button>)}
		</div>
		{error && <Button disabled={busy || loading} onClick={() => setAttempt((value) => value + 1)}><RefreshCw />重试</Button>}
	</section>;
}
