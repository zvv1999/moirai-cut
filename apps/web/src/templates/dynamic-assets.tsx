"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trialHref } from "./trial-session";
import { AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, AlignStartHorizontal, AlignEndHorizontal, AlignStartVertical, AlignEndVertical, BringToFront, Check, Copy, Layers, Plus, RefreshCw, Save, SendToBack, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogBody,DialogFooter} from "@/components/ui/dialog";
import type { Element as TemplateElement, MotionTiming, Template, SpatialRelation, ReadingReplica } from "./types";
import { ReadingReplicaControls } from "./reading-replica-controls";
import { StarGeometryControls } from "./star-geometry-controls";
import { RectangleGeometryControls } from "./rectangle-geometry-controls";
import { requestDynamicAssetLayerEdit } from "./dynamic-asset-edit";
import { ShapeGeometryControls } from "./ellipse-arc-controls";
import { MotionCoverageControls } from "./motion-coverage-controls";
import {StyleReviews,StyleReviewSummary,useStyleReviewRecords} from "./style-reviews";
import {StyleThumbnail} from "./style-thumbnail";
import { StyleRuleSummary, startTimingLabels, endTimingLabels } from "./style-rule-summary";
import { EffectPreview } from "./effect-preview";
import { MinDisplayRule } from "./min-display-rule";
import { SizeBindingControls } from "./size-binding-controls";
import { ElementMotion } from "./element-motion";
import { VisualAssetLibrary } from "./visual-asset-library";
import { semanticRoleLabels } from "./ontology";

const guideLabels = {purpose:"用途与触发",invariants:"保持的风格",adjustments:"Agent可调整范围",constraints:"阅读与构图约束",fallback:"无法适配时",coverage:"已验证与未验证范围"} as const;
type UsageGuide = Record<keyof typeof guideLabels,string>;
const emptyGuide: UsageGuide = {purpose:"",invariants:"",adjustments:"",constraints:"",fallback:"",coverage:""};

type LibraryEntry = {assetId:string;revision:number;archived:boolean};

type Rect = { x: number; y: number; width: number; height: number };
type Layer = {
	parentId: string | null;
	content:
		| { kind: "group"; id: string; region: Rect; composite?: boolean; separateInstances?: boolean }
		| {
				kind: "element";
				element: {
					minDisplaySeconds?:number;
					id: string;
					description: string;
					binding: string;
					features: { representation: string; role?: string | null; outline?: boolean };
					ellipseArc?: TemplateElement["ellipseArc"];
                    starGeometry?: TemplateElement["starGeometry"];
					rectangleGeometry?: TemplateElement["rectangleGeometry"];
					literal?: string;
					styleId?: string | null;
					resourceId?: string | null;
					region: Rect;
					timing?: {
						anchor?: string;
                        endAnchor?: TemplateElement["timing"]["endAnchor"];
						offsetSeconds?: number;
						maxSeconds: number;
						minSeconds: number;
					};
					motions?: {
						property: string;
						keys: { time: number; value: number; easing: string }[];
					}[];
					motionTiming?: MotionTiming;
				};
		  };
};
type DynamicStyle = {
	id: string;
	fontFamily: string;
	fontSize: number;
	weight: number;
	fill: string;
	stroke: string;
	strokeWidth: number;
	italic: boolean;
	lineHeight: number;
	maxLines: number;
	description: string;
	background?: string | null;
	backgroundOpacity?: number | null;
	backgroundCornerRadius?: number | null;
	backgroundPadding?: {x:number;y:number} | null;
	textAlign?: "left" | "center" | "right";
	shadow?: {color:string;opacity:number;blur:number;x:number;y:number} | null;
};
type Asset = {
	minDisplaySeconds?:number;
	schemaVersion: string;
	id: string;
	revision: number;
	name: string;
	purposes?: string[];
	canvas: Template["canvas"];
	layers: Layer[];
	styles: DynamicStyle[];
	treatments?: {id:string;operation:{kind:string;motionTiming?:MotionTiming;mode?:string;color?:string;stroke?:{color:string;width:number}|null}}[];
	applications?: {treatmentId:string;target:{kind:string;id:string};enabled:boolean}[];
	spatialRelations?: SpatialRelation[];
	readingReplicas?: ReadingReplica[];
	inputs: {
		id: string;
		label: string;
		default: string;
		maxCharacters: number;
		layerIds: string[];
	}[];
	provenance: string;
	usageGuide?: UsageGuide;
};
type ElementLayer = Layer & {
	content: Extract<Layer["content"], { kind: "element" }>;
};
function elementLayer(layer: Layer): layer is ElementLayer {
	return layer.content.kind === "element";
}
type GroupLayer = Layer & {
	content: Extract<Layer["content"], { kind: "group" }>;
};
function groupLayer(layer: Layer): layer is GroupLayer {
	return layer.content.kind === "group";
}

const layerTypeLabels: Record<string,string> = {text:"文字",image:"图片",video:"视频",visual_media:"媒体",rectangle:"矩形",ellipse:"椭圆",star:"星形",line:"线条",audio:"声音"};
const purposeLabels: Record<string, string> = {keyword:"重点词",decorative_text:"花字",caption:"动态字幕",decoration:"装饰素材"};

