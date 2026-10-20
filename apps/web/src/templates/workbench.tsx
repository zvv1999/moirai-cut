"use client";
import { StarGeometryControls, StarGeometryThumbnail } from "./star-geometry-controls";
import { RectangleGeometryControls } from "./rectangle-geometry-controls";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import Link from "next/link";
import {
	ArrowLeft,
	Check,
	Copy,
	Download,
	FileJson,
	Film,
	Layers,
	Plus,
	Play,
	Loader2,
	RefreshCw,
	Save,
	Search,
	Upload,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Element, Library, Plan, Style, Template } from "./types";
import { SoundLibrary } from "./sounds";
import { ElementMotion } from "./element-motion";
import { EllipseArcControls } from "./ellipse-arc-controls";
import { DraftPreview } from "./draft-preview";
import { reconcileDraftSave } from "./draft-save-state";
import { TemplateRecommendation } from "./recommendation";
import { TemplateInputPanel } from "./input";
import { TemplateApplyPanel } from "./apply";
import { LayoutEditor } from "./layouts";
import { SavedTemplatePreview } from "./saved-preview";
import { StickerLibrary } from "./sticker-library";
import { VisualAssetLibrary } from "./visual-asset-library";
import { DynamicAssetLibrary } from "./dynamic-assets";
import {
	TemplateOntology,
	FeatureEditor,
	ResourceEditor,
	PolicyEditor,
	ontologyLabel,
	type FeatureOptions,
} from "./ontology";
import "./workbench.css";
import { AssetPicker, type VisualAsset } from "./asset-picker";

