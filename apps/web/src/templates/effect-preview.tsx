"use client";

import { useEffect, useRef, useState } from "react";
import { MousePointer2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SceneTracks } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import type { EffectPreviewSample } from "./production-create";
import { EffectLayoutOverlay, type EditingRegion, type LayoutEditing, type FramePose } from "./effect-layout-overlay";
import {transformBasis} from "@/services/renderer/attachment-basis";
import { collectFrameSelectionMeasurements, type FrameSelectionMeasurement } from "@/services/renderer/frame-selection";
import { MeasuredLayerSelection } from "./measured-layer-selection";
import {intentChoices} from "./intent-labels";
import { formatPlanWarnings } from "./plan-warning";
import { ExitSamplingPanel } from "./exit-sampling";
import { currentEffectPreview, effectPreviewRequestKey, type EffectPreviewResponse } from "./effect-preview-request";
import type { ExitSampling } from "./types";

type PreviewMedia = {id:string;name:string;type:"video"|"audio"|"image";width:number|null;height:number|null;duration:number|null;sha256:string;url:string};
type Preview = { exitSampling?: ExitSampling; captions?: {id:string;start:number;end:number;text:string;warnings:string[]}[]; example?: {words: {text:string}[]}; canvas: { width: number; height: number; fps: number }; durationSeconds: number; tracks: SceneTracks; warnings: string[]; mediaAssets?:MediaAsset[];audioUrl?:string;sourceMedia?:PreviewMedia;mediaSources?:PreviewMedia[];templateId?:string;editingRegions?:EditingRegion[];generation?:string };

// Display-only copy for trying a design; scheduling and wrapping remain in Rust/the renderer.
const previewExamples = [
	{label:"短句",text:"让重点表达更清楚",keyword:"重点"},
	{label:"长中文",text:"每天留一点时间，把真正重要的事情讲清楚，让每一次表达都更有力量。",keyword:"真正重要的事情"},
	{label:"长英文",text:"Here are the things you need to do to move forward with confidence.",keyword:"move forward"},
] as const;