export function DynamicAssetLibrary({
	api,
	template,
	onInsert,
	onMessage,
	onPendingChange,
}: {
	api: <T>(path: string, body?: unknown) => Promise<T>;
	template?: Template;
	onInsert?: (template: Template, selectedId: string) => void;
	onMessage: (message: string) => void;
	onPendingChange?: (pending: boolean) => void;
}) {
	const router = useRouter();
	const [assets, setAssets] = useState<Asset[]>([]);
	const [loading,setLoading]=useState(true);
	const [reviewRefresh,setReviewRefresh]=useState(0);
	const reviewState=useStyleReviewRecords(api,assets.length?`${reviewRefresh}|${assets.map(asset=>`${asset.id}:${asset.revision}`).join("|")}`:"");
	const [library,setLibrary]=useState<LibraryEntry[]>([]);
	const [archivedView,setArchivedView]=useState(false);
	const pendingCopy = useRef<{source:string;definition:Asset} | null>(null);
	const inspector = useRef<HTMLDivElement>(null);
	const detailPanel = useRef<HTMLDivElement>(null);
    const [inspectorSection,setInspectorSection]=useState("appearance");
    const [groupExitSeconds,setGroupExitSeconds]=useState(0.06);
    const [groupEnterSeconds,setGroupEnterSeconds]=useState(0);
    function jumpToSection(section:string) {
        setInspectorSection(section);
        requestAnimationFrame(()=>{
            const panel=inspector.current;
            const target=panel?.querySelector<HTMLElement>(`[data-style-section="${section}"]`);
            if(target instanceof HTMLDetailsElement)target.open=true;
            const heading=target instanceof HTMLDetailsElement?target.querySelector<HTMLElement>("summary")??target:target;
            heading?.focus({preventScroll:true});
            if(panel)panel.scrollTop=0;
        });
    }

	const libraryPanel = useRef<HTMLElement>(null);
	const fontOptionsId = useId();
	const [selected, setSelected] = useState<Asset | null>(null);
	const [quickPreview,setQuickPreview]=useState<Asset|null>(null);
	const previewTrigger=useRef<HTMLButtonElement|null>(null);
	const [inputs, setInputs] = useState<Record<string, string>>({});
	const [insertionFit, setInsertionFit] = useState("contain");
	const [stylesById, setStylesById] = useState<Record<string, Partial<DynamicStyle>>>({});
	const [activeLayerId, setActiveLayerId] = useState("");
	const [mediaLibraryOpen,setMediaLibraryOpen]=useState(false);
	const [createPurpose,setCreatePurpose]=useState("decorative_text");
	const [assetQuery,setAssetQuery]=useState("");
	const [purposeFilter,setPurposeFilter]=useState("all");
	const [purposes,setPurposes]=useState<string[]>([]);
	const [referenceLayerId,setReferenceLayerId]=useState("");
	const [placementSide,setPlacementSide]=useState("right");
	const [placementGap,setPlacementGap]=useState(2);
	const [newRepresentation, setNewRepresentation] = useState("text");
	const [elementRegions, setElementRegions] = useState<Record<string, Rect>>({});
	const [minDisplaySeconds,setMinDisplaySeconds]=useState<number>();
    const [minDisplayEdits,setMinDisplayEdits]=useState<Record<string,number|undefined>>({});
	const [durationEdits, setDurationEdits] = useState<Record<string, number>>(
		{},
	);
	const [motionEdits, setMotionEdits] = useState<Record<string, TemplateElement["motions"]>>({});
	const [motionTimings, setMotionTimings] = useState<Record<string, MotionTiming | null>>({});
	const [groupEdits, setGroupEdits] = useState<Record<string, Rect>>({});
	const [timingEdits, setTimingEdits] = useState<
		Record<string, { anchor: string; offsetSeconds: number; endAnchor?:TemplateElement["timing"]["endAnchor"] }>
	>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [name, setName] = useState("");
	const [usageGuide,setUsageGuide]=useState<UsageGuide|null>(null);
	const initialSelectionRead = useRef(false);
	const refresh = async () => {
		setReviewRefresh(value=>value+1);
		setLoading(true);
		setError("");
		try {
			const data = await api<{ assets: Asset[]; library?:LibraryEntry[] }>("/dynamic-assets");
			setAssets(data.assets);
			setLibrary(data.library??[]);
			const params = new URL(window.location.href).searchParams;
			const requestedId = template
				? initialSelectionRead.current ? null : params.get("insertStyle")
				: params.get("effect");
			const requested = data.assets.find(asset => asset.id === requestedId);
			initialSelectionRead.current = true;
			if (requestedId && !requested) {
				setSelected(null);
				setError("指定的样式不存在，请从样式库重新选择。");
				return;
			}
			const isArchived = (id: string) => (data.library ?? []).some(entry => entry.assetId === id && entry.archived);
			const scope = requested ? isArchived(requested.id) : template ? archivedView : params.get("styleLibrary") === "archived";
			setArchivedView(scope);
			setSelected((current) =>
				requested ?? data.assets.find(asset => asset.id === current?.id && isArchived(asset.id) === scope)
					?? (template ? data.assets.find(asset => isArchived(asset.id) === scope) : null) ?? null,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "读取动态素材失败");
		} finally {setLoading(false);}
	};
	useEffect(() => {
		void refresh();
	}, []);
	useEffect(() => {
		if (!template && selected) {
			const url = new URL(window.location.href);
			url.searchParams.set("effect", selected.id);
			if (archivedView) url.searchParams.set("styleLibrary", "archived");
			else url.searchParams.delete("styleLibrary");
			window.history.replaceState(window.history.state, "", url);
		}
	}, [selected?.id, archivedView, template]);
	useEffect(() => { if (inspector.current) inspector.current.scrollTop = 0; }, [selected?.id]);
	// Opening a single-purpose style starts creation in the same category.
	// Only a selection change does this, so an explicit picker choice survives edits and saves.
	useEffect(() => {
		if (!template && selected?.purposes?.length === 1 && purposeLabels[selected.purposes[0]]) {
			setCreatePurpose(selected.purposes[0]);
		}
	}, [selected?.id, template]);
	useEffect(() => {
		if (selected) {
			setName(selected.name);
            setMinDisplaySeconds(selected.minDisplaySeconds);
            setMinDisplayEdits(Object.fromEntries(selected.layers.filter(elementLayer).map(layer=>[layer.content.element.id,layer.content.element.minDisplaySeconds])));
			setUsageGuide(selected.usageGuide ?? null);
			setPurposes(selected.purposes ?? []);
			setInputs(
				Object.fromEntries(
					selected.inputs.map((input) => [input.id, input.default]),
				),
			);
			setStylesById(Object.fromEntries(selected.styles.map((style) => [style.id, style])));
			setMotionTimings(Object.fromEntries(selected.layers.filter(elementLayer).map((layer) => [layer.content.element.id,layer.content.element.motionTiming ?? null])));
			setActiveLayerId((current) => selected.layers.some((layer) =>
				(layer.content.kind === "group" ? layer.content.id : layer.content.element.id) === current)
				? current : selected.layers.find(elementLayer)?.content.element.id ?? "");
			setElementRegions(Object.fromEntries(selected.layers.filter(elementLayer).map((layer) => [layer.content.element.id, layer.content.element.region])));
			setDurationEdits(
				Object.fromEntries(
					selected.layers
						.filter(elementLayer)
						.flatMap((layer) =>
							layer.content.element.timing
								? [
										[
											layer.content.element.id,
											layer.content.element.timing.maxSeconds,
										],
									]
								: [],
						),
				),
			);
			setMotionEdits(
				Object.fromEntries(
					selected.layers
						.filter(elementLayer)
						.map((layer) => [layer.content.element.id, layer.content.element.motions ?? []]),
				),
			);
			setGroupEdits(
				Object.fromEntries(
					selected.layers
						.filter(groupLayer)
						.map((layer) => [layer.content.id, layer.content.region]),
				),
			);
			setTimingEdits(
				Object.fromEntries(
					selected.layers.filter(elementLayer).map((layer) => [
						layer.content.element.id,
						{
							anchor: layer.content.element.timing?.anchor ?? "video_start",
                            endAnchor: layer.content.element.timing?.endAnchor,
							offsetSeconds: layer.content.element.timing?.offsetSeconds ?? 0,
						},
					]),
				),
			);
		}
	}, [selected]);
	const layers = useMemo(() => selected?.layers ?? [], [selected]);
	const activeLayer = layers.find((layer) => (layer.content.kind === "group" ? layer.content.id : layer.content.element.id) === activeLayerId);
	const activeElement = activeLayer?.content.kind === "element" ? activeLayer.content.element : undefined;
	const activeRelation=selected?.spatialRelations?.find(relation=>relation.elementId===activeLayerId);
	useEffect(()=>{if(activeRelation){setReferenceLayerId(activeRelation.relativeTo);setPlacementSide(activeRelation.placement);setPlacementGap(activeRelation.gap*100);}},[activeRelation]);
	const siblingLayers=layers.filter(layer=>layer!==activeLayer&&layer.parentId===activeLayer?.parentId);
	const selectedReference=siblingLayers.find(layer=>(layer.content.kind==="group"?layer.content.id:layer.content.element.id)===referenceLayerId);
    const groupFade=selected?.treatments?.find(t=>t.id===`group-fade-${activeLayerId}` && t.operation.kind==="motion");
    const savedGroupExit=groupFade?.operation.motionTiming?.exitSeconds;
    const savedGroupEnter=groupFade?.operation.motionTiming?.enterSeconds;
    useEffect(()=>setGroupEnterSeconds(savedGroupEnter ?? 0),[activeLayerId,savedGroupEnter]);
    useEffect(()=>setGroupExitSeconds(savedGroupExit ?? 0.06),[activeLayerId,savedGroupExit]);
	const activeStyleId = activeElement?.styleId;
    const sharedStyleLayers = activeStyleId ? layers.filter(elementLayer).filter(layer=>layer.content.element.styleId===activeStyleId) : [];
    useEffect(()=>{
        if(!activeLayer)return;
        if((inspectorSection==="appearance"&&!activeStyleId&&!activeElement&&activeLayer.content.kind!=="group")||(inspectorSection==="motion"&&!activeElement))setInspectorSection("layout");
    },[activeLayer,activeStyleId,activeElement,inspectorSection]);
    const ancestorIds=new Set<string>();
    let ancestor=activeLayer?.parentId;
    while(ancestor&&!ancestorIds.has(ancestor)){ancestorIds.add(ancestor);ancestor=layers.find(layer=>layer.content.kind==="group"&&layer.content.id===ancestor)?.parentId;}
    const highlightApplication=selected?.applications?.find(application=>application.enabled
        && ((application.target.kind==="element"&&application.target.id===activeLayerId)||(application.target.kind==="group"&&ancestorIds.has(application.target.id)))
        && selected.treatments?.some(treatment=>treatment.id===application.treatmentId&&treatment.operation.kind==="text_highlight"));
    const inheritedHighlight=highlightApplication?.target.kind==="group"?highlightApplication:undefined;
    const activeHighlight=selected?.treatments?.find(treatment=>treatment.id===highlightApplication?.treatmentId)?.operation;
    const changeHighlight=(highlight:{mode:string;color:string;stroke?:{color:string;width:number}|null}|null)=>void editLayers(inheritedHighlight
        ? {kind:"highlight_treatment",layerId:activeLayerId,treatmentId:inheritedHighlight.treatmentId,highlight}
        : {kind:"text_presentation",layerId:activeLayerId,binding:activeElement?.binding,highlight});

	const styleEdits = activeStyleId ? stylesById[activeStyleId] ?? {} : {};
	const setStyleEdits = (style: Partial<DynamicStyle>) => {
		if (activeStyleId) setStylesById((current) => ({...current, [activeStyleId]: style}));
	};
	const activeRegion = activeLayer?.content.kind === "group"
		? groupEdits[activeLayer.content.id] ?? activeLayer.content.region
		: activeElement ? elementRegions[activeElement.id] ?? activeElement.region : undefined;
	const timingChanged =
		!!selected &&
		Object.entries(durationEdits).some(([id, value]) => {
			const layer = selected.layers.find(
				(item) =>
					item.content.kind === "element" && item.content.element.id === id,
			);
			return (
				layer?.content.kind === "element" &&
				layer.content.element.timing?.maxSeconds !== value
			);
		});
	const motionChanged =
		!!selected &&
		Object.entries(motionEdits).some(([elementId, value]) => {
			const layer = selected.layers.find(
				(item) =>
					item.content.kind === "element" &&
					item.content.element.id === elementId,
			);
			return (
				layer?.content.kind === "element" &&
				JSON.stringify(layer.content.element.motions ?? []) !== JSON.stringify(value)
			);
		});
	const groupChanged =
		!!selected &&
		Object.entries(groupEdits).some(([id, region]) => {
			const layer = selected.layers.find(
				(item) => item.content.kind === "group" && item.content.id === id,
			);
			return (
				layer?.content.kind === "group" &&
				JSON.stringify(layer.content.region) !== JSON.stringify(region)
			);
		});
	const temporalChanged =
		!!selected &&
		Object.entries(timingEdits).some(([id, timing]) => {
			const layer = selected.layers.find(
				(item) =>
					item.content.kind === "element" && item.content.element.id === id,
			);
			return (
				layer?.content.kind === "element" &&
				(layer.content.element.timing?.anchor !== timing.anchor ||
					layer.content.element.timing?.offsetSeconds !== timing.offsetSeconds || layer.content.element.timing?.endAnchor !== timing.endAnchor)
			);
		});
	const changed =
		!!selected &&
		(minDisplaySeconds!==selected.minDisplaySeconds || layers.filter(elementLayer).some(layer=>minDisplayEdits[layer.content.element.id]!==layer.content.element.minDisplaySeconds) || JSON.stringify(usageGuide)!==JSON.stringify(selected.usageGuide??null) || JSON.stringify([...purposes].sort()) !== JSON.stringify([...(selected.purposes ?? [])].sort()) || JSON.stringify(selected) !== JSON.stringify(assets.find((asset) => asset.id === selected.id)) || name !== selected.name || selected.inputs.some(
			(input) => (inputs[input.id] ?? input.default) !== input.default,
		) ||
			selected.styles.some((style) => Object.entries(stylesById[style.id] ?? {}).some(
				([key, value]) => JSON.stringify(value) !== JSON.stringify(style[key as keyof DynamicStyle]),
			)) ||
			layers.filter(elementLayer).some((layer) => JSON.stringify(elementRegions[layer.content.element.id] ?? layer.content.element.region) !== JSON.stringify(layer.content.element.region)) ||
			timingChanged ||
			motionChanged ||
			layers.filter(elementLayer).some((layer) => JSON.stringify(motionTimings[layer.content.element.id] ?? null) !== JSON.stringify(layer.content.element.motionTiming ?? null)) ||
			groupChanged ||
			temporalChanged);
	useEffect(() => { onPendingChange?.(changed || busy); return () => onPendingChange?.(false); }, [changed, busy, onPendingChange]);
	useEffect(() => {
		if (!changed) return;
		const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue=""; };
		window.addEventListener("beforeunload",prevent);
		return () => window.removeEventListener("beforeunload",prevent);
	}, [changed]);
	const editedDefinition = () => {
		if (!selected) return null;
			const definition = structuredClone(selected) as Asset;
			definition.name = name;
            if(minDisplaySeconds===undefined)delete definition.minDisplaySeconds;else definition.minDisplaySeconds=minDisplaySeconds;
			if(usageGuide) definition.usageGuide=usageGuide; else delete definition.usageGuide;
			definition.purposes = purposes;
			definition.inputs = definition.inputs.map((input) => ({
				...input,
				default: inputs[input.id] ?? input.default,
			}));
			definition.styles = definition.styles.map((style) =>
				({ ...style, ...stylesById[style.id] } as DynamicStyle),
			);
			definition.layers = definition.layers.map((layer) => {
				if (layer.content.kind === "group")
					return groupEdits[layer.content.id]
						? {
								...layer,
								content: {
									...layer.content,
									region: groupEdits[layer.content.id],
								},
							}
						: layer;
				const element = layer.content.element;
				const duration = durationEdits[element.id];
				const timing = timingEdits[element.id];
				const input = definition.inputs.find((candidate) =>
					candidate.layerIds.includes(element.id),
				);
				const motions = motionEdits[element.id] ?? element.motions;
				return {
					...layer,
					content: {
						...layer.content,
						element: {
							...element,
                            minDisplaySeconds:minDisplayEdits[element.id],
							region: elementRegions[element.id] ?? element.region,
							...(input ? { literal: input.default } : {}),
							...(element.timing && timing
								? {
										timing: {
											...element.timing,
											anchor: timing.anchor,
                                            endAnchor: timing.endAnchor,
											offsetSeconds: Math.max(
												-30,
												Math.min(30, timing.offsetSeconds),
											),
											...(duration
												? {
														maxSeconds: Math.max(
															element.timing.minSeconds,
															Math.min(600, duration),
														),
													}
												: {}),
										},
									}
								: {}),
							...(motions ? { motions } : {}),
							motionTiming: motionTimings[element.id] ?? undefined,
						},
					},
				};
			});
		return definition;
	};
	const currentEditedDefinition = useRef(editedDefinition);
	currentEditedDefinition.current = editedDefinition;
	const editLayers = async (operation: object, expectedSnapshot?:string) => {
		const definition = editedDefinition();
		if (!definition || busy) return;
		if(expectedSnapshot!==undefined && JSON.stringify(definition)!==expectedSnapshot){setError("样式已变化，请等待预览更新后再拖动。");return;}
		setBusy(true); setError("");
		try {
			const result = await requestDynamicAssetLayerEdit({ api, definition, operation, current: () => currentEditedDefinition.current() });
			setSelected(result.definition);
			setActiveLayerId(result.selectedLayerId);
		} catch (error) { setError(error instanceof Error ? error.message : "图层编辑失败"); }
		finally { setBusy(false); }
	};
	const save = async (openTrial = false) => {
		const definition = editedDefinition();
		if (!selected || !definition || !changed || busy) return;
		setError("");
		setBusy(true);
		try {
			const saved = await api<{ definition: Asset }>("/dynamic-assets", {
				definition,
				baseRevision: selected.revision,
				idempotencyKey: `edit-${selected.id}-${selected.revision}-${crypto.randomUUID()}`,
			});
			setAssets((current) =>
				current.map((item) =>
					item.id === saved.definition.id ? saved.definition : item,
				),
			);
			setSelected(saved.definition);
			onMessage(
				`${saved.definition.name} 已保存为 v${saved.definition.revision}。`,
			);
			if (openTrial) router.push(trialHref(saved.definition.id,saved.definition.revision));
		} catch (e) {
			setError(e instanceof Error ? e.message : "保存动态素材失败");
		} finally {
			setBusy(false);
		}
	};
	const editMedia = async (assetId:string,replace=false) => {
		const definition=editedDefinition();
		if(!definition||busy)return;
		setBusy(true);setError("");
		try {
			const result=await api<{definition:Asset;selectedLayerId:string}>("/dynamic-assets/media",{definition,assetId,...(replace?{layerId:activeLayerId,convertShape:activeElement?.features.representation==="rectangle"||activeElement?.features.representation==="ellipse"}:{parentId:activeLayer?.content.kind==="group"?activeLayer.content.id:activeLayer?.parentId??null})});
			setSelected(result.definition);setActiveLayerId(result.selectedLayerId);
			onMessage(replace?"图层素材已替换，尚未保存。":"素材图层已添加，尚未保存。");
		} catch(error){setError(error instanceof Error?error.message:"素材图层编辑失败");}
		finally {setBusy(false);}
	};
	const duplicate = async () => {
		const definition = editedDefinition();
		if (!definition || busy) return;
		setBusy(true); setError("");
		try {
			const source = JSON.stringify(definition);
			if (pendingCopy.current?.source !== source) {
				const draft = await api<{definition:Asset}>("/dynamic-assets/duplicate", {definition,name:`${name} 副本`});
				pendingCopy.current = {source,definition:draft.definition};
			}
			const copy = pendingCopy.current.definition;
			const saved = await api<{definition:Asset}>("/dynamic-assets", {definition:copy,baseRevision:0,idempotencyKey:`copy-${copy.id}`});
			pendingCopy.current = null;
			setAssets(current=>[saved.definition,...current.filter(asset=>asset.id!==saved.definition.id)]);
			setSelected(saved.definition); setArchivedView(false); setAssetQuery(""); setPurposeFilter("all");
			onMessage("已另存为独立样式。");
		} catch (error) { setError(error instanceof Error ? error.message : "另存样式失败"); }
		finally { setBusy(false); }
	};
	const insert = async () => {
		if (!selected || !template || !onInsert) return;
		setBusy(true);
		setError("");
		try {
			const data = await api<{ template: Template; instance: { id: string; layerMap: Record<string,string> } }>(
				"/dynamic-assets/insert",
				{
					template,
					assetId: selected.id,
					assetRevision: selected.revision,
					instanceId: `asset-${crypto.randomUUID().replaceAll("-", "")}`,
					inputs,
					placement: insertionFit === "contain" ? {x:0,y:0,width:1,height:1} : undefined,
				},
			);
			onInsert(data.template, Object.values(data.instance.layerMap)[0] ?? data.instance.id);
			onMessage(`${selected.name} 已插入模板，可在设计视图继续编辑。`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "插入动态素材失败");
		} finally {
			setBusy(false);
		}
	};
	const create = async () => {
		setBusy(true);
		try {
			const data = await api<{ definition: Asset }>(
				template ? "/dynamic-assets/draft" : "/dynamic-assets/create",
				template ?? {name:`新建${purposeLabels[createPurpose]}`,purpose:createPurpose,canvas:{width:720,height:720,fps:30}},
			);
			const saved = await api<{ definition: Asset }>("/dynamic-assets", {
				definition: data.definition,
				baseRevision: 0,
				idempotencyKey: `create-${data.definition.id}`,
			});
			setAssets((current) => [
				saved.definition,
				...current.filter((item) => item.id !== saved.definition.id),
			]);
			setSelected(saved.definition);
			setArchivedView(false);
			setAssetQuery("");
			setPurposeFilter(template ? "all" : createPurpose);
				onMessage("效果已创建。");
		} catch (e) {
			setError(e instanceof Error ? e.message : "创建动态素材失败");
		} finally {
			setBusy(false);
		}
	};
	async function archiveSelected() {
		if(!selected||busy||changed)return;
		setBusy(true);setError("");
		const entry=library.find(entry=>entry.assetId===selected.id);
		try {
			const result=await api<{entry:LibraryEntry}>("/dynamic-assets/archive",{assetId:selected.id,assetRevision:selected.revision,baseRevision:entry?.revision??0,archived:!entry?.archived});
			setLibrary(current=>[...current.filter(item=>item.assetId!==selected.id),result.entry]);
			setSelected(null);
			if(!template){const url=new URL(window.location.href);url.searchParams.delete("effect");window.history.replaceState(window.history.state,"",url);}
			onMessage(result.entry.archived?"样式已归档，可在已归档列表恢复。":"样式已恢复到使用中列表。");
		}catch(error){setError(error instanceof Error?error.message:"无法更新归档状态");}finally{setBusy(false);}
	}
	const visibleAssets = assets.filter(asset =>
		(library.some(entry=>entry.assetId===asset.id&&entry.archived) === archivedView) &&
		asset.name.toLowerCase().includes(assetQuery.trim().toLowerCase()) &&
		(purposeFilter === "all" || (purposeFilter === "unclassified" ? !asset.purposes?.length : asset.purposes?.includes(purposeFilter))),
	);
	return (
		<section className="tw-dynamic-assets" aria-label="动态素材库">
			<header className="tw-section-title">
				<div>
					<h2>样式库</h2>
					{!template && <p className="tw-style-guidance">选择样式 → 编辑文字与动效 → 保存后用声音试效果</p>}
					{template && <><p className="tw-style-guidance">目标模板：{template.name}。可先从模板库选择，再插入选中的样式；插入后需保存模板。</p><p className="tw-style-guidance">插入后可独立编辑各图层。出场跟随声音事件；未设置独立规则的图层沿用组合的 {template.visualRhythm.minDisplaySeconds} 秒最短显示；样式或图层可以在“应用规则”中设置独立值。短关键词可能延长停留。</p></>}
				</div>
				<div className="tw-row">
					<Button
						variant="ghost"
						size="icon"
						title="刷新动态素材"
						aria-label="刷新动态素材"
						onClick={() => void refresh()}
						disabled={busy || changed}
					>
						<RefreshCw />
					</Button>
					{!template&&<select aria-label="新建样式用途" value={createPurpose} disabled={busy||changed} onChange={event=>setCreatePurpose(event.target.value)}>{Object.entries(purposeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}
					<Button onClick={() => void create()} disabled={busy || changed}>
						<Plus />
						{template?"从模板创建":`新建${purposeLabels[createPurpose]}`}
					</Button>
				</div>
			</header>
            <Dialog open={!!quickPreview} onOpenChange={open=>{if(!open)setQuickPreview(null);}}>
                <DialogContent className="template-workbench tw-style-preview-dialog" onCloseAutoFocus={event=>{event.preventDefault();previewTrigger.current?.focus();}}>
                    <DialogHeader><DialogTitle>{quickPreview?.name}</DialogTitle><DialogDescription>只读试看。播放或更换示例文案不会修改样式。</DialogDescription></DialogHeader>
                    <DialogBody>{quickPreview&&<EffectPreview key={`${quickPreview.id}:${quickPreview.revision}`} definition={quickPreview}/>}</DialogBody>
                    <DialogFooter>
                        <Button variant="outline" onClick={()=>setQuickPreview(null)}>继续挑选</Button>
                        <Button onClick={()=>{if(quickPreview){setSelected(quickPreview);setQuickPreview(null);}}}>编辑这个样式</Button>
                        {quickPreview&&<Button asChild variant="outline"><Link href={trialHref(quickPreview.id,quickPreview.revision)}>用声音试效果</Link></Button>}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
			{error && <p role="alert">{error}</p>}
			{loading && <p role="status">正在读取样式库…</p>}
			{!loading && !assets.length && !error && (
				<div className="tw-empty">
					<Layers />
					<p>暂无效果素材</p>
					<Button onClick={() => void create()} disabled={busy}>
						<Plus />
						创建动态素材
					</Button>
				</div>
			)}
			<div className={`tw-dynamic-grid${!selected&&!template?" tw-style-browse":""}`}>
				<nav ref={libraryPanel} className="tw-dynamic-list" aria-label="效果素材列表">
					<select aria-label="样式库范围" value={archivedView?"archived":"active"} disabled={busy||changed} onChange={event=>{
						const archived = event.target.value === "archived";
						setArchivedView(archived);setSelected(null);
						if(!template){
							const url = new URL(window.location.href);
							url.searchParams.delete("effect");
							if(archived)url.searchParams.set("styleLibrary","archived");else url.searchParams.delete("styleLibrary");
							window.history.replaceState(window.history.state,"",url);
						}
					}}><option value="active">使用中</option><option value="archived">已归档</option></select>
					<input type="search" aria-label="搜索效果素材" placeholder="搜索样式名称" value={assetQuery} onChange={event=>setAssetQuery(event.target.value)} />
					<div className="tw-style-categories" role="group" aria-label="筛选样式用途">
						{Object.entries({all:"全部",...purposeLabels,unclassified:"未分类"}).map(([value,label])=><button key={value} type="button" aria-pressed={purposeFilter===value} onClick={()=>{setPurposeFilter(value);if(!template&&!busy&&!changed&&purposeLabels[value])setCreatePurpose(value);}}>{label}</button>)}
					</div>
					<p className="tw-style-review-help">评分只针对已评审的应用方案。选中样式后可查看布局、成片和评审依据。</p>
					<div className="tw-dynamic-results" role="region" aria-label="样式选项" tabIndex={0}>
					{assets.length>0&&!visibleAssets.length&&<p role="status">没有匹配的样式</p>}
					{visibleAssets.map((asset) => (
                        <div key={asset.id} className="tw-style-card">
						<button
							className={`tw-style-open${selected?.id === asset.id ? " active" : ""}`}
							aria-pressed={selected?.id === asset.id}
							disabled={busy}
							onClick={() => { if(changed){setError("请先保存当前效果的修改。");return;} setSelected(asset); requestAnimationFrame(() => { if (window.matchMedia("(max-width: 760px)").matches) detailPanel.current?.scrollIntoView({block:"start"}); }); }}
						>
							<StyleThumbnail key={`${asset.id}:${asset.revision}`} definition={asset}/>
							<strong>{asset.name}</strong>
							<small>
								v{asset.revision} · {asset.layers.length} 层
								{asset.purposes?.length ? ` · ${asset.purposes.map(purpose=>purposeLabels[purpose] ?? purpose).join("、")}` : " · 未分类"}
							</small>
						</button>
                        <StyleReviewSummary state={reviewState} assetId={asset.id} revision={asset.revision}/>
                        {!selected&&!template&&<button type="button" className="tw-style-quick-preview" aria-label={`预览动效：${asset.name}`} onClick={event=>{previewTrigger.current=event.currentTarget;setQuickPreview(asset);}}>预览动效</button>}
                        </div>
					))}
					</div>
				</nav>
				{!selected && !template && <section className="tw-style-start" aria-label="选择样式类型">
                    <h3>你想设计哪种效果？</h3>
                    <p>先选用途，再从样式列表挑选，或新建一个开始设计。</p>
                    <div className="tw-style-start-grid">{Object.entries(purposeLabels).map(([value,label])=><button type="button" key={value} aria-pressed={purposeFilter===value} onClick={()=>{setPurposeFilter(value);setCreatePurpose(value);requestAnimationFrame(()=>{if(window.matchMedia("(max-width: 760px)").matches)libraryPanel.current?.scrollIntoView({block:"start"});});}}>
                        <strong>{label}</strong>
                        <span>{({keyword:"突出说到的重点词：颜色、底色、缩放与弹跳。",decorative_text:"设计有表现力的文字：描边、阴影、装饰与组合动效。",caption:"设计整句字幕和逐词高亮，让样式随声音变化。",decoration:"制作图标、插画和动图，可与文字一起组合。"} as Record<string,string>)[value]}</span>
                    </button>)}</div>
                    <p>这里配置外观和相对动效。保存后用 TTS 或原声试效果，实际出现时间由声音对齐结果决定。</p>
                </section>}
				{selected && (
					<div ref={detailPanel} className="tw-dynamic-detail">

						<button type="button" className="tw-style-mobile-back" onClick={() => libraryPanel.current?.scrollIntoView({block:"start"})}>← 返回样式列表</button>
						<EffectPreview definition={editedDefinition()!} editing={{selectedId:activeLayerId,busy,canDetach:!!activeRelation,onDetachInFrame:(layerId,attached,independent,snapshot)=>editLayers({kind:"detach_in_frame",layerId,attached,independent},snapshot),onSelect:setActiveLayerId,onMove:(layerId,deltaX,deltaY)=>void editLayers({kind:"move",layerId,deltaX,deltaY}),onMoveInFrame:(layerId,deltaX,deltaY,basis,snapshot)=>void editLayers({kind:"move_in_frame",layerId,deltaX,deltaY,basis},snapshot),onScaleInFrame:(layerId,change,snapshot)=>void editLayers({kind:"scale_in_frame",layerId,...change},snapshot),onResize:(layerId,corner,deltaX,deltaY)=>void editLayers({kind:"resize",layerId,corner,deltaX,deltaY})}} />
						<div className="tw-dynamic-meta">
                            {!template&&<p className="tw-style-guidance"><strong>正在编辑库中的模板样式。</strong>保存会生成新版本，供后续应用复用。只调整某份视频的位置、行宽或关键词，请进入“用声音试效果”。</p>}
                            {!template&&<Button variant="ghost" disabled={busy||changed} onClick={()=>{setSelected(null);setError("");const url=new URL(window.location.href);url.searchParams.delete("effect");window.history.replaceState(window.history.state,"",url);}}>← 返回用途选择</Button>}
							<input aria-label="效果名称" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
							<span>v{selected.revision}</span>
							<Button variant="ghost" size="icon" title="另存为新样式" aria-label="另存为新样式" disabled={busy} onClick={()=>void duplicate()}><Copy /></Button>
							<Button
								variant="outline"
								onClick={() => void save()}
								disabled={busy || !changed}
							>
								<Save />
								保存样式新版本
							</Button>
							<Button variant="ghost" size="icon" title="撤销未保存修改" aria-label="撤销未保存修改" disabled={busy || !changed} onClick={() => {setSelected(structuredClone(assets.find((asset) => asset.id === selected.id) ?? selected));setError("");onMessage("");}}><Undo2 /></Button>
							<Button variant="outline" disabled={busy||changed} onClick={()=>void archiveSelected()}>{library.some(entry=>entry.assetId===selected.id&&entry.archived)?"恢复样式":"归档样式"}</Button>
							{!template && (changed ? <Button disabled={busy} onClick={()=>void save(true)}>保存并用声音试效果</Button> : <Button asChild disabled={busy}><Link aria-disabled={busy} tabIndex={busy ? -1 : undefined} onClick={event=>{if(busy)event.preventDefault();}} href={trialHref(selected.id,selected.revision)}>用声音试效果</Link></Button>)}
							{!template && <Button asChild variant="outline" disabled={busy || changed}><Link aria-disabled={busy || changed} tabIndex={busy || changed ? -1 : undefined} onClick={event=>{if(busy||changed)event.preventDefault();}} href={`/templates/compositions?insertStyle=${encodeURIComponent(selected.id)}`}>选择模板组合</Link></Button>}
							{template && onInsert && <><select aria-label="插入画幅适配" value={insertionFit} disabled={busy} onChange={(event) => setInsertionFit(event.target.value)}>
								<option value="contain">等比适配画布</option><option value="exact">保持原画布尺寸</option>
							</select><Button onClick={() => void insert()} disabled={busy || changed}>
								<Check />
								插入当前模板
							</Button></>}
						</div>
						<div ref={inspector} className="tw-effect-inspector" role="region" aria-label="样式属性" tabIndex={0}>
						<nav className="tw-inspector-navigation" aria-label="属性快捷定位">{([
                            ["layers","图层",false], ["appearance","外观",!activeStyleId&&!activeElement&&activeLayer?.content.kind!=="group"], ["layout","布局",!activeRegion], ["motion","动效",!activeElement], ["rules","应用规则",false]
                        ] as const).map(([section,label,disabled])=><button key={section} type="button" disabled={disabled||busy} aria-pressed={inspectorSection===section} onClick={()=>jumpToSection(section)}>{label}</button>)}</nav>
                        <label className="tw-inspector-layer">当前图层<select aria-label="当前样式图层" disabled={busy} value={activeLayerId} onChange={event=>setActiveLayerId(event.target.value)}>{layers.map(layer=>{const id=layer.content.kind==="group"?layer.content.id:layer.content.element.id;return <option key={id} value={id}>{layer.content.kind==="group"?`${id}（容器）`:layer.content.element.description}</option>;})}</select></label>
                        {activeLayer?.content.kind === "group" && <fieldset disabled={busy} hidden={inspectorSection!=="appearance"}>
                            <legend>容器合成</legend>
                            <label><input type="checkbox" aria-label="整组合成" checked={activeLayer.content.composite ?? false} onChange={event=>void editLayers({kind:"group_compositing",layerId:activeLayerId,composite:event.target.checked})} />先合成整组，再应用组效果</label>
                            <p className="tw-style-guidance">适合由多个重叠部件组成的图标。组透明度会在合成后生效；已有子图层的透明度和动效保持不变。</p>
                            {activeLayer.content.composite && <div>
                                <label><input type="checkbox" aria-label="按显示区间重复组动效" checked={activeLayer.content.separateInstances ?? false} onChange={event=>void editLayers({kind:"group_instances",layerId:activeLayerId,separateInstances:event.target.checked})} />每个独立显示区间重新播放组动效</label>
                                <p className="tw-style-guidance">分开的或首尾相接的显示区间分别播放；重叠图层合为一个区间。关闭时，组动效覆盖全部出现的总时长。</p>
                                <label>入场预留（秒）<input aria-label="整组入场预留（秒）" type="number" min={0} max={30} step={0.01} value={groupEnterSeconds} onChange={event=>setGroupEnterSeconds(event.target.valueAsNumber)} /></label>
                                <label>淡出时长（秒）<input aria-label="整组淡出时长（秒）" type="number" min={0} max={30} step={0.01} value={groupExitSeconds} onChange={event=>setGroupExitSeconds(event.target.valueAsNumber)} /></label>
                                <Button variant="outline" disabled={!Number.isFinite(groupExitSeconds)||groupExitSeconds<0||groupExitSeconds>30||!Number.isFinite(groupEnterSeconds)||groupEnterSeconds<0||groupEnterSeconds>30} onClick={()=>void editLayers({kind:"group_fade",layerId:activeLayerId,exitSeconds:groupExitSeconds,enterSeconds:groupEnterSeconds})}>应用整组淡出</Button>
                                {groupFade&&<Button variant="ghost" onClick={()=>void editLayers({kind:"group_fade",layerId:activeLayerId,exitSeconds:null})}>移除整组淡出</Button>}
                                {groupFade?.operation.motionTiming && <MotionCoverageControls label="整组动效" timing={groupFade.operation.motionTiming} disabled={busy} onChange={motionTiming => {
                                    const definition = editedDefinition();
                                    if (!definition) return;
                                    definition.treatments = definition.treatments?.map(treatment => treatment.id === groupFade.id ? { ...treatment, operation: { ...treatment.operation, motionTiming } } : treatment);
                                    setSelected(definition);
                                }} />}
                                <p className="tw-style-guidance">每个组实例按指定时长退场；短区间会按入场预留与淡出时长的比例一起压缩。子图层自身的透明度仍会叠加。</p>
                            </div>}
                        </fieldset>}
                        {activeElement&&<StyleRuleSummary binding={activeElement.binding} text={activeElement.features.representation==="text"} timing={timingEdits[activeElement.id]??{anchor:activeElement.timing?.anchor??"video_start",endAnchor:activeElement.timing?.endAnchor,offsetSeconds:activeElement.timing?.offsetSeconds??0}} maxSeconds={durationEdits[activeElement.id]??activeElement.timing?.maxSeconds??2} busy={busy} onEdit={()=>jumpToSection("rules")}/>}
                        <StyleReviews key={`${selected.id}:${selected.revision}`} state={reviewState} assetId={selected.id} revision={selected.revision} changed={changed}/>
						<fieldset disabled={busy} className="tw-layer-editor tw-layer-editor-focused" hidden={inspectorSection==="motion"}>
							<fieldset hidden={inspectorSection!=="rules"}><legend>样式用途</legend><p>用途方便查找，可同时选择。花字描述外观；实际显示重点词还是整句，由文字图层的“内容来源”决定。</p><div className="tw-row">
								{Object.entries(purposeLabels).map(([value,label])=><label key={value}><input type="checkbox" checked={purposes.includes(value)} onChange={event=>setPurposes(current=>event.target.checked?[...current,value]:current.filter(purpose=>purpose!==value))} />{label}</label>)}
							</div></fieldset>
							<details hidden={inspectorSection!=="layers"} open={mediaLibraryOpen} onToggle={event=>setMediaLibraryOpen(event.currentTarget.open)}><summary>素材库 · 添加与替换</summary>
								{mediaLibraryOpen&&<VisualAssetLibrary busy={busy} insertLabel="添加素材图层" onInsert={assetId=>void editMedia(assetId)} onReplace={assetId=>void editMedia(assetId,true)} replaceKind={activeElement?.features.representation} allowShapeConversion/>}
							</details>
							<div hidden={inspectorSection!=="layers"}>
								<h3 data-style-section="layers" tabIndex={-1}>图层结构</h3>
								<div className="tw-layer-tools">
									<select aria-label="新增图层类型" value={newRepresentation} onChange={(event) => setNewRepresentation(event.target.value)}>
										<option value="text">文字</option><option value="rectangle">矩形</option><option value="ellipse">椭圆</option><option value="star">星形</option><option value="line">线条</option>
									</select>
									<Button variant="ghost" size="icon" title="添加图层" aria-label="添加图层" onClick={() => void editLayers({kind:"add",representation:newRepresentation,parentId:activeLayer?.content.kind === "group" ? activeLayer.content.id : activeLayer?.parentId ?? null})}><Plus /></Button>
									<Button variant="ghost" size="icon" title="复制所选图层" aria-label="复制所选图层" disabled={!activeLayer} onClick={() => void editLayers({kind:"duplicate",layerId:activeLayerId})}><Copy /></Button>
									<Button variant="ghost" size="icon" title="置于顶层" aria-label="置于顶层" disabled={!activeElement} onClick={() => void editLayers({kind:"stack",layerId:activeLayerId,position:"front"})}><BringToFront /></Button>
									<Button variant="ghost" size="icon" title="置于底层" aria-label="置于底层" disabled={!activeElement} onClick={() => void editLayers({kind:"stack",layerId:activeLayerId,position:"back"})}><SendToBack /></Button>
									<Button variant="ghost" size="icon" title="删除所选图层" aria-label="删除所选图层" disabled={!activeLayer} onClick={() => void editLayers({kind:"remove",layerId:activeLayerId})}><Trash2 /></Button>
								</div>
								<ol>
									{layers.map((layer) => (
										<li
											key={
												layer.content.kind === "group"
													? layer.content.id
													: layer.content.element.id
											}
										>
											<button type="button" className="tw-layer-select" aria-pressed={activeLayerId === (layer.content.kind === "group" ? layer.content.id : layer.content.element.id)} onClick={() => setActiveLayerId(layer.content.kind === "group" ? layer.content.id : layer.content.element.id)}>
											<Layers size={16} />
											{layer.content.kind === "group"
												? `${layer.content.id}（容器）`
												: `${layer.content.element.description} · ${layerTypeLabels[layer.content.element.features.representation] ?? layer.content.element.features.representation}`}
											</button>
										</li>
									))}
								</ol>
							</div>
							<div hidden={inspectorSection!=="appearance"&&inspectorSection!=="layout"}>
                                <div hidden={inspectorSection!=="appearance"}>
								{activeElement?.binding === "literal" && activeElement.features.representation === "text" && selected.inputs.some(input=>input.layerIds.includes(activeLayerId)) && <>
								<h3>默认文字</h3>
								{selected.inputs.filter((input) => input.layerIds.includes(activeLayerId)).map((input) => (
									<label key={input.id}>
										{input.label}
										<input
											value={inputs[input.id] ?? ""}
											maxLength={input.maxCharacters}
											onChange={(e) =>
												setInputs({ ...inputs, [input.id]: e.target.value })
											}
										/>
										<small>
											{(inputs[input.id] ?? "").length}/{input.maxCharacters} 字
										</small>
									</label>
								))}
								</>}
                                {(activeElement?.features.representation==="star"||activeElement?.starGeometry)&&<StarGeometryControls value={activeElement.starGeometry} eligible={activeElement.features.representation==="star"} disabled={busy} onChange={starGeometry=>void editLayers({kind:"star_geometry",layerId:activeLayerId,starGeometry:starGeometry??null})}/>}
                                {(activeElement?.features.representation==="rectangle"||activeElement?.rectangleGeometry)&&<RectangleGeometryControls value={activeElement.rectangleGeometry} eligible={activeElement.features.representation==="rectangle"} disabled={busy} onChange={rectangleGeometry=>void editLayers({kind:"rectangle_geometry",layerId:activeLayerId,rectangleGeometry:rectangleGeometry??null})}/>}
                                {activeElement && <ShapeGeometryControls element={activeElement} strokeWidth={styleEdits.strokeWidth} disabled={busy} onOutline={enabled=>void editLayers({kind:"outline",layerId:activeLayerId,enabled})} onArc={ellipseArc=>void editLayers({kind:"ellipse_arc",layerId:activeLayerId,ellipseArc:ellipseArc??null})}/>}
								{activeStyleId && <>
								<h3 data-style-section="appearance" tabIndex={-1}>视觉样式</h3>
                                {sharedStyleLayers.length>1&&<div className="tw-style-guidance" role="note" aria-label="共享外观样式">
                                    <p>当前外观由 {sharedStyleLayers.length} 个图层共用：{sharedStyleLayers.map(layer=>layer.content.element.description).join("、")}。修改字体、颜色、描边和底板会同步影响这些图层。</p>
                                    <Button variant="outline" onClick={()=>void editLayers({kind:"detach_style",layerId:activeLayerId})}>仅为当前图层独立外观</Button>
                                    <p>独立后保留当前外观；内容、时机、动效及高亮关系保持原样。</p>
                                </div>}
								{activeElement?.features.representation === "text" && <>
								{inheritedHighlight&&<p className="tw-style-guidance" role="note">继承分组 {inheritedHighlight.target.id} 的共享高亮。修改或关闭将影响该高亮的所有引用图层；文字内容和出现时机保持独立。</p>}
								<label>高亮方式<select aria-label="文字高亮方式" value={activeHighlight?.mode ?? (activeHighlight ? "keyword" : "none")} onChange={(event) => changeHighlight(event.target.value === "none" ? null : {mode:event.target.value,color:activeHighlight?.color ?? "#FFE064",stroke:activeHighlight?.stroke})}>
									<option value="none">无</option><option value="keyword" disabled={activeElement.binding === "literal"}>重点词高亮</option><option value="active_word" disabled={activeElement.binding !== "sentence"}>逐字高亮</option>
								</select></label>
                                {activeElement.binding !== "sentence" && <p className="tw-style-guidance">{activeElement.binding === "literal" ? "固定文字不包含声音对齐的词标注。使用重点词高亮需先选择动态内容；逐字高亮需选择字幕句子。" : "逐字高亮需要整句内容及每个词的声音时间；请先将内容来源切换为字幕句子。"}</p>}
								{activeHighlight && <label>高亮颜色<input aria-label="文字高亮颜色" type="color" value={activeHighlight.color ?? "#FFE064"} onChange={(event) => changeHighlight({mode:activeHighlight.mode ?? "keyword",color:event.target.value,stroke:activeHighlight.stroke})} /></label>}
                                {activeHighlight&&<>
                                    <label><input aria-label="高亮文字单独描边" type="checkbox" checked={!!activeHighlight.stroke} onChange={event=>changeHighlight({mode:activeHighlight.mode??"keyword",color:activeHighlight.color??"#FFE064",stroke:event.target.checked?{color:"#171B20",width:3}:null})}/>高亮文字单独描边</label>
                                    {activeHighlight.stroke&&<>
                                        <label>高亮描边颜色<input aria-label="高亮描边颜色" type="color" value={activeHighlight.stroke.color} onChange={event=>changeHighlight({mode:activeHighlight.mode??"keyword",color:activeHighlight.color??"#FFE064",stroke:{color:event.target.value,width:activeHighlight.stroke!.width}})}/></label>
                                        <label>高亮描边宽度<input aria-label="高亮描边宽度" type="number" min={0} max={30} step={0.5} value={activeHighlight.stroke.width} onChange={event=>{const width=event.target.valueAsNumber;if(Number.isFinite(width)&&width>=0&&width<=30)changeHighlight({mode:activeHighlight.mode??"keyword",color:activeHighlight.color??"#FFE064",stroke:{color:activeHighlight.stroke!.color,width}});}}/>画布像素</label>
                                    </>}
                                    <small>只作用于当前高亮的文字；关闭后沿用普通文字描边。</small>
                                </>}
								<label><input type="checkbox" checked={!!styleEdits.background} onChange={event=>setStyleEdits({...styleEdits,background:event.target.checked?"#DDFC74":null})}/> 文字底色</label>
								{styleEdits.background&&<>
                                    <label>底板不透明度 <output>{Math.round((styleEdits.backgroundOpacity ?? 1)*100)}%</output><input aria-label="底板不透明度" type="range" min={0} max={1} step={0.01} value={styleEdits.backgroundOpacity ?? 1} onChange={event=>setStyleEdits({...styleEdits,backgroundOpacity:event.target.valueAsNumber})}/></label>
                                    <label>底板圆角 <output>{styleEdits.backgroundCornerRadius ?? 0}%</output><input aria-label="底板圆角" type="range" min={0} max={100} step={1} value={styleEdits.backgroundCornerRadius ?? 0} onChange={event=>setStyleEdits({...styleEdits,backgroundCornerRadius:event.target.valueAsNumber})}/></label>
                                    <small>0% 为直角，100% 为最大圆角；随文字底板尺寸适配。</small>
									<label>底色<input aria-label="文字底色颜色" type="color" value={styleEdits.background} onChange={event=>setStyleEdits({...styleEdits,background:event.target.value})}/></label>
									{([ ["x","横向留白"], ["y","纵向留白"] ] as const).map(([key,label])=><label key={key}>{label}<input aria-label={label} type="number" min={0} max={256} step={1} value={styleEdits.backgroundPadding?.[key]??0} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))setStyleEdits({...styleEdits,backgroundPadding:{x:styleEdits.backgroundPadding?.x??0,y:styleEdits.backgroundPadding?.y??0,[key]:event.target.valueAsNumber}});}}/></label>)}
								</>}
								<label>
									字体
									<input
										aria-label="字体名称"
										list={fontOptionsId}
										value={String(styleEdits.fontFamily ?? "")}
										onChange={(e) =>
											setStyleEdits({
												...styleEdits,
												fontFamily: e.target.value,
											})
										}
									/>
									<datalist id={fontOptionsId}>{[...new Set([...SYSTEM_FONTS,"PingFang SC","Songti SC","Heiti SC","Kaiti SC",...selected.styles.map(style=>style.fontFamily)])].map(family=><option key={family} value={family}/>)}</datalist>
								</label>
								<label>
									字号
									<input
										type="number"
										min="8"
										max="500"
										value={styleEdits.fontSize ?? 72}
										onChange={(e) =>
											setStyleEdits({
												...styleEdits,
												fontSize: Number(e.target.value),
											})
										}
									/>
								</label>
								<label>字重<select aria-label="字重" value={styleEdits.weight ?? 700} onChange={event=>setStyleEdits({...styleEdits,weight:Number(event.target.value)})}>{[100,200,300,400,500,600,700,800,900].map(weight=><option key={weight} value={weight}>{weight}</option>)}{styleEdits.weight && styleEdits.weight%100!==0 && <option value={styleEdits.weight}>{styleEdits.weight}</option>}</select></label>
								<label><input aria-label="斜体" type="checkbox" checked={styleEdits.italic ?? false} onChange={event=>setStyleEdits({...styleEdits,italic:event.target.checked})}/>斜体</label>
								<label>文字对齐<select aria-label="文字对齐" value={styleEdits.textAlign ?? "center"} onChange={event=>setStyleEdits({...styleEdits,textAlign:event.target.value as DynamicStyle["textAlign"]})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
								<label>行高<input aria-label="行高" type="number" min={0.8} max={3} step={0.05} value={styleEdits.lineHeight ?? 1.2} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))setStyleEdits({...styleEdits,lineHeight:event.target.valueAsNumber});}}/></label>
								<label>最多行数<input aria-label="最多行数" type="number" min={1} max={5} step={1} value={styleEdits.maxLines ?? 2} onChange={event=>{if(Number.isInteger(event.target.valueAsNumber))setStyleEdits({...styleEdits,maxLines:event.target.valueAsNumber});}}/></label>
								<label><input aria-label="文字阴影" type="checkbox" checked={!!styleEdits.shadow} onChange={event=>setStyleEdits({...styleEdits,shadow:event.target.checked?{color:"#000000",opacity:0.6,blur:6,x:0,y:3}:null})}/>文字阴影</label>
								{styleEdits.shadow && <>
									<label>阴影颜色<input aria-label="阴影颜色" type="color" value={styleEdits.shadow.color} onChange={event=>setStyleEdits({...styleEdits,shadow:{...styleEdits.shadow!,color:event.target.value}})}/></label>
									{([ ["opacity","阴影不透明度",0,1,0.05], ["blur","阴影模糊",0,100,1], ["x","阴影横向偏移",undefined,undefined,1], ["y","阴影纵向偏移",undefined,undefined,1] ] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={styleEdits.shadow![key]} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))setStyleEdits({...styleEdits,shadow:{...styleEdits.shadow!,[key]:event.target.valueAsNumber}});}}/></label>)}
								</>}
								</>}
								<label>
									填充色
									<input
										type="color"
										value={styleEdits.fill ?? "#FFFFFF"}
										onChange={(e) =>
											setStyleEdits({
												...styleEdits,
												fill: e.target.value.toUpperCase(),
											})
										}
									/>
								</label>
								<label>
									描边色
									<input
										type="color"
										value={styleEdits.stroke ?? "#202426"}
										onChange={(e) =>
											setStyleEdits({
												...styleEdits,
												stroke: e.target.value.toUpperCase(),
											})
										}
									/>
								</label>
								<label>
									描边宽度
									<input
										type="number"
										min="0"
										max="30"
										step="0.5"
										value={styleEdits.strokeWidth ?? 6}
										onChange={(e) =>
											setStyleEdits({
												...styleEdits,
												strokeWidth: Number(e.target.value),
											})
										}
									/>
								</label>
								</>}
								</div>
								{activeRegion && <div className="tw-layer-region" hidden={inspectorSection!=="layout"}>
									<h3 data-style-section="layout" tabIndex={-1}>位置与尺寸</h3>
									<div className="tw-layer-tools" role="group" aria-label="相对容器对齐">
										{([
											["left", "靠左对齐", AlignStartVertical], ["center", "水平居中", AlignHorizontalDistributeCenter], ["right", "靠右对齐", AlignEndVertical],
											["top", "顶部对齐", AlignStartHorizontal], ["middle", "垂直居中", AlignVerticalDistributeCenter], ["bottom", "底部对齐", AlignEndHorizontal],
										] as const).map(([alignment,label,Icon]) => <Button key={alignment} disabled={!!activeRelation} variant="ghost" size="icon" title={label} aria-label={label} onClick={() => void editLayers({kind:"align",layerId:activeLayerId,alignment})}><Icon /></Button>)}
									</div>
									{(["x", "y", "width", "height"] as const).map((field) => <label key={field}>
										{activeRelation&&(field==="x"||field==="y")?{x:"横向偏移",y:"纵向偏移"}[field]:{x:"横向位置",y:"纵向位置",width:"宽度",height:"高度"}[field]} %
										<input type="number" disabled={(field === "width" || field === "height") && !!activeRelation?.sizeBinding?.[field]} min={field === "width" || field === "height" ? 1 : activeRelation?-100:0} max={100} step={1} value={Math.round((activeRelation&&(field==="x"||field==="y")?activeRelation[field==="x"?"offsetX":"offsetY"]:activeRegion[field]) * 10000) / 100} onChange={(event) => {
											const value = event.target.valueAsNumber;
											if (!Number.isFinite(value)) return;
											if(activeRelation&&(field==="x"||field==="y")){void editLayers({kind:"spatial_relation",layerId:activeLayerId,relation:{...activeRelation,[field==="x"?"offsetX":"offsetY"]:value/100}});return;}
											const region = {...activeRegion, [field]:value / 100};
											if (activeLayer?.content.kind === "group") setGroupEdits((current) => ({...current,[activeLayerId]:region}));
											else setElementRegions((current) => ({...current,[activeLayerId]:region}));
										}} />
									</label>)}
                                    {activeRelation?.sizeBinding&&<p>已开启的宽高由文字实际尺寸决定。展开“相对摆放”调整倍数与留白；画面缩放手柄仍可调整整体大小。</p>}
									{(siblingLayers.length>0||activeRelation)&&<details className="tw-relative-placement"><summary>相对摆放</summary>
										<label>参照图层<select aria-label="摆放参照图层" value={selectedReference?referenceLayerId:""} onChange={event=>setReferenceLayerId(event.target.value)}><option value="">选择图层</option>{siblingLayers.map(layer=>{const id=layer.content.kind==="group"?layer.content.id:layer.content.element.id;return <option key={id} value={id}>{layer.content.kind==="group"?layer.content.id:layer.content.element.description}</option>;})}</select></label>
										<label>方向<select aria-label="相对摆放方向" value={placementSide} onChange={event=>setPlacementSide(event.target.value)}><option value="overlay" disabled={!activeElement}>居中重叠（跟随关系）</option><option value="left">左侧</option><option value="right">右侧</option><option value="above">上方</option><option value="below">下方</option></select></label>
										<label>间距 %<input aria-label="相对摆放间距" type="number" min={0} max={100} step={0.5} value={placementGap} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))setPlacementGap(event.target.valueAsNumber);}} /></label>
										<Button disabled={!!activeRelation||!selectedReference||placementSide==="overlay"||placementGap<0||placementGap>100} onClick={()=>void editLayers({kind:"place_beside",layerId:activeLayerId,referenceId:referenceLayerId,side:placementSide,gap:placementGap/100})}><Check/>应用摆放</Button>
										{activeElement&&<Button disabled={selectedReference?.content.kind!=="element"||placementGap<0||placementGap>100} onClick={()=>void editLayers({kind:"spatial_relation",layerId:activeLayerId,relation:{...activeRelation,elementId:activeLayerId,relativeTo:referenceLayerId,placement:placementSide,gap:placementGap/100,offsetX:activeRelation?.offsetX??0,offsetY:activeRelation?.offsetY??0,followMotion:true}})}><Check/>建立跟随关系</Button>}
										{activeRelation&&<><label>跟随位移、缩放与旋转<input type="checkbox" disabled={activeRelation.referenceBounds==="text_box"} checked={activeRelation.followMotion??false} onChange={event=>void editLayers({kind:"spatial_relation",layerId:activeLayerId,relation:{...activeRelation,followMotion:event.target.checked}})}/></label><label>参照边界<select aria-label="图层参照边界" value={activeRelation.referenceBounds??"layout"} disabled={!!activeRelation.sizeBinding} onChange={event=>void editLayers({kind:"spatial_relation",layerId:activeLayerId,relation:{...activeRelation,...(event.target.value==="text_box"?{referenceBounds:"text_box",followMotion:true}:{referenceBounds:"layout"})}})}><option value="layout">布局区域</option><option value="text_box" disabled={!selected.layers.some(layer=>layer.content.kind==="element"&&layer.content.element.id===activeRelation.relativeTo&&layer.content.element.features.representation==="text")}>文字实际边界</option></select>{activeRelation.sizeBinding&&<small>关闭尺寸跟随后可更换参照边界。</small>}</label>
                                        <SizeBindingControls label="当前图层" value={activeRelation.sizeBinding} eligible={activeRelation.referenceBounds==="text_box"&&activeRelation.followMotion===true&&["rectangle","ellipse","star","line"].includes(activeElement?.features.representation??"")&&selected.layers.some(layer=>layer.content.kind==="element"&&layer.content.element.id===activeRelation.relativeTo&&layer.content.element.features.representation==="text")} onChange={sizeBinding=>void editLayers({kind:"spatial_relation",layerId:activeLayerId,relation:{...activeRelation,sizeBinding}})}/>
                                        <small>暂停预览后，可在画面上方解除依附并保持当前外观。</small></>}
									</details>}
								</div>}
							</div>
						</fieldset>
						{activeElement && <fieldset hidden={inspectorSection!=="motion"} disabled={busy} data-style-section="motion" tabIndex={-1}>
							<ElementMotion compact key={activeElement.id} motions={motionEdits[activeElement.id] ?? activeElement.motions ?? []}
								representation={activeElement.features.representation} busy={busy} allowReveal={false} allowStrokeReveal={activeElement.features.representation === "ellipse" && !!activeElement.features.outline && (styleEdits.strokeWidth ?? 2) > 0}
								motionTiming={motionTimings[activeElement.id]}
								onTimingChange={(timing) => setMotionTimings((current) => ({...current,[activeElement.id]:timing}))}
								onEnvelope={(entrance,enterSeconds,exitSeconds) => void editLayers({kind:"envelope",layerId:activeElement.id,entrance,enterSeconds,exitSeconds})}
								onChange={(motions) => setMotionEdits((current) => ({...current,[activeElement.id]:motions}))}
								onEntrance={(entrance,durationFraction) => void editLayers({kind:"entrance",layerId:activeElement.id,entrance,durationFraction})} />
						</fieldset>}
						<details hidden={inspectorSection!=="rules"} open className="tw-advanced-panel" data-style-section="rules" inert={busy}>
							<summary>样式与图层的应用规则</summary>
                            <fieldset disabled={busy}><legend>整个样式的显示规则</legend><MinDisplayRule label="样式默认" value={minDisplaySeconds} onChange={setMinDisplaySeconds} inherited="沿用应用组合的显示规则。"/><p className="tw-style-guidance">作为这个样式的默认值保存。试映时可临时覆盖；单个图层的独立设置优先。</p></fieldset>
                            {activeElement && <fieldset disabled={busy}><legend>承担什么角色</legend>
                                <label>语义角色<select aria-label="图层语义角色" value={activeElement.features.role ?? ""} onChange={event=>void editLayers({kind:"semantic_role",layerId:activeLayerId,role:event.target.value || null})}>
                                    <option value="">未指定</option>{Object.entries(semanticRoleLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                                </select></label>
                                <p className="tw-style-guidance">告诉人和 AI 这个图层承担什么作用。角色独立于样式用途、内容来源和出现时机；更改角色会保留外观与动效。</p>
                            </fieldset>}
                            {activeElement && <ReadingReplicaControls element={activeElement} elements={layers.filter(elementLayer).map(layer => layer.content.element)} relations={selected.readingReplicas ?? []} disabled={busy} onChange={primaryId => void editLayers({kind:"reading_replica",layerId:activeLayerId,primaryId})}/>}
                            {activeElement?.features.representation === "text" && <fieldset disabled={busy}><legend>显示什么内容</legend>
                                <p className="tw-style-guidance">内容来源决定显示什么，下面的时间规则决定何时显示。切换内容来源会保留已设置的出现时机、偏移和时长上限；需要跟随新的内容时，请同时调整出现时机。</p>
								<label>内容来源<select aria-label="文字内容来源" disabled={!!inheritedHighlight} value={activeElement.binding} onChange={(event) => void editLayers({kind:"text_presentation",layerId:activeLayerId,binding:event.target.value,highlight:activeHighlight ? {mode:activeHighlight.mode ?? "keyword",color:activeHighlight.color,stroke:activeHighlight.stroke} : null})}>
									<option value="literal" disabled={!!activeHighlight}>固定文字</option><option value="sentence">字幕句子</option><option value="keyword" disabled={activeHighlight?.mode === "active_word"}>重点词</option>
								</select></label>
                                {inheritedHighlight&&<p className="tw-style-guidance">当前文字继承共享高亮。需要单独切换内容来源时，先在外观页关闭共享高亮；这会同时移除其他引用图层的该项高亮。</p>}
                                {activeHighlight && <p className="tw-style-guidance">{activeHighlight.mode === "active_word" ? "逐字高亮仅支持字幕句子。要显示单个重点词，请先关闭逐字高亮或改为重点词高亮；要显示固定文字，请先关闭高亮。" : "当前已启用重点词高亮；要显示固定文字，请先关闭高亮。"}<button type="button" className="tw-content-rule-link" onClick={()=>jumpToSection("appearance")}>调整高亮方式</button></p>}
								<p>{activeElement.binding === "keyword" ? "应用时替换为标注的重点词。出现时机由“应用规则”中的时间绑定和声音对齐结果决定。" : activeElement.binding === "sentence" ? "应用时替换为每段字幕句子；可叠加重点词或逐字高亮。" : activeElement.binding === "literal" ? "固定文字会保留在每次应用中。需要随文案替换时，请选择重点词或字幕句子。" : "文字由所选内容来源提供。"}</p>
                            </fieldset>}
							<p>配置相对事件的出现时机。显示时长上限用于限制单次展示，不是成片总时长；实际时间在应用声音后生成。</p>
							{!activeElement && <p>当前选择的是容器。位置与尺寸请在“布局”中编辑；选择文字或素材图层后，可配置它的出现时机。</p>}
							{layers.filter(elementLayer).filter(layer => layer.content.element.id === activeLayerId).map((layer) => {
								const element = layer.content.element;
								const timing = timingEdits[element.id] ?? {
									anchor: element.timing?.anchor ?? "video_start",
                                    endAnchor: element.timing?.endAnchor,
									offsetSeconds: element.timing?.offsetSeconds ?? 0,
								};
								return (
									<div className="tw-advanced-row" key={`${element.id}-timing`}>
										<strong>{element.description}</strong>
                                        <MinDisplayRule label="当前图层" value={minDisplayEdits[element.id]} onChange={value=>setMinDisplayEdits(current=>({...current,[element.id]:value}))} inherited="沿用本次应用或样式的默认值。"/>
										<label>显示时长上限<input aria-label="显示时长上限" type="number" min={element.timing?.minSeconds ?? 0.1} max={600} step={0.1} value={durationEdits[element.id] ?? element.timing?.maxSeconds ?? 2} onChange={(event) => setDurationEdits((current) => ({...current,[element.id]:event.target.valueAsNumber}))} />秒</label>
										<select
											aria-label="出现时机"
											value={timing.anchor}
											onChange={(e) =>
												setTimingEdits({
													...timingEdits,
													[element.id]: { ...timing, anchor: e.target.value },
												})
											}
										>
                                            {Object.entries(startTimingLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
										</select>
                                        <label>结束时机<select aria-label="结束时机" value={timing.endAnchor??"automatic"} onChange={event=>setTimingEdits(current=>({...current,[element.id]:{...timing,endAnchor:event.target.value==="automatic"?undefined:event.target.value as TemplateElement["timing"]["endAnchor"]}}))}>
                                            {Object.entries(endTimingLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                                        </select></label><small>结束规则与文字来源、开始时机独立，仍受显示时长上限限制。字幕句和语义段规则需要对应的声音标注；跨句重点词请用语义段结束。</small>
										<label>
											相对触发时刻偏移（秒）
											<input
												type="number"
												min="-30"
												max="30"
												step="0.01"
												value={timing.offsetSeconds}
												onChange={(e) =>
													setTimingEdits({
														...timingEdits,
														[element.id]: {
															...timing,
															offsetSeconds: Number(e.target.value),
														},
													})
												}
											/>
										</label>
									</div>
								);
							})}
						</details>

						<details hidden={inspectorSection!=="rules"}>
							<summary>模板使用指南与来源</summary>
                            <p>保存到模板版本，供人和Agent阅读；本次应用的位置、行宽等调整请在试映中完成。指南是创作约束说明，不会自动执行避让或降级。</p>
                            {!usageGuide ? <button type="button" disabled={busy} onClick={()=>setUsageGuide({...emptyGuide})}>补充使用指南</button> : <>
                                {(Object.keys(guideLabels) as (keyof UsageGuide)[]).map(key=><label key={key} style={{display:"block"}}>{guideLabels[key]}<textarea aria-label={guideLabels[key]} value={usageGuide[key]} disabled={busy} maxLength={4000} rows={3} style={{width:"100%"}} onChange={event=>setUsageGuide({...usageGuide,[key]:event.target.value})}/></label>)}
                                <button type="button" disabled={busy} onClick={()=>setUsageGuide(null)}>移除指南</button>
                            </>}

							<p>{selected.provenance}</p>
						</details>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