async function api<T>(path: string, body?: unknown): Promise<T> {
	const media = body instanceof Blob;
	const r = await fetch(`/api/footage/templates${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: {
			"x-requested-with": "moirai-footage",
			...(body === undefined
				? {}
				: {
						"content-type": media
							? body.type || "application/octet-stream"
							: "application/json",
					}),
		},
		body: body === undefined ? undefined : media ? body : JSON.stringify(body),
		cache: "no-store",
	});
	const v = await r.json();
	if (!r.ok)
		throw new Error(
			v.error === "revision_conflict"
				? "模板已被更新，请重新载入后合并修改。"
				: (v.error ?? "请求失败"),
		);
	return v;
}
function Tool({
	label,
	children,
	...props
}: { label: string; children: ReactNode } & React.ComponentProps<
	typeof Button
>) {
	return (
		<Button
			variant="ghost"
			size="icon"
			title={label}
			aria-label={label}
			{...props}
		>
			{children}
		</Button>
	);
}
function download(name: string, data: unknown) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const audioLabels: Record<string, string> = {
	digital_silence: "数字静音",
	no_audio: "无音轨",
	needs_separation: "有声",
	below_minus_90_dbfs: "低于 -90 dBFS",
};
function TextPreview({
	element,
	canvas,
	style,
	assetId,
	assetKind,
	selected,
	onClick,
}: {
	element: Element;
	canvas: Template["canvas"];
	style?: Style;
	assetId?: string;
	assetKind?: "image" | "video";
	selected: boolean;
	onClick: () => void;
}) {
	if (
		!["text", "rectangle", "ellipse", "star", "line", "image", "video", "visual_media"].includes(
			element.features.representation,
		)
	)
		return null;
	const visualMedia = ["image", "video", "visual_media"].includes(element.features.representation);
	if (visualMedia && !assetId) return null;
	const text =
		element.features.representation !== "text"
			? ""
			: element.binding === "title"
				? "让每一句话都有重点"
				: element.binding === "translation"
					? "Make every sentence count"
					: element.binding === "speaker"
						? "讲述者"
						: element.binding === "semantic_number"
							? "1"
						: element.binding === "keyword"
							? "重点"
							: element.binding === "literal"
								? element.features.representation !== "text"
									? ""
									: (element.literal ?? "")
								: "从一句话开始，讲清楚一个观点";
	const shadow = style?.shadow;
	return (
		<button
			title={element.description}
			onClick={onClick}
			className={`tw-preview-element ${selected ? "is-selected" : ""}`}
			style={{
				left: `${element.region.x * 100}%`,
				top: `${element.region.y * 100}%`,
				width: `${element.region.width * 100}%`,
				height: `${element.region.height * 100}%`,
				zIndex: element.z,
				fontFamily: style?.fontFamily,
				fontSize: style?.fontSize ?? 40,
				fontWeight: style?.weight,
				fontStyle: style?.italic ? "italic" : "normal",
				textAlign: style?.textAlign ?? "center",
				justifyContent: style?.textAlign === "left" ? "flex-start" : style?.textAlign === "right" ? "flex-end" : "center",
				letterSpacing: style?.letterSpacing ?? 0,
				color: element.features.outline ? "transparent" : style?.fill,
				border:
					element.features.outline && !["text","star"].includes(element.features.representation)
						? `${style?.strokeWidth || 2}px solid ${style?.stroke ?? "#ffffff"}`
						: undefined,
				borderRadius:
					element.features.representation === "ellipse" ? "50%" : element.features.representation === "rectangle"
						? Math.min(element.region.width * canvas.width, element.region.height * canvas.height) * (element.rectangleGeometry?.cornerRadius ?? 0) / 100
						: undefined,
				background:
					visualMedia || element.features.representation==="star" ? "transparent" : element.features.representation !== "text" &&
					!element.features.outline
						? (style?.fill ?? "#000000")
						: element.features.outline
							? "transparent"
							: (style?.background ? `color-mix(in srgb, ${style.background} ${(style.backgroundOpacity ?? 1)*100}%, transparent)` : "transparent"),
				WebkitTextStroke: style
					? `${style.strokeWidth}px ${style.stroke}`
					: undefined,
				paintOrder: "stroke fill",
				textShadow: shadow
					? `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color}${Math.round(
							shadow.opacity * 255,
						)
							.toString(16)
							.padStart(2, "0")}`
					: undefined,
				lineHeight: style?.lineHeight,
			}}
		>
			{element.features.representation==="star" ? <StarGeometryThumbnail value={element.starGeometry} fill={element.features.outline?"transparent":style?.fill??"#000000"} stroke={style?.stroke??"#ffffff"} strokeWidth={element.features.outline?style?.strokeWidth??2:0}/> : visualMedia ? (
				(assetKind ?? element.features.representation) === "video" ? (
					<video src={`/api/footage/templates/assets/${encodeURIComponent(assetId!)}/media`} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
				) : (
					<img src={`/api/footage/templates/assets/${encodeURIComponent(assetId!)}/media`} alt={element.description} draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
				)
			) : text}
		</button>
	);
}
function Canvas({
	template,
	assets,
	selected,
	onSelect,
	onPreview,
}: {
	template: Template;
	assets: VisualAsset[];
	selected: string;
	onSelect: (id: string) => void;
	onPreview: () => void;
}) {
	const host = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(0.25);
	useEffect(() => {
		const el = host.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) =>
			setScale(entries[0].contentRect.width / template.canvas.width),
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [template.canvas.width]);
	return (
		<>
		<Button variant="ghost" size="icon" aria-label="预览当前效果" title="预览当前效果" onClick={onPreview}><Play /></Button>
		<div
			ref={host}
			className="tw-canvas"
			style={{
				aspectRatio: `${template.canvas.width}/${template.canvas.height}`,
			}}
		>
			<div
				style={{
					width: template.canvas.width,
					height: template.canvas.height,
					transform: `scale(${scale})`,
					transformOrigin: "top left",
					position: "absolute",
				}}
			>
				{template.elements.map((e) => (
					<TextPreview
						key={e.id}
						canvas={template.canvas}
						element={e.features.placement === "caption" && template.layouts[0] ? { ...e, region: template.layouts[0].captionRegion } : e}
						style={template.styles.find((s) => s.id === e.styleId)}
						assetId={template.resourceBindings.find((b) => b.slotId === e.resourceId && b.enabled !== false)?.assetId}
						assetKind={assets.find((asset) => asset.id === template.resourceBindings.find((b) => b.slotId === e.resourceId)?.assetId)?.kind}
						selected={selected === e.id}
						onClick={() => onSelect(e.id)}
					/>
				))}
			</div>
		</div>
		</>
	);
}
export function TemplateWorkbench() {
	const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
	const [library, setLibrary] = useState<Library | null>(null);
	const [previews, setPreviews] = useState<Record<string, { revision: number }>>({});
	const [librarySection, setLibrarySection] = useState<"ready" | "drafts">("ready");
	const [draft, setDraft] = useState<Template | null>(null);
	const draftRef = useRef(draft);
	draftRef.current = draft;
	const [baseRevision, setBaseRevision] = useState(0);
	const [selected, setSelected] = useState("");
	const inspectorHeadingRef = useRef<HTMLHeadingElement>(null);
	const [query, setQuery] = useState("");
	const [libraryOpen, setLibraryOpen] = useState(false);
	const [tag, setTag] = useState("");
	const [qualityFilter, setQualityFilter] = useState("");
	const [view, setView] = useState("preview");
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState("新模板");
	const [newFormat, setNewFormat] = useState("portrait");
	const viewGroups = [
		{ id: "preview", label: "效果预览", views: [["preview", "成片效果"], ["render", "草稿试映"]] },
		{ id: "design", label: "编辑模板", views: [["design", "元素与样式"], ["layouts", "画面布局"]] },
		{ id: "assets", label: "添加素材", views: [["dynamic-assets", "样式素材"], ["visual-assets", "插画与图标"], ["stickers", "动画贴纸"], ["sounds", "音效"]] },
		{ id: "advanced", label: "高级设置", views: [["ontology", "关系与约束"], ["rhythm", "断句与编排"], ["reference", "参考分析"], ["recommend", "智能选模板"], ["json", "JSON"]] },
	];
	const activeGroup = viewGroups.find((group) => group.views.some(([id]) => id === view))!;
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [dirty, setDirty] = useState(false);
	const [jsonText, setJsonText] = useState("");
	const jsonTextRef = useRef(jsonText);
	jsonTextRef.current = jsonText;
	const [jsonPending, setJsonPending] = useState(false);
	const jsonPendingRef = useRef(jsonPending);
	jsonPendingRef.current = jsonPending;
	const [transcriptDirty, setTranscriptDirty] = useState(false);
	const [previewPending, setPreviewPending] = useState(false);
	const [stylePending, setStylePending] = useState(false);
	const hasUnsavedChanges = dirty || jsonPending || transcriptDirty || previewPending || stylePending;
	useEffect(() => {
		if (!hasUnsavedChanges) return;
		const beforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", beforeUnload);
		return () => window.removeEventListener("beforeunload", beforeUnload);
	}, [hasUnsavedChanges]);
	const [plan, setPlan] = useState<Plan | null>(null);
	const [planInput, setPlanInput] = useState<unknown>(null);
	const [alignedWords, setAlignedWords] = useState("");
	const [quietGapSeconds, setQuietGapSeconds] = useState<number[] | null>(null);
	const [semanticUnits, setSemanticUnits] = useState("[]");
	const [captionSpans, setCaptionSpans] = useState("[]");
	const [soundEvents, setSoundEvents] = useState("[]");
	const [duration, setDuration] = useState(20);
	const [inputTitle, setInputTitle] = useState("");
	const [activeInputId, setActiveInputId] = useState("");
	const qualityLabels = { pending: "待审片", qualified: "内部评分达标", needs_revision: "需返修" };
	// The native catalog determines availability. Match revisions across the two
	// responses so a concurrent save cannot display an older version as ready.
	const readyTemplates = library?.templates.filter(t => previews[t.id]?.revision === t.revision) ?? [];
	const draftTemplates = library?.templates.filter(t => previews[t.id]?.revision !== t.revision) ?? [];
	const visibleTemplates = library?.templates.filter((t) =>
		((previews[t.id]?.revision === t.revision) === (librarySection === "ready")) &&
		(!qualityFilter || library.quality?.[t.id]?.status === qualityFilter) &&
		(!tag || t.tags.includes(tag)) && `${t.name} ${t.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()),
	) ?? [];
	useEffect(() => {
		setPlan(null);
		setPlanInput(null);
	}, [
		draft,
		alignedWords,
		semanticUnits,
		captionSpans,
		soundEvents,
		duration,
		inputTitle,
		quietGapSeconds,
	]);
	const [featureOptions, setFeatureOptions] = useState<FeatureOptions>({
		Role: [],
		Representation: [],
		MediaUse: [],
	});
	const importRef = useRef<HTMLInputElement>(null);
	const choose = useCallback((t: Template) => {
		const url = new URL(window.location.href);
		url.searchParams.set("template", t.id);
		window.history.replaceState(null, "", url);
		setDraft(structuredClone(t));
		setBaseRevision(t.revision);
		setSelected(t.elements[0]?.id ?? "");
		setLibraryOpen(false);
		setJsonText(JSON.stringify(t, null, 2));
		setJsonPending(false);
		setDirty(false);
		setPlan(null);
	}, []);
	const refresh = useCallback(async () => {
		const [data, catalog] = await Promise.all([
			api<Library>(""),
			api<{ previews: Record<string, { revision: number }> }>("/previews"),
		]);
		setLibrary(data);
		setPreviews(catalog.previews);
		return { ...data, previews: catalog.previews };
	}, []);
	useEffect(() => {
		let live = true;
		void refresh()
			.then((data) => {
				const requested = new URLSearchParams(window.location.search).get("template");
				const initial = data.templates.find((template) => template.id === requested)
					?? data.templates.find(template => data.previews[template.id]?.revision === template.revision);
				if (live && initial) {
					setLibrarySection(data.previews[initial.id]?.revision === initial.revision ? "ready" : "drafts");
					choose(initial);
					if (data.previews[initial.id]?.revision !== initial.revision) setView("design");
					if (new URLSearchParams(window.location.search).has("insertStyle")) {
						setView("dynamic-assets");
					}
				}
			})
			.catch((e) => {
				if (live) setMessage(e.message);
			});
		void api<{
			template: { $defs: Record<keyof FeatureOptions, { enum: string[] }> };
		}>("/schema")
			.then((s) => {
				if (live)
					setFeatureOptions({
						Role: s.template.$defs.Role.enum,
						Representation: s.template.$defs.Representation.enum,
						MediaUse: s.template.$defs.MediaUse.enum,
					});
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [refresh, choose]);
	function switchLibrarySection(section: "ready" | "drafts") {
		if (section === librarySection) return;
		if (hasUnsavedChanges) { setMessage("当前有未保存修改，请先保存或重新载入。"); return; }
		setLibrarySection(section);
		setQuery(""); setTag(""); setQualityFilter("");
		const first = (section === "ready" ? readyTemplates : draftTemplates)[0];
		if (first) { choose(first); setView(section === "ready" ? "preview" : "design"); }
		else {
			setDraft(null);
			const url = new URL(window.location.href);
			url.searchParams.delete("template");
			window.history.replaceState(null, "", url);
		}
	}
	const run = async (task: () => Promise<void>) => {
		setBusy(true);
		setMessage("");
		try {
			await task();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "操作失败");
		} finally {
			setBusy(false);
		}
	};
	function change(t: Template) {
		setDraft(t);
		setJsonText(JSON.stringify(t, null, 2));
		setJsonPending(false);
		setDirty(true);
		setPlan(null);
	}
	function editElement(patch: Partial<Element>) {
		if (draft)
			change({
				...draft,
				elements: draft.elements.map((e) =>
					e.id === selected ? { ...e, ...patch } : e,
				),
			});
	}
	function editStyle(patch: Partial<Style>) {
		if (draft && element?.styleId)
			change({
				...draft,
				styles: draft.styles.map((s) =>
					s.id === element.styleId ? { ...s, ...patch } : s,
				),
			});
	}
	const element = draft?.elements.find((e) => e.id === selected);
	const style = draft?.styles.find((s) => s.id === element?.styleId);
	const selectedSlot = draft?.resourceSlots.find((slot) => slot.id === element?.resourceId);
	const selectedBinding = draft?.resourceBindings.find((binding) => binding.slotId === selectedSlot?.id);
	const referenceId = draft?.evidence.find((e) => e.referenceId)?.referenceId;
	const reference = library?.references.find((r) => r.id === referenceId);
	function switchView(id: string) {
		if (stylePending) {
			setMessage("请先在样式素材中保存或还原修改，并等待当前操作完成。");
			return;
		}
		if (transcriptDirty || jsonPending) {
			setMessage(transcriptDirty ? "转写有未保存校正，请先保存或放弃校正。" : "JSON 有未应用修改，请先校验并应用或保存。");
			return;
		}
		setView(id);
	}
	const save = () =>
		run(async () => {
			if (!draft) return;
			const t = view === "json" ? JSON.parse(jsonText) : draft;
			const result = await api<{ template: Template }>("/save", {
				template: t,
				baseRevision,
				idempotencyKey: crypto.randomUUID(),
			});
			const receipt = reconcileDraftSave({ submitted: draft, submittedJson: jsonText, current: draftRef.current, currentJson: jsonTextRef.current, jsonPending: jsonPendingRef.current, saved: result.template });
			if (receipt) {
				setBaseRevision(receipt.baseRevision);
				setDraft(receipt.draft);
				setJsonText(receipt.jsonText);
				setJsonPending(receipt.jsonPending);
				setDirty(receipt.dirty);
				if (!receipt.dirty) {
					setSelected((id) => result.template.elements.some((element) => element.id === id) ? id : result.template.elements[0]?.id ?? "");
					const url = new URL(window.location.href);
					url.searchParams.set("template", result.template.id);
					window.history.replaceState(null, "", url);
				}
			}
			const refreshed = await refresh();
			if (receipt && !receipt.dirty) setLibrarySection(refreshed.previews[result.template.id]?.revision === result.template.revision ? "ready" : "drafts");
			setMessage(!receipt ? "提交的版本已保存，当前草稿保持不变。" : receipt.dirty ? "提交的版本已保存，后续修改尚未保存。" : "已保存");
		});
	return (
		<div className="template-workbench" onClickCapture={(event) => {
			if (!hasUnsavedChanges || !(event.target instanceof globalThis.Element)) return;
			const link = event.target.closest("a[href]");
			if (!link || link.getAttribute("target") === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			const href = link.getAttribute("href");
			if (!href || href.startsWith("#") || link.hasAttribute("download")) return;
			event.preventDefault();
			event.stopPropagation();
			setMessage("当前有未保存修改，请先保存；放弃模板修改可使用重新载入。");
		}}>
			<header className="tw-header">
				<Link href="/projects" aria-label="返回工程">
					<ArrowLeft size={18} />
				</Link>
				<Layers size={22} />
				<h1>模板组合工作台</h1>
				<span className="tw-count">
					{readyTemplates.length} 个有成片模板
				</span>
				<div className="tw-spacer" />
				<Link href="/templates">样式素材</Link>
				<Button variant="outline" disabled={busy || hasUnsavedChanges} onClick={() => setCreating(true)}><Plus />新建模板</Button>
				<Tool
					label="重新载入"
					disabled={busy}
					onClick={() =>
						void run(async () => {
							if (stylePending) throw new Error("请先在样式素材中保存或还原修改，并等待当前操作完成。");
							if (transcriptDirty) throw new Error("转写有未保存校正，请先保存或放弃校正。");
							if (previewPending) throw new Error("请先完成试映中的内容校正或提交。");
							if ((dirty || jsonPending) && !window.confirm("放弃当前未保存的模板修改并重新载入？")) return;
							const before = draftRef.current;
							const data = await refresh();
							if (draftRef.current !== before) throw new Error("模板在加载期间已修改，请重新操作。");
							const latest = data.templates.find((t) => t.id === draft?.id);
							if (latest) {
								choose(latest);
								setLibrarySection(data.previews[latest.id]?.revision === latest.revision ? "ready" : "drafts");
							}
						})
					}
				>
					<RefreshCw />
				</Tool>
				<Tool label="导入模板 JSON" disabled={busy || hasUnsavedChanges} onClick={() => importRef.current?.click()}>
					<Upload />
				</Tool>
				<Tool
					label="导出模板 JSON"
					disabled={!draft || jsonPending}
					onClick={() => draft && download(`${draft.id}.json`, draft)}
				>
					<Download />
				</Tool>
				<Button disabled={!draft || busy || stylePending} title={stylePending ? "请先保存或还原样式修改" : undefined} onClick={() => void save()}>
					{busy ? <Loader2 className="tw-spin" /> : <Save />}保存
					{dirty ? " *" : ""}
				</Button>
				<Button asChild disabled={!draft || busy || hasUnsavedChanges}>
					<Link href={draft && !hasUnsavedChanges && !busy ? `/templates/production?template=${encodeURIComponent(draft.id)}` : "#"}
						aria-disabled={!draft || busy || hasUnsavedChanges}
						onClick={(event) => { if (!draft || busy || hasUnsavedChanges) event.preventDefault(); }}>
						<Film />应用到视频
					</Link>
				</Button>
				<Link href="/templates/production">生产任务</Link>
				<input
					hidden
					ref={importRef}
					type="file"
					accept=".json,application/json"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file)
							void run(async () => {
								const before = draftRef.current;
								const { template: t } = await api<{ template: Template }>(
									"/validate",
									JSON.parse(await file.text()),
								);
								if (draftRef.current !== before) throw new Error("模板已修改，请重新导入。");
								choose(t);
								setLibrarySection("drafts");
								setBaseRevision(
									library?.templates.find((v) => v.id === t.id)?.revision ?? 0,
								);
								setDirty(true);
							});
						e.target.value = "";
					}}
				/>
			</header>
			{creating && <form className="tw-create-form" aria-label="新建模板" onSubmit={(event) => {
				event.preventDefault();
				if (hasUnsavedChanges) { setMessage("当前有未保存修改，请先保存再创建。"); return; }
				void run(async () => {
					const before = draftRef.current;
					const canvas = newFormat === "portrait" ? { width:720, height:1280, fps:30 } : newFormat === "landscape" ? { width:1280, height:720, fps:30 } : { width:720, height:720, fps:30 };
					const result = await api<{ template: Template }>("/create", {name:newName.trim(),canvas});
					if (draftRef.current !== before) throw new Error("模板已修改，请重新创建。");
					choose(result.template);
					setLibrarySection("drafts");
					setDirty(true);
					setView("design");
					setCreating(false);
				});
			}}>
				<label>名称<input aria-label="新模板名称" required value={newName} disabled={busy} onChange={(event) => setNewName(event.target.value)} /></label>
				<label>画幅<select aria-label="新模板画幅" value={newFormat} disabled={busy} onChange={(event) => setNewFormat(event.target.value)}><option value="portrait">竖屏 9:16</option><option value="landscape">横屏 16:9</option><option value="square">方屏 1:1</option></select></label>
				<Button type="submit" disabled={busy || !newName.trim()}><Plus />创建</Button>
				<Button variant="ghost" disabled={busy} onClick={() => setCreating(false)}>取消</Button>
			</form>}
			{message && (
				<div role="status" className="tw-message">
					{message}
					<Tool label="关闭消息" onClick={() => setMessage("")}>
						<X />
					</Tool>
				</div>
			)}
			<div className={`tw-workspace ${view !== "design" ? "tw-workspace-wide" : ""}`}>
				<button className="tw-library-toggle" aria-expanded={libraryOpen} aria-controls="template-library" onClick={() => setLibraryOpen((open) => !open)}><Layers size={16} />{libraryOpen ? "收起模板库" : "切换模板"}</button>
				<aside id="template-library" className={`tw-library ${libraryOpen ? "tw-library-open" : ""}`}>
					<div className="tw-library-sections" role="group" aria-label="模板分类">
						<button disabled={busy} aria-pressed={librarySection === "ready"} onClick={() => switchLibrarySection("ready")}>有成片 <span>{readyTemplates.length}</span></button>
						<button disabled={busy} aria-pressed={librarySection === "drafts"} onClick={() => switchLibrarySection("drafts")}>草稿 <span>{draftTemplates.length}</span></button>
					</div>
					{librarySection === "drafts" && <p className="tw-library-note">当前版本还没有成片，可继续编辑和试映。</p>}
					<label className="tw-search">
						<Search size={16} />
						<input
							aria-label="搜索模板"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</label>
					<div className="tw-library-filters">
						<label>内部评审
							<select aria-label="模板评审状态" value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value)}>
								<option value="">全部状态</option>
								{Object.entries(qualityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
							</select>
						</label>
						<label>分类标签
							<select aria-label="模板分类标签" value={tag} onChange={(e) => setTag(e.target.value)}>
								<option value="">全部标签</option>
								{Array.from(new Set(library?.templates.flatMap((t) => t.tags) ?? [])).sort().map((value) => <option key={value}>{value}</option>)}
							</select>
						</label>
						<p className="tw-filter-count" role="status">{visibleTemplates.length} 个模板</p>
					</div>
					<nav aria-label="模板列表">
						{library && visibleTemplates.length === 0 && <p>{query || tag || qualityFilter ? "没有符合条件的模板" : librarySection === "ready" ? "暂无有成片模板，可前往草稿生成试映。" : "暂无草稿"}</p>}
						{visibleTemplates
							.map((t) => (
								<button
									key={t.id}
									disabled={busy}
									className={draft?.id === t.id ? "active" : ""}
									onClick={() => {
										if (hasUnsavedChanges) {
											setMessage("当前有未保存修改，请先保存或重新载入。");
											return;
										}
										choose(t);
										setView(librarySection === "ready" ? "preview" : "design");
									}}
								>
									<span>{t.name}</span>
									<small>{t.tags.filter((value) => value !== "候选待审").join(" · ")}</small>
									{library?.quality?.[t.id] && <small className="tw-quality-status">{qualityLabels[library.quality[t.id].status]}{library.quality[t.id].score !== null ? ` · ${library.quality[t.id].score} 分` : ""}</small>}
									{library?.quality?.[t.id]?.score != null && <small className="tw-quality-listening">{library.quality[t.id].listened === true ? "已试听" : library.quality[t.id].listened === false ? "未试听" : "试听状态未记录"}{library.quality[t.id].aestheticQualityVerified === true ? " · 审美已验收" : " · 待最终审美验收"}</small>}
								</button>
							))}
					</nav>
				</aside>
				<main className="tw-main">
					{draft ? (
						<>
							<div className="tw-title">
								<input
									aria-label="模板名称"
									disabled={busy || jsonPending || stylePending}
									value={draft.name}
									onChange={(e) => change({ ...draft, name: e.target.value })}
								/>
								<span className="tw-save-state" role="status">{dirty ? "未保存" : `已保存 v${baseRevision}`}</span>
								<Tool
									label="复制为新模板"
									disabled={busy || jsonPending || previewPending || stylePending}
									onClick={() => {
										const t = {
											...structuredClone(draft),
											id: `template-${crypto.randomUUID()}`,
											revision: 0,
											name: `${draft.name} 副本`,
										};
										choose(t);
										setLibrarySection("drafts");
										setDirty(true);
										setView("design");
									}}
								>
									<Copy />
								</Tool>
							</div>
							<nav className="tw-tabs" aria-label="工作视图">
								{viewGroups.map(({id, label, views}) => (
									<button
										key={id}
										aria-pressed={activeGroup.id === id}
										onClick={() => switchView(views[0][0])}
									>
										{label}
									</button>
								))}
							</nav>
							{activeGroup.views.length > 1 && <nav className="tw-tabs tw-subtabs" aria-label={activeGroup.label}>
								{activeGroup.views.map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => switchView(id)}>{label}</button>)}
							</nav>}
							{view === "preview" && (
								dirty ? <section className="tw-draft-preview" aria-label="当前模板草稿">
									<p role="status">布局草稿 · 未保存 · 非最终成片</p>
									<Canvas assets={visualAssets} template={draft} selected={selected} onPreview={() => switchView("render")} onSelect={(id) => { setSelected(id); switchView("design"); }} />
									<Button onClick={() => void save()} disabled={busy}><Save />保存模板</Button>
								</section> : <SavedTemplatePreview key={draft.id} id={draft.id} revision={baseRevision} dirty={dirty} onPreview={() => switchView("render")} onEdit={() => switchView("design")} />
							)}
							<div hidden={view !== "render"}>
								<DraftPreview key={draft.id} template={draft} active={view === "render"} onPendingChange={setPreviewPending} />
							</div>
							{view === "visual-assets" && <VisualAssetLibrary busy={busy} onAssetsLoaded={setVisualAssets} onInsert={(assetId) => void run(async () => {
								const result = await api<{template: Template; elementId: string}>("/assets/insert", {template: draft, assetId});
								if (draftRef.current !== draft) throw new Error("模板已修改，请重新加入素材。");
								change(result.template);
								setSelected(result.elementId);
								switchView("design");
								setMessage("素材已加入画面，尚未保存。");
							})} />}
							{view === "stickers" && <StickerLibrary template={draft} busy={busy} api={api} run={run} onChange={(template) => { change(template); setSelected(template.elements.at(-1)?.id ?? ""); setMessage("贴纸已加入，尚未保存。"); }} />}
							{view === "dynamic-assets" && <DynamicAssetLibrary api={api} template={draft} onPendingChange={setStylePending} onInsert={(template, selectedId) => { change(template); setSelected(selectedId); setView("design"); }} onMessage={setMessage} />}
							{view === "layouts" && (
								<LayoutEditor template={draft} onChange={change} />
							)}
							{view === "ontology" && (
								<TemplateOntology
									template={draft}
									onChange={change}
									options={featureOptions}
									sounds={library?.sounds ?? []}
								/>
							)}
							{view === "design" && (
								<div className="tw-design">
									<div>
										<Canvas
											assets={visualAssets}
											template={draft}
											selected={selected}
											onSelect={setSelected}
											onPreview={() => switchView("render")}
										/>
									</div>
									<section className="tw-elements">
										<div className="tw-section-title">
											<h2>元素</h2>
											<Button variant="outline" size="sm" disabled={!element} onClick={() => {
												inspectorHeadingRef.current?.scrollIntoView({ block: "start" });
												inspectorHeadingRef.current?.focus({ preventScroll: true });
											}}>编辑所选元素</Button>
											<select aria-label="添加元素" value="" disabled={busy} onChange={(event) => {
												const representation = event.target.value;
												if (!representation) return;
												void run(async () => {
													const result = await api<{template:Template;elementId:string}>("/elements/add", {template:draft,representation});
													if (draftRef.current !== draft) throw new Error("模板已修改，请重新添加元素。");
													change(result.template); setSelected(result.elementId);
												});
											}}><option value="">添加元素</option><option value="text">文字</option><option value="rectangle">矩形</option><option value="ellipse">椭圆</option><option value="star">星形</option><option value="line">线条</option></select>
											<Tool
												label="复制所选元素"
												disabled={busy || !element}
												onClick={() => void run(async () => {
													const result = await api<{ template: Template; elementId: string }>("/elements/duplicate", { template: draft, elementId: selected });
													if (draftRef.current !== draft) throw new Error("模板已修改，请重新复制元素。");
													change(result.template);
													setSelected(result.elementId);
												})}
											>
												<Copy />
											</Tool>
										</div>
										{draft.elements.map((e) => (
											<button
												key={e.id}
												className={selected === e.id ? "active" : ""}
												onClick={() => setSelected(e.id)}
											>
												<Layers size={14} />
												<span>
													{ontologyLabel(e.features.role)} ·{" "}
													{ontologyLabel(e.features.representation)}
												</span>
												<small>{e.description}</small>
											</button>
										))}
										<h2>参考观察</h2>
										<p>{draft.description}</p>
										<details><summary>高级素材绑定</summary><ResourceEditor
											onAssetsLoaded={setVisualAssets}
											template={draft}
											sounds={library?.sounds ?? []}
											onChange={change}
										/>
										</details>
									</section>
								</div>
							)}
							{view === "reference" && (
								<section className="tw-reference">
									{reference ? (
										<>
											{/* Reference captions are burned into the downloaded video. */}
											{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
											<video
												controls
												playsInline
												preload="metadata"
												src={`/api/footage/templates/media/${reference.id}/video`}
											/>
											<div>
												<h2>{reference.name}</h2>
												<p>
													{reference.durationSeconds.toFixed(2)} 秒 ·{" "}
													{audioLabels[reference.audio.status] ??
														reference.audio.status}
												</p>
												<p>{draft.description}</p>
												<a
													href={`/api/footage/templates/media/${reference.id}/sequence`}
													target="_blank"
													rel="noreferrer"
												>
													连续帧
												</a>
											</div>
										</>
									) : (
										<p>参考视频尚未导入</p>
									)}
								</section>
							)}
							{view === "json" && (
								<section className="tw-json">
									<textarea
										aria-label="模板 JSON"
										spellCheck={false}
										value={jsonText}
										onChange={(e) => {
											setJsonText(e.target.value);
											setJsonPending(true);
											setDirty(true);
										}}
									/>
									<Button
										onClick={() =>
											void run(async () => {
												const { template: t } = await api<{
													template: Template;
												}>("/validate", JSON.parse(jsonText));
												change(t);
												setMessage("结构校验通过");
											})
										}
									>
										<Check />
										校验并应用
									</Button>
								</section>
							)}
							{view === "recommend" && (
								<TemplateRecommendation
									api={api}
									blocked={dirty}
									onDirtyChange={setTranscriptDirty}
									onChoose={(template, input, transcript) => {
										choose(template);
										setActiveInputId(input.id);
										setAlignedWords(JSON.stringify(transcript.words, null, 2));
										setQuietGapSeconds(null);
										setDuration(input.durationSeconds);
										setSemanticUnits("[]");
										setCaptionSpans("[]");
										setSoundEvents("[]");
										setView("rhythm");
									}}
								/>
							)}
							{view === "rhythm" && (
								<section className="tw-rhythm">
									<TemplateInputPanel
										initialInputId={activeInputId || undefined}
										api={api}
										onDirtyChange={setTranscriptDirty}
										onUse={(input, transcript, quietGaps) => {
											setQuietGapSeconds(quietGaps ?? null);
											setActiveInputId(input.id);
											setAlignedWords(
												JSON.stringify(transcript.words, null, 2),
											);
											setDuration(input.durationSeconds);
											setSemanticUnits("[]");
											setCaptionSpans("[]");
											setSoundEvents("[]");
											setPlan(null);
											setMessage(`已应用 ${input.name} 的词级时间戳`);
										}}
									/>
									<PolicyEditor template={draft} onChange={change} />
									<label>
										标题
										<input
											value={inputTitle}
											onChange={(e) => setInputTitle(e.target.value)}
										/>
									</label>
									<label>
										视频时长（秒）
										<input
											type="number"
											min="0.1"
											step="0.1"
											value={duration}
											onChange={(e) => setDuration(Number(e.target.value))}
										/>
									</label>
									<label>
										词级时间戳 JSON
										<textarea
											aria-label="词级时间戳 JSON"
											value={alignedWords}
											onChange={(e) => {
												setAlignedWords(e.target.value);
												setQuietGapSeconds(null);
												setSemanticUnits("[]");
												setCaptionSpans("[]");
											}}
										/>
									</label>
									<div className="tw-row">
										<details>
											<summary>语义段落</summary>
											<textarea
												aria-label="语义段落 JSON"
												value={semanticUnits}
												onChange={(e) => setSemanticUnits(e.target.value)}
											/>
										</details>
										<details>
											<summary>字幕显示单元</summary>
											<textarea
												aria-label="字幕词范围 JSON"
												value={captionSpans}
												onChange={(e) => setCaptionSpans(e.target.value)}
											/>
										</details>
										<details>
											<summary>时间事件</summary>
											<textarea
												aria-label="时间事件 JSON"
												value={soundEvents}
												onChange={(e) => setSoundEvents(e.target.value)}
											/>
										</details>
										<Button
											disabled={busy || (!alignedWords && soundEvents === "[]")}
											onClick={() =>
												void run(async () => {
													const input = {
														template: draft,
														words: JSON.parse(alignedWords || "[]"),
														events: JSON.parse(soundEvents),
														durationSeconds: duration,
														title: inputTitle,
														translations: [],
														semanticUnits: JSON.parse(semanticUnits),
														captionSpans: JSON.parse(captionSpans),
														...(quietGapSeconds === null
															? {}
															: { quietGapSeconds }),
													};
													setPlan(null);
													setPlanInput(input);
													setPlan(await api<Plan>("/plan", input));
												})
											}
										>
											<Film />
											生成编排
										</Button>
										{plan && (
											<Tool
												label="导出编排"
												onClick={() => download("template-plan.json", plan)}
											>
												<Download />
											</Tool>
										)}
									</div>
									{planInput !== null && (
										<TemplateApplyPanel
											input={planInput}
											resources={draft.resourceSlots}
										/>
									)}
									{plan && (
										<>
											<details>
												<summary>事件与调度依据</summary>
												<div className="tw-json">
													<pre>
														{JSON.stringify(
															{
																events: plan.events,
																decisions: plan.scheduleDecisions,
															},
															null,
															2,
														)}
													</pre>
												</div>
											</details>
											<table>
												<thead>
													<tr>
														<th>时间</th>
														<th>短句</th>
														<th>意图</th>
													</tr>
												</thead>
												<tbody>
													{plan.captions.map((p, i) => (
														<tr key={i}>
															<td>
																{p.start.toFixed(2)} - {p.end.toFixed(2)}
															</td>
															<td>{p.text}</td>
															<td>
																{plan.semanticUnits[p.semanticIndex].intent}
															</td>
														</tr>
													))}
												</tbody>
											</table>
											<ul>
												{plan.warnings.map((w) => (
													<li key={w}>{w}</li>
												))}
											</ul>
										</>
									)}
								</section>
							)}
							{view === "sounds" && library && (
								<SoundLibrary
									library={library}
									api={api}
									refresh={refresh}
									run={run}
									busy={busy}
								/>
							)}
						</>
					) : (
						<div className="tw-empty">{message || (library ? librarySection === "ready" ? "暂无有成片模板，可前往草稿继续编辑和生成试映。" : "暂无草稿，点击新建模板开始。" : "正在连接模板库…")}</div>
					)}
				</main>
				<aside className="tw-inspector" hidden={view !== "design"}>
					{draft && element && view === "design" ? (
						<>
							<h2 ref={inspectorHeadingRef} tabIndex={-1}>元素属性</h2>
							<label className="tw-inspector-layer">当前模板元素
								<select aria-label="当前模板元素" value={selected} onChange={(event) => setSelected(event.target.value)}>
									{draft.elements.map((item) => <option key={item.id} value={item.id}>{ontologyLabel(item.features.role)} · {item.description || item.id}</option>)}
								</select>
							</label>
							<details className="tw-element-advanced">
							<summary>内容绑定与编排</summary>
							<FeatureEditor
								value={element.features}
								options={featureOptions}
								onChange={(features) => editElement({ features })}
							/>
							</details>
							<label>
								元素名称
								<textarea
									value={element.description}
									onChange={(e) => editElement({ description: e.target.value })}
								/>
							</label>
							<details key={`binding-${element.id}`} open={element.features.representation === "text" ? true : undefined}>
							<summary>{element.features.representation === "text" ? "文字内容" : "高级内容绑定"}</summary>
							<label>
								内容绑定
								<select
									aria-label="内容绑定"
									value={element.binding}
									onChange={(e) =>
										editElement({
											binding: e.target.value,
											literal: e.target.value === "literal" ? "文字" : null,
										})
									}
								>
									{[
										"title",
										"sentence",
										"keyword",
										"semantic_number",
										"translation",
										"speaker",
										"literal",
										"source_video",
									].map((v) => (
										<option key={v} value={v}>{{title:"视频标题",sentence:"动态字幕",keyword:"重点文字",semantic_number:"段落序号",translation:"翻译字幕",speaker:"讲述者",literal:"固定文字",source_video:"原始视频"}[v] ?? v}</option>
									))}
								</select>
							</label>
							</details>
							{selectedSlot && ["image", "video", "visual_media"].includes(selectedSlot.representation) && <AssetPicker
								label="替换素材" assets={visualAssets.filter((asset) => selectedSlot.representation === "visual_media" || asset.kind === selectedSlot.representation)}
								value={selectedBinding?.assetId ?? ""} emptyLabel="未绑定" disabled={busy}
								onChange={(assetId) => change({ ...draft, resourceBindings: [
									...draft.resourceBindings.filter((binding) => binding.slotId !== selectedSlot.id),
									...(assetId ? [{slotId: selectedSlot.id, assetId, enabled: selectedBinding?.enabled !== false}] : []),
								] })}
							/>}
							{element.binding === "literal" && element.features.representation === "text" && (
								<label>
									文字
									<input
										value={element.literal ?? ""}
										onChange={(e) => editElement({ literal: e.target.value })}
									/>
								</label>
							)}
							<div className="tw-fields">
								{(["x", "y", "width", "height"] as const).map((k) => (
									<label key={k}>
										{{x:"水平位置",y:"垂直位置",width:"宽度",height:"高度"}[k]} %
										<input
											type="number"
											min="0"
											max="100"
											step="0.1"
											disabled={element.features.placement === "caption"}
											value={Number((element.region[k] * 100).toFixed(4))}
											onChange={(e) =>
												editElement({
													region: {
														...element.region,
														[k]: Number(e.target.value) / 100,
													},
												})
											}
										/>
									</label>
								))}
							</div>
							{element.features.placement === "caption" && <Button variant="link" onClick={() => switchView("layouts")}>编辑布局字幕区域</Button>}
							<label>图层顺序<input type="number" step="1" min={-2147483648} max={2147483647} value={element.z} onChange={(event) => { const z = event.target.valueAsNumber; if (Number.isInteger(z)) editElement({z}); }} /></label>
							<details className="tw-element-advanced">
							<summary>出现时机</summary>
							<label>
								入场锚点
								<select
									value={element.timing.anchor}
									onChange={(e) =>
										editElement({
											timing: { ...element.timing, anchor: e.target.value },
										})
									}
								>
									{[
										"cue_start",
										"keyword_start",
										"cue_end",
										"semantic_start",
										"semantic_end",
										"video_start",
									].map((v) => (
										<option key={v} value={v}>{{cue_start:"字幕开始",keyword_start:"重点词开始",cue_end:"字幕结束",semantic_start:"段落开始",semantic_end:"段落结束",video_start:"视频开始"}[v] ?? v}</option>
									))}
								</select>
							</label>
							<label>
								最长持续（秒）
								<input
									type="number"
									min="0.1"
									step="0.1"
									value={element.timing.maxSeconds}
									onChange={(e) =>
										editElement({
											timing: {
												...element.timing,
												maxSeconds: Number(e.target.value),
											},
										})
									}
								/>
							</label>
							</details>
							{style && (
								<>
									<h2>样式</h2>
									<div hidden={element.features.representation !== "text"}>
									<fieldset aria-label="文字底板">
                                        <legend>文字底板</legend>
                                        <label><input type="checkbox" checked={!!style.background} onChange={e=>editStyle({background:e.target.checked?"#17232E":null})}/> 启用文字底板</label>
                                        {style.background && <>
                                            <label>底板颜色<input aria-label="底板颜色" type="color" value={style.background} onChange={e=>editStyle({background:e.target.value})}/></label>
                                            <label>底板不透明度 <output>{Math.round((style.backgroundOpacity??1)*100)}%</output><input aria-label="底板不透明度" type="range" min={0} max={1} step={0.01} value={style.backgroundOpacity??1} onChange={e=>editStyle({backgroundOpacity:e.target.valueAsNumber})}/></label>
                                            <label>底板圆角 <output>{style.backgroundCornerRadius??0}%</output><input aria-label="底板圆角" type="range" min={0} max={100} step={1} value={style.backgroundCornerRadius??0} onChange={e=>editStyle({backgroundCornerRadius:e.target.valueAsNumber})}/></label>
                                            {([['x','底板横向留白'],['y','底板纵向留白']] as const).map(([key,label])=><label key={key}>{label}<input aria-label={label} type="number" min={0} max={256} step={1} value={style.backgroundPadding?.[key]??0} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))editStyle({backgroundPadding:{x:style.backgroundPadding?.x??0,y:style.backgroundPadding?.y??0,[key]:e.target.valueAsNumber}});}}/></label>)}
                                        </>}
                                    </fieldset>
                                    <label>字距<input type="number" min={-100} max={500} value={style.letterSpacing ?? 0} onChange={e=>editStyle({letterSpacing:Number(e.target.value)})} /></label>
									<label>文字对齐<select value={style.textAlign ?? "center"} onChange={e=>editStyle({textAlign:e.target.value as "left"|"center"|"right"})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
									<label>
										字体
										<input
											value={style.fontFamily}
											onChange={(e) =>
												editStyle({ fontFamily: e.target.value })
											}
										/>
									</label>
									<label>
										字号
										<input
											type="number"
											min="8"
											max="500"
											value={style.fontSize}
											onChange={(e) =>
												editStyle({ fontSize: Number(e.target.value) })
											}
										/>
									</label>
									</div>
									{element.features.representation === "rectangle" && <><label><input type="checkbox" checked={!!style.grid} onChange={e=>editStyle({grid:e.target.checked?{spacing:32,width:1,color:"#303030"}:undefined})} />网格背景</label>{style.grid && <><label>网格间距<input type="number" min={4} max={256} value={style.grid.spacing} onChange={e=>editStyle({grid:{...style.grid!,spacing:Number(e.target.value)}})} /></label><label>网格线宽<input type="number" min={0.1} max={8} step={0.1} value={style.grid.width} onChange={e=>editStyle({grid:{...style.grid!,width:Number(e.target.value)}})} /></label><label>网格颜色<input type="color" value={style.grid.color} onChange={e=>editStyle({grid:{...style.grid!,color:e.target.value}})} /></label></>}</>}
									<div className="tw-fields">
										<label>
											填色
											<input
												type="color"
												value={style.fill}
												onChange={(e) => editStyle({ fill: e.target.value })}
											/>
											<input aria-label="填色色值" value={style.fill} maxLength={7} spellCheck={false} onChange={(event) => editStyle({fill:event.target.value})} />
										</label>
										<label>
											描边
											<input
												type="color"
												value={style.stroke}
												onChange={(e) => editStyle({ stroke: e.target.value })}
											/>
											<input aria-label="描边色值" value={style.stroke} maxLength={7} spellCheck={false} onChange={(event) => editStyle({stroke:event.target.value})} />
										</label>
									</div>
									<label>
										描边宽度
										<input
											type="range"
											min="0"
											max="12"
											step="0.5"
											value={style.strokeWidth}
											onChange={(e) =>
												editStyle({ strokeWidth: Number(e.target.value) })
											}
										/>
									</label>
									{element.features.representation === "text" && <label className="tw-check">
										<input
											type="checkbox"
											checked={style.italic}
											onChange={(e) => editStyle({ italic: e.target.checked })}
										/>
										斜体
									</label>}
									<label className="tw-check">
										<input
											type="checkbox"
											checked={!!style.shadow}
											onChange={(e) =>
												editStyle({
													shadow: e.target.checked
														? {
																color: "#000000",
																opacity: 0.5,
																blur: 3,
																x: 1,
																y: 3,
															}
														: null,
												})
											}
										/>
										阴影
									</label>
								</>
							)}
							{(element.features.representation==="star"||element.starGeometry)&&<StarGeometryControls value={element.starGeometry} eligible={element.features.representation==="star"} disabled={busy} onChange={starGeometry=>editElement({starGeometry})}/>}
							{(element.features.representation==="rectangle"||element.rectangleGeometry)&&<RectangleGeometryControls value={element.rectangleGeometry} eligible={element.features.representation==="rectangle"} disabled={busy} onChange={rectangleGeometry=>editElement({rectangleGeometry})}/>}
                            {(element.features.representation === "ellipse" || element.ellipseArc) && <EllipseArcControls value={element.ellipseArc} eligible={element.features.representation === "ellipse" && element.features.outline && (style?.strokeWidth ?? 2) > 0} disabled={busy} onChange={ellipseArc => editElement({ellipseArc})}/>}
                            <ElementMotion allowStrokeReveal={element.features.representation === "ellipse" && element.features.outline && (style?.strokeWidth ?? 2) > 0} representation={element.features.representation} motions={element.motions} busy={busy} motionTiming={element.motionTiming} onTimingChange={(timing) => editElement({motionTiming:timing ?? undefined})} onEnvelope={(entrance,enterSeconds,exitSeconds) => void run(async () => {
								const result = await api<{template: Template}>("/elements/envelope", {template:draft,elementId:element.id,entrance,enterSeconds,exitSeconds});
								if (draftRef.current !== draft) throw new Error("模板已修改，请重新应用动效。");
								change(result.template);
							})} onChange={(motions) => editElement({ motions })} onEntrance={(entrance, durationFraction) => void run(async () => {
								const result = await api<{template: Template}>("/elements/entrance", {template:draft,elementId:element.id,entrance,durationFraction});
								if (draftRef.current !== draft) throw new Error("模板已修改，请重新应用动效。");
								change(result.template);
							})} />
							<Tool
								label="移除元素"
								disabled={busy || draft.elements.length <= 1}
								onClick={() => void run(async () => {
									const result = await api<{ template: Template }>("/elements/remove", {
										template: draft,
										elementId: selected,
									});
									if (draftRef.current !== draft) throw new Error("模板已修改，请重新移除元素。");
									change(result.template);
									setSelected(result.template.elements[0]?.id ?? "");
									setMessage("已移除元素，尚未保存");
								})}
							>
								<X />
							</Tool>
						</>
					) : (
						<>
							<FileJson size={24} />
							<h2>模板结构</h2>
							<p>
								{draft?.elements.length ?? 0} 个元素
								<br />
								{draft?.styles.length ?? 0} 套样式
								<br />
								{draft?.layouts.length ?? 0} 种布局
							</p>
						</>
					)}
				</aside>
			</div>
		</div>
	);
}