export function EffectPreview({ definition, template, sample, active=true, editing, thumbnail=false, onThumbnail, onThumbnailError }: ({ definition: object; template?: never } | { definition?: never; template: object }) & {sample?:EffectPreviewSample;active?:boolean;editing?:LayoutEditing;thumbnail?:boolean;onThumbnail?:(canvas:HTMLCanvasElement)=>void;onThumbnailError?:(error:string)=>void}) {
	const [layoutMode,setLayoutMode]=useState(false);
	const [backdrop,setBackdrop]=useState("#000000");
	const canvas = useRef<HTMLCanvasElement>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const [viewZoom,setViewZoom] = useState("fit");
    function changeViewZoom(next:string) {
        setViewZoom(next);
        requestAnimationFrame(()=>{
            const host=viewport.current,target=canvas.current;
            if(!host||!target)return;
            const region=preview?.editingRegions?.find(region=>region.id===editing?.selectedId)?.region;
            host.scrollLeft=next==="fit"?0:(region?region.x+region.width/2:.5)*target.clientWidth-host.clientWidth/2;
            host.scrollTop=next==="fit"?0:(region?region.y+region.height/2:.5)*target.clientHeight-host.clientHeight/2;
        });
    }
	const audio = useRef<HTMLAudioElement>(null);
	const sourceCache=useRef(new Map<string,MediaAsset>());
	const [muted,setMuted]=useState(false);
	const progress = useRef<HTMLInputElement>(null);
	const [duration, setDuration] = useState(2);
	const [position, setPosition] = useState(0.5);
	const [playing, setPlaying] = useState(false);
	const [previewResponse, setPreviewResponse] = useState<EffectPreviewResponse<Preview>>();
	const [error, setError] = useState("");
	const [renderError,setRenderError]=useState("");
	const [renderedKey,setRenderedKey]=useState("");
	const [measurements,setMeasurements]=useState<FrameSelectionMeasurement[]>([]);
	const [loading, setLoading] = useState(false);
	const [detaching,setDetaching]=useState(false);
	const [exampleText, setExampleText] = useState("让重点表达更清楚");
	const [exampleKeyword, setExampleKeyword] = useState("重点");
	const [keywordOccurrence,setKeywordOccurrence]=useState(0);
	const [exampleIntent,setExampleIntent]=useState("emphasis");
	const [layoutPhrases,setLayoutPhrases]=useState<{wordSpan:{startWord:number;endWord:number}}[]>([]);
	const [phraseStart,setPhraseStart]=useState(0);
	const [phraseEnd,setPhraseEnd]=useState(1);
	const phraseSnapshot=JSON.stringify(layoutPhrases);
	const snapshot = JSON.stringify(template ?? definition);
	const application = template !== undefined;
	const sampleSnapshot=JSON.stringify(sample??null);
	const requestKey=effectPreviewRequestKey({kind:application?"template":"definition",snapshot,sampleSnapshot,duration,text:exampleText,keyword:exampleKeyword,keywordOccurrence,intent:exampleIntent,phraseSnapshot});
	const preview=currentEffectPreview(previewResponse,requestKey);
	const playbackDuration=sample&&preview?preview.durationSeconds:duration;
	// A paused seek needs a new frame and measurement snapshot, even when the
	// definition and background have not changed. Playback owns its moving clock.
	const renderKey=JSON.stringify([preview?.generation, sample ? "source" : backdrop, playing ? "playing" : position]);
	const frameReady=!!preview && !loading && renderedKey===renderKey && !renderError && !detaching;
	const detachContext=JSON.stringify([snapshot,position,playing,exampleText,exampleKeyword,keywordOccurrence,exampleIntent,phraseSnapshot,duration,sampleSnapshot,editing?.selectedId]);
	const latestDetachContext=useRef(detachContext);latestDetachContext.current=detachContext;
	async function detachAtFrame() {
		if(!editing?.onDetachInFrame||!preview||!frameReady||playing||sample||!definition)return;
		const id=editing.selectedId,attached=measurements.filter(item=>item.source.templateElementId===id);
		if(attached.length!==1){setError("请在所选元素可见且只有一个实例的时刻解除依附。");return;}
		setDetaching(true);setError("");
		try {
			const response=await fetch("/api/footage/templates/dynamic-assets/detach-preview",{method:"POST",headers:{"content-type":"application/json","x-requested-with":"moirai-footage"},body:JSON.stringify({layerId:id,preview:{definition:JSON.parse(snapshot),inputs:{},durationSeconds:duration,example:{text:exampleText,keyword:exampleKeyword,keywordOccurrence,intent:exampleIntent,layoutPhrases}}})});
			const candidate=await response.json();if(!response.ok)throw new Error(candidate.error??"无法计算解除后的外观");
			const [{buildScene},{CanvasRenderer},{resolveRenderTree}]=await Promise.all([import("@/services/renderer/scene-builder"),import("@/services/renderer/canvas-renderer"),import("@/services/renderer/resolve")]);
			const node=buildScene({canvasSize:candidate.canvas,tracks:candidate.tracks,mediaAssets:preview.mediaAssets??[],duration:Math.round(candidate.durationSeconds*120000),background:{type:"color",color:"transparent"},isPreview:true});
			const renderer=new CanvasRenderer({...candidate.canvas,fps:{numerator:candidate.canvas.fps,denominator:1}});
			await document.fonts.ready;
			await resolveRenderTree({node,renderer,time:attached[0].sceneTime});
			const independent=collectFrameSelectionMeasurements(node,attached[0].sceneTime,candidate.canvas).filter(item=>item.source.templateElementId===id);
			if(independent.length!==1)throw new Error("无法在同一帧定位解除后的元素。");
			const groupPose=(item:FrameSelectionMeasurement)=>item.groups.map(group=>({transform:group.transform,childTimeOffset:group.childTimeOffset}));
			if(JSON.stringify(groupPose(attached[0]))!==JSON.stringify(groupPose(independent[0])))throw new Error("解除前后分组变换不同，无法保持当前外观。");
			if(latestDetachContext.current!==detachContext)throw new Error("样式或预览帧已变化，请等待预览更新后重试。");
			const pose=(item:FrameSelectionMeasurement):FramePose=>({sceneTime:item.sceneTime,localTime:item.localTime,position:[item.transform.position.x,item.transform.position.y],basis:transformBasis(item.transform)});
			await editing.onDetachInFrame(id,pose(attached[0]),pose(independent[0]),snapshot);
		} catch(error){setError(error instanceof Error?error.message:"解除依附失败");}
		finally{setDetaching(false);}
	}
	useEffect(()=>{if(!active)setPlaying(false);},[active]);
	useEffect(()=>{if(!playing)audio.current?.pause();},[playing,preview?.audioUrl]);
	useEffect(()=>()=>{audio.current?.pause();},[]);
	async function playFrom(time:number) {
		clock.current=time;setPosition(time);
		try {if(audio.current){audio.current.closest(".template-workbench")?.querySelectorAll<HTMLMediaElement>("audio,video").forEach(other=>{if(other!==audio.current)other.pause();});audio.current.currentTime=time;await audio.current.play();}setPlaying(true);}catch(error){setError(error instanceof Error?error.message:"无法播放原声");}
	}
	const renderQueue = useRef(Promise.resolve());
	const clock = useRef(0.5);
	const positionedExample = useRef("");
	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);
		setPlaying(false);
		setError("");
		setRenderError("");
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/footage/templates/dynamic-assets/${application ? sampleSnapshot!=="null" ? "sample-preview" : "application-preview" : "preview"}`, {
					method: "POST", headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" },
					body: JSON.stringify(application&&sampleSnapshot!=="null" ? {template:JSON.parse(snapshot),sample:JSON.parse(sampleSnapshot)} : { ...(application ? {template:JSON.parse(snapshot)} : {definition:JSON.parse(snapshot),inputs:{}}), durationSeconds: duration, example:{text:exampleText,keyword:exampleKeyword,keywordOccurrence,intent:exampleIntent,layoutPhrases} }), signal: controller.signal,
				});
				const result = await response.json();
				if (!response.ok) throw new Error(result.error === "no supported elements to apply"
					? sampleSnapshot !== "null" ? "当前声音尚未触发可显示的样式元素。请在「内容重点」检查语义和重点词范围，并确认样式的出现语义与之匹配。" : "示例尚未触发样式。请展开「示例文案」，选择与样式规则匹配的示例语义，并检查重点词。"
					: result.error === "layout phrases must be nonempty, ordered, nonoverlapping aligned word spans"
						? "同排范围无效：结束词不能早于起始词，各组需按原文顺序添加且不能重叠。请移除错误的一组后重新选择。"
						: result.error === "text region has no room after stroke and background padding"
                            ? "文字区域容不下描边和留白。请减小描边宽度，或在布局中增大文字区域。"
                            : result.error ?? "预览失败");
				const sources:PreviewMedia[]=[...(result.mediaSources??[]),...(result.sourceMedia?.type==="video"?[result.sourceMedia]:[])];
				const loaded=await Promise.all(sources.map(async source=>{
					const key=`${source.id}:${source.sha256}`;
					let asset=sourceCache.current.get(key);
					if(!asset){
						const media=await fetch(source.url,{signal:controller.signal});
						if(!media.ok)throw new Error(`无法读取预览素材：${source.name}`);
						const blob=await media.blob();
						asset={id:source.id,name:source.name,type:source.type,width:source.width??undefined,height:source.height??undefined,duration:source.duration??undefined,url:source.url,file:new File([blob],source.name,{type:blob.type}),ephemeral:true};
					}
					return {key,asset};
				}));
				if (controller.signal.aborted) return;
				sourceCache.current=new Map(loaded.map(({key,asset})=>[key,asset]));
				result.mediaAssets=loaded.map(({asset})=>asset);
				result.templateId=JSON.parse(snapshot).id;
				result.generation=crypto.randomUUID();
				const exampleKey=JSON.stringify([result.templateId,exampleText,exampleKeyword,keywordOccurrence,exampleIntent,phraseSnapshot,duration,sampleSnapshot]);
				const suggested=positionedExample.current!==exampleKey&&Number.isFinite(result.previewTimeSeconds)?result.previewTimeSeconds:undefined;
				positionedExample.current=exampleKey;
				setPosition(value=>{const next=Math.min(suggested??value,Math.max(0,result.durationSeconds-1/result.canvas.fps));clock.current=next;return next;});
				setPreviewResponse({requestKey,preview:result}); setError("");
			} catch (error) { if (!controller.signal.aborted) {setPreviewResponse(undefined);setError(error instanceof Error ? error.message : "预览失败");} }
			finally { if (!controller.signal.aborted) setLoading(false); }
		}, 250);
		return () => { controller.abort(); clearTimeout(timer); };
	}, [requestKey, snapshot, application, sampleSnapshot, duration, exampleText, exampleKeyword, keywordOccurrence, exampleIntent, phraseSnapshot]);
	useEffect(() => {
		if (!preview || !canvas.current) return;
		let cancelled = false;
		let raf = 0;
		const target = canvas.current;
		// An obsolete asynchronous render must never overwrite the visible frame.
		const staging = document.createElement("canvas");
		staging.width=preview.canvas.width;
		staging.height=preview.canvas.height;
		let previous = performance.now();
		async function start() {
			try {
				const [{ buildScene }, { CanvasRenderer }, { initializeGpuRenderer, isGpuAvailable }, {registerDefaultMasks}, {registerDefaultEffects}] = await Promise.all([
					import("@/services/renderer/scene-builder"), import("@/services/renderer/canvas-renderer"),
					import("@/services/renderer/gpu-renderer"),
					import("@/masks"),import("@/effects"),
				]);
				registerDefaultMasks();registerDefaultEffects();
				await initializeGpuRenderer();
				if (cancelled) return;
				if (!isGpuAvailable()) throw new Error("当前浏览器无法初始化 GPU，效果预览不可用。");
				await document.fonts.ready;
				const node = buildScene({ canvasSize: preview!.canvas, tracks: preview!.tracks, mediaAssets: preview!.mediaAssets??[], duration: Math.round(preview!.durationSeconds * 120000), background: {type:"color",color:sample||thumbnail?"transparent":backdrop==="checker"?"#ffffff":backdrop}, isPreview: true });
				if (!sample && backdrop === "checker") {
					const [{ImageNode},{normalizeVisualAppearance}] = await Promise.all([import("@/services/renderer/nodes/image-node"),import("@/visual/appearance")]);
					const grid = document.createElement("canvas"); grid.width=preview!.canvas.width; grid.height=preview!.canvas.height;
					const ctx=grid.getContext("2d")!;
					ctx.fillStyle="#ffffff";ctx.fillRect(0,0,grid.width,grid.height);ctx.fillStyle="#dce0e5";
					for(let y=0;y<grid.height;y+=24)for(let x=0;x<grid.width;x+=24)if((x/24+y/24)%2===0)ctx.fillRect(x,y,24,24);
					// Place the checker above the solid background but below authored layers.
					node.children.splice(1,0,new ImageNode({url:grid.toDataURL(),duration:Math.round(preview!.durationSeconds*120000),timeOffset:0,trimStart:0,trimEnd:0,transform:{position:{x:0,y:0},scaleX:1,scaleY:1,rotate:0},opacity:1,appearance:normalizeVisualAppearance({})}));
				}
				const renderer = new CanvasRenderer({ ...preview!.canvas, fps: { numerator: preview!.canvas.fps, denominator: 1 } });
				async function draw() {
					if (cancelled) return;
					const now = performance.now();
					if (playing) clock.current = preview!.audioUrl&&audio.current ? audio.current.currentTime : (clock.current + (now - previous) / 1000) % preview!.durationSeconds;
					previous = now;
					const time = Math.min(playing ? clock.current : position, preview!.durationSeconds - 1 / preview!.canvas.fps);
					renderQueue.current = renderQueue.current.catch(() => {}).then(async () => {
						if (cancelled) return;
						staging.getContext("2d")?.clearRect(0, 0, staging.width, staging.height);
						const tick=Math.round(Math.max(0,time) * 120000);
						await renderer.renderToCanvas({node,time:tick,targetCanvas:staging});
						if(cancelled) return;
						if(!playing&&!thumbnail)setMeasurements(collectFrameSelectionMeasurements(node,tick,preview!.canvas));
						const context=target.getContext("2d");
						if(!context) throw new Error("无法显示效果预览");
						context.clearRect(0,0,target.width,target.height);
						context.drawImage(staging,0,0);
					});
					await renderQueue.current;
					if (!cancelled) {
						setRenderError("");
						setRenderedKey(renderKey);
                        if(thumbnail)onThumbnail?.(target);
						target.dataset.renderTime = String(time);
						target.dataset.renderGeneration=preview!.generation??"";
						target.dataset.renderBackground=sample?"source":backdrop;
						target.dataset.templateId=preview!.templateId??"";
						target.dataset.mediaIds=(preview!.mediaAssets??[]).map(asset=>asset.id).join(",");
						if (progress.current) progress.current.value = String(time);
					}
					if (!cancelled && playing) raf = requestAnimationFrame(() => { void draw().catch(fail); });
				}
				await draw();
			} catch (error) { fail(error); }
		}
		function fail(error: unknown) { if (!cancelled) { setRenderError(error instanceof Error ? error.message : String(error)); setPlaying(false); } }
		void start();
		return () => { cancelled = true; cancelAnimationFrame(raf); };
	}, [preview, playing, position, backdrop, sample, thumbnail, onThumbnail]);
    useEffect(()=>{if(thumbnail&&(error||renderError))onThumbnailError?.(error||renderError);},[thumbnail,error,renderError,onThumbnailError]);
    if(thumbnail)return preview?<canvas ref={canvas} width={preview.canvas.width} height={preview.canvas.height} style={{display:"none"}} aria-hidden="true"/>:null;
	return <section className="tw-effect-preview" aria-label="效果预览" aria-busy={loading || (!!preview && !frameReady && !renderError)}>
		<div className="tw-row">
			{editing?.canDetach&&editing.onDetachInFrame&&<Button variant="ghost" disabled={playing||loading||editing.busy||!frameReady} onClick={()=>void detachAtFrame()} title="停止跟随，保持当前帧外观并保留自身动画">解除依附并保持外观</Button>}
			{editing&&<Button variant="ghost" size="icon" aria-label="编辑布局区域" title="编辑布局区域" aria-pressed={layoutMode} disabled={loading||editing.busy||!preview} onClick={()=>{setPlaying(false);setLayoutMode(value=>!value);}}><MousePointer2/></Button>}
			<Button variant="ghost" size="icon" disabled={!preview || loading || !active} aria-label={playing ? "暂停效果" : "播放效果"} title={playing ? "暂停效果" : "播放效果"} onClick={() => { if (playing){setPosition(clock.current);setPlaying(false);}else void playFrom(position>=playbackDuration?0:position); }}>{playing ? <Pause /> : <Play />}</Button>
			<Button variant="ghost" size="icon" disabled={!preview || loading || !active} aria-label="重播效果" title="重播效果" onClick={() => void playFrom(0)}><RotateCcw /></Button>
			{preview?.audioUrl&&<Button variant="ghost" size="icon" aria-label={muted?"开启原声":"静音原声"} title={muted?"开启原声":"静音原声"} onClick={()=>setMuted(value=>!value)}>{muted?<VolumeX/>:<Volume2/>}</Button>}
			{sample?<span>{preview ? `${preview.sourceMedia?.name ?? sample.title} · ${preview.durationSeconds.toFixed(1)} 秒` : sample.title}</span>:<label>预览时长<input aria-label="效果预览时长" type="number" min={0.1} max={30} step={0.1} value={duration} onChange={(event) => { const value=event.target.valueAsNumber; if(value>=0.1&&value<=30){setDuration(value);setPosition(Math.min(position,value));clock.current=0;} }} /></label>}
		</div>
		{!sample&&<div className="tw-preview-backgrounds" role="group" aria-label="预览背景">
			{([ ["#000000","黑色"],["#ffffff","白色"],["#808080","灰色"],["checker","棋盘"] ] as const).map(([value,label])=><button key={value} type="button" aria-label={`${label}预览背景`} title={`${label}预览背景`} aria-pressed={backdrop===value} onClick={()=>setBackdrop(value)} style={{background:value==="checker"?"repeating-conic-gradient(#dce0e5 0% 25%, #fff 0% 50%) 0 / 12px 12px":value}}/>)}
		</div>}
		{preview?.audioUrl&&<audio ref={audio} src={preview.audioUrl} muted={muted} preload="metadata" onPause={()=>{if(audio.current?.paused){setPlaying(false);setPosition(clock.current);}}} onEnded={()=>{setPlaying(false);setPosition(preview.durationSeconds);}} onError={()=>{setPlaying(false);setError("无法读取原声预览");}}/>}
		{!sample&&<p className="tw-style-guidance">当前用示例节奏预览外观与动效。正式应用时，文字和时间会跟随 TTS 或原声；固定文字图层保留原文。</p>}
		{!sample&&<div className="tw-preview-examples" role="group" aria-label="快速试文案">
			<span>试文案</span>
			{previewExamples.map(example=><Button key={example.label} variant="outline" size="sm" aria-pressed={exampleText===example.text&&exampleKeyword===example.keyword} onClick={()=>{
				setExampleText(example.text);setExampleKeyword(example.keyword);setKeywordOccurrence(0);
				setLayoutPhrases([]);setPhraseStart(0);setPhraseEnd(1);
			}}>{example.label}</Button>)}
			<small>只切换预览内容，可展开下方自定义。</small>
		</div>}
		{!sample&&<details className="tw-preview-example"><summary>示例文案</summary>
			<label>示例语义<select aria-label="预览示例语义" value={exampleIntent} onChange={event=>setExampleIntent(event.target.value)}>{intentChoices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
			<label>句子<input aria-label="预览示例句子" value={exampleText} maxLength={200} onChange={(event) => {setExampleText(event.target.value);setKeywordOccurrence(0);setLayoutPhrases([]);setPhraseStart(0);setPhraseEnd(1);}} /></label>
			<label>重点词<input aria-label="预览示例重点词" value={exampleKeyword} maxLength={200} onChange={(event) => {setExampleKeyword(event.target.value);setKeywordOccurrence(0);}} /></label>
			<fieldset disabled={loading}><legend>同排短语（仅此示例）</legend><p>选择相邻词，尽量放在同一行；不改变声音时间。真实成片需在内容面板配置。</p>
                <label>起始词<select aria-label="预览同排起始词" value={phraseStart} onChange={e=>setPhraseStart(Number(e.target.value))}>{preview?.example?.words.map((w,i)=><option key={i} value={i}>{i+1}. {w.text}</option>)}</select></label>
                <label>结束词<select aria-label="预览同排结束词" value={phraseEnd} onChange={e=>setPhraseEnd(Number(e.target.value))}>{preview?.example?.words.map((w,i)=><option key={i} value={i+1}>{i+1}. {w.text}</option>)}</select></label>
                <Button variant="outline" disabled={!preview?.example?.words.length} onClick={()=>setLayoutPhrases([...layoutPhrases,{wordSpan:{startWord:phraseStart,endWord:phraseEnd}}])}>预览同排</Button>
                {layoutPhrases.length>0&&<Button variant="ghost" onClick={()=>setLayoutPhrases([])}>清除预览同排</Button>}
                {layoutPhrases.map((p,i)=><div key={i} className="tw-row"><span>第 {p.wordSpan.startWord+1}–{p.wordSpan.endWord} 词：{preview?.example?.words.slice(p.wordSpan.startWord,p.wordSpan.endWord).map(w=>w.text).join(" · ")}</span><Button variant="ghost" aria-label={`移除第${i+1}组预览同排`} onClick={()=>setLayoutPhrases(layoutPhrases.filter((_,index)=>index!==i))}>移除</Button></div>)}
            </fieldset>
			{exampleKeyword&&<label>强调第几次出现<input aria-label="预览重点词出现次数" type="number" min={1} max={200} step={1} value={keywordOccurrence+1} onChange={(event)=>{const value=event.target.valueAsNumber;if(Number.isInteger(value)&&value>=1&&value<=200)setKeywordOccurrence(value-1);}} /></label>}
		</details>}
		{(loading || (!!preview && !frameReady && !renderError)) && <p role="status">正在更新效果…</p>}
		{error && <p role="alert">{error}</p>}
		{renderError&&<p role="alert">{renderError}</p>}
        {editing&&<label className="tw-preview-zoom">查看比例<select aria-label="预览查看比例" value={viewZoom} disabled={playing||editing.busy||!frameReady} onChange={event=>changeViewZoom(event.target.value)}><option value="fit">适应面板</option><option value="1">100%（原始像素）</option><option value="2">200%</option></select><small>仅放大查看，不改变样式大小或导出。</small></label>}
		{preview && <div ref={viewport} className="tw-effect-viewport" style={editing&&viewZoom!=="fit"?{maxHeight:"56vh",overflow:"auto"}:undefined}><div className="tw-effect-stage" data-preview-generation={preview.generation} style={{position:"relative",width:editing&&viewZoom!=="fit"?`${preview.canvas.width*Number(viewZoom)}px`:`min(100%, ${560 * preview.canvas.width / preview.canvas.height}px, ${56 * preview.canvas.width / preview.canvas.height}vh)`,aspectRatio:`${preview.canvas.width}/${preview.canvas.height}`}}>
			<canvas ref={canvas} width={preview.canvas.width} height={preview.canvas.height} aria-label="效果实时画面" style={{display:"block",width:"100%",height:"auto",aspectRatio:`${preview.canvas.width}/${preview.canvas.height}`,backgroundColor:"#e7e9ed",visibility:loading||!frameReady?"hidden":"visible"}} />
			{editing&&layoutMode&&!playing&&!loading&&frameReady&&preview.editingRegions&&<EffectLayoutOverlay regions={preview.editingRegions} canvas={preview.canvas} editing={editing}/>}
			{editing&&layoutMode&&!playing&&!loading&&frameReady&&<MeasuredLayerSelection measurements={measurements} canvas={preview.canvas} regions={preview.editingRegions??[]} editing={editing} snapshot={snapshot}/>}
		</div></div>}
		{editing&&layoutMode&&<p>拖动文字或装饰可移动；橙色角点等比缩放，边中点单独调整宽高，并固定对边。方向键微调，Shift 加速，Esc 取消。灰绿框调整布局尺寸；橙色边界不含描边、阴影及裁切效果。</p>}
		<input ref={progress} aria-label="效果预览进度" type="range" min={0} max={playbackDuration} step={0.01} defaultValue={0.5} disabled={!preview || loading || !active} onChange={(event) => { setPlaying(false); clock.current=event.target.valueAsNumber; if(audio.current)audio.current.currentTime=clock.current; setPosition(clock.current); }} />
        {!loading && preview && <ExitSamplingPanel value={preview.exitSampling} />}
        {!loading && preview?.warnings.length ? <details><summary>预览检查 · {preview.warnings.length} 条提醒</summary><p>字幕分段检查与花字动效检查不同；请结合实际播放确认重点词是否有足够的阅读时间。</p>{formatPlanWarnings(preview.warnings).map((warning,index)=><p key={`${index}:${warning}`}>{warning}</p>)}
            {preview.captions?.some(cue=>cue.warnings.length>0)&&<details className="tw-warning-cues"><summary>定位需检查的字幕</summary>
                {preview.captions.filter(cue=>cue.warnings.length>0).map(cue=><div key={cue.id} className="tw-warning-cue">
                    <Button variant="outline" disabled={!active||!!editing?.busy} aria-label={`定位字幕：${cue.text}`} onClick={()=>{setPlaying(false);clock.current=cue.start;setPosition(cue.start);if(audio.current){audio.current.pause();audio.current.currentTime=cue.start;}canvas.current?.scrollIntoView({block:"nearest"});}}>{cue.start.toFixed(2)}–{cue.end.toFixed(2)} 秒 · {cue.text}</Button>
                    {formatPlanWarnings(cue.warnings.map(warning=>`${cue.id}:${warning}`)).map(warning=><small key={warning}>{warning}</small>)}
                </div>)}
            </details>}
        </details> : null}
	</section>;
}
