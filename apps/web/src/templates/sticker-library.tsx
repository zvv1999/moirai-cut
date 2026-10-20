"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Template } from "./types";

type Sticker = { id: string; provenance: string; recipe: { name: string; tags: string[]; assetId: string; previewAssetId: string } };
export function StickerLibrary({ template, busy, api, run, onChange }: {
	template: Template;
	busy: boolean;
	api: <T>(path: string, body?: unknown) => Promise<T>;
	run: (task: () => Promise<void>) => Promise<void>;
	onChange: (template: Template) => void;
}) {
	const [stickers, setStickers] = useState<Sticker[]>([]);
	const [query, setQuery] = useState("");
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let live = true;
		setLoading(true); setError("");
		void api<{ stickers: Sticker[] }>("/stickers").then((data) => { if (live) setStickers(data.stickers); })
			.catch((e) => { if (live) setError(String(e)); }).finally(() => { if (live) setLoading(false); });
		return () => { live = false; };
	}, [api, attempt]);
	const filtered = stickers.filter((s) => `${s.recipe.name} ${s.recipe.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
	return <section aria-label="动画贴纸库">
		<label>搜索动画贴纸<input aria-label="搜索动画贴纸" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
		{loading && <p>正在加载贴纸…</p>}
		{error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(attempt + 1)}><RefreshCw />重新加载</Button></div>}
		{!loading && !error && !filtered.length && <p>暂无匹配贴纸</p>}
		<div className="tw-sticker-grid">
			{filtered.map((sticker) => <article key={sticker.id}>
				{/* Preview renders are silent; editable image and motion are inserted separately. */}
				{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
				<video controls muted loop playsInline preload="metadata" aria-label={`${sticker.recipe.name}动画预览`} src={`/api/footage/templates/assets/${sticker.recipe.previewAssetId}/media`} />
				<h2>{sticker.recipe.name}</h2>
				<p>{sticker.recipe.tags.join(" · ")}</p>
				<details><summary>来源与授权</summary><p>{sticker.provenance}</p></details>
				<Button disabled={busy} onClick={() => void run(async () => {
					const result = await api<{ template: Template }>("/stickers/insert", {
						template, stickerId: sticker.id, instanceId: `sticker-${crypto.randomUUID()}`,
						region: { x: 0.75, y: 0.12, width: 0.2, height: Math.min(0.7, 0.2 * template.canvas.width / template.canvas.height) },
					});
					onChange(result.template);
				})}><Plus />加入模板</Button>
			</article>)}
		</div>
	</section>;
}
