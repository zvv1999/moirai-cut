import { z } from "zod";
import { readProject, writeProject } from "./project-file.mjs";
import { mediaIndexOf } from "./media-import.mjs";
import { materializeTemplateAssets } from "./template-assets.mjs";
import { produceTemplates } from "./template-authoring.mjs";

// Transport only: schemas, validation, revisions and planning are owned by Rust.
export function registerTemplateTools(server) {
	server.registerTool("produce_templates", {
		description: "Batch-produce Agent-authored templates from library input IDs in one call. Read productionAuthoringInput from template_schema: provide 1-100 designs and 1-8 samples with reviewed transcript revisions (or explicit sound/time events) and optional per-sound captionPolicy segmentation settings. Rust pins measured inputs and expands independent editable preview projects; the adapter imports verified originals and submits automatic rendering/publication. No manual project/CompileInput assembly is needed. Reusing the same key resumes preparation or returns the existing batch; changed requests conflict. Poll read_template_production and review actual previews before claiming aesthetic quality.",
		inputSchema: { request: z.record(z.string(), z.unknown()) },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, async ({ request }) => {
		try { return { content: [{ type: "text", text: JSON.stringify(await produceTemplates({ request })) }] }; }
		catch (error) { return { isError: true, content: [{ type: "text", text: String(error.message ?? error) }] }; }
	});
	const call = async (path, body) => {
		const base = process.env.OPENCUT_BASE_URL ?? "http://127.0.0.1:3000";
		try {
			const response = await fetch(`${base}/api/footage/templates${path}`, {
				method: body === undefined ? "GET" : "POST",
				headers: {
					"x-requested-with": "moirai-footage",
					...(body === undefined ? {} : { "content-type": "application/json" }),
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			const text = await response.text();
			let data;
			try { data = JSON.parse(text); } catch {
				throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
			}
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
				...(!response.ok ? { isError: true } : {}),
			};
		} catch (error) {
			return {
				isError: true,
				content: [{ type: "text", text: String(error.message ?? error) }],
			};
		}
	};
	server.registerTool("dynamic_asset_schema", {
		description: "Read native Rust schemas for editable dynamic asset definitions, revisioned saves and template insertion. modelBoundaries distinguishes reusable Definition, revision-pinned Application, input-bound Sample and compilable Template; saving a Template does not establish a reusable style. rectangleGeometryCapabilities describes rectangle-only optional rectangleGeometry {cornerRadius:0–50}, the radius as a percent of the actual rectangle shorter side: omitted/0 means square corners, 50 means capsule (circle for a square). It remains independent of fill, outline, transforms and measured text-size binding; corner-radius animation is not supported. starGeometryCapabilities describes editable native star geometry: star representation with optional starGeometry {points:integer 3–12, depth:1–99 inner-radius percent}, default 5/45. Color, outline and transform motion are independent; arbitrary paths and geometry animation are not part of this template contract. ellipseArcCapabilities describes independent outlined-ellipse geometry (startDegrees, positive sweepDegrees, cap) and stroke_reveal motion, including its canonical params.strokeReveal animation path, 0..1 range and individual-element execution limits. Read capabilities from inspect_dynamic_asset; unsupported features are rejected.",
		inputSchema: {}, annotations: { readOnlyHint: true },
	}, () => call("/dynamic-assets/schema"));
	server.registerTool("sample_reference_video", {
		description: "Queue local FFmpeg sampling of an imported template video. No model call or upload. Supply 1-12 increasing source timestamps. Poll read_reference_analysis using idempotencyKey. Result carries requested seek times, hashes and frame URLs, not exact decoded PTS.",
		inputSchema: { inputId: z.string(), times: z.array(z.number().finite().nonnegative()).min(1).max(12), idempotencyKey: z.string() }, annotations: { readOnlyHint: false, destructiveHint: false },
	}, ({inputId,times,idempotencyKey}) => call("/references", {request:{operation:"sample",input_id:inputId,times},idempotencyKey}));
	server.registerTool("analyze_reference_style", {
		description: "Send a completed sample's frames to the configured multimodal endpoint for visual layer and motion observations. This uploads sampled images. Returns a job; poll read_reference_analysis. Evidence and confidence are model inferences, not verified facts. Does not create or alter assets.",
		inputSchema: { sampleId: z.string(), brief: z.string().max(4000).default(""), idempotencyKey:z.string() }, annotations: {readOnlyHint:false,destructiveHint:false},
	}, ({sampleId,brief,idempotencyKey})=>call("/references",{request:{operation:"analyze",sample_id:sampleId,brief},idempotencyKey}));
	server.registerTool("compare_reference_frames", {
		description: "Queue local paired-frame RGB comparison of two sample packs with equal counts. Pairs use explicit index order and preserve both requested timestamps; caller owns alignment. Candidate may be sampled from an imported rendered export. Returns normalized RGB MAE, never an aesthetic score. Poll read_reference_analysis.",
		inputSchema:{referenceId:z.string(),candidateId:z.string(),idempotencyKey:z.string()},annotations:{readOnlyHint:false,destructiveHint:false},
	},({referenceId,candidateId,idempotencyKey})=>call("/references",{request:{operation:"compare",reference_id:referenceId,candidate_id:candidateId},idempotencyKey}));
	server.registerTool("read_reference_analysis", {
		description:"Read sampling, analysis or comparison job and completed result. id is the submission's idempotencyKey. Failure stays explicit; no fallback observations are fabricated.",
		inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/)},annotations:{readOnlyHint:true},
	},({id})=>call(`/references/${id}`));
	server.registerTool("reference_analysis_schema", {
		description:"Read independent native reference job and observation schemas.",
		inputSchema:{},annotations:{readOnlyHint:true},
	},()=>call("/references/schema"));
	server.registerTool("list_dynamic_assets", {
		description: "List all locally saved editable dynamic assets, including archived ones. Separate library entries contain assetId, revision and archived; missing entries mean active with library revision zero. Optional purposes contains authored discovery tags (keyword, decorative_text, caption, decoration); multiple tags are allowed. Missing tags mean unclassified, not inferred from names or bindings.",
		inputSchema: {}, annotations: { readOnlyHint: true },
	}, () => call("/dynamic-assets"));
	server.registerTool("list_dynamic_asset_reviews", {description:"Read revision-bound style application reviews. current=false means source version or production evidence no longer matches. evidenceCurrent independently confirms the recorded production graph and preview hashes still match, allowing historical footage inspection after a style version update. It does not re-decode media. Scores cover the exact recorded application, not arbitrary combinations or universal aesthetic quality.",inputSchema:{},annotations:{readOnlyHint:true}},()=>call("/dynamic-assets/reviews"));
	server.registerTool("list_dynamic_asset_review_series", {description:"Read cross-input application review series for frozen saved styles. Each case retains its exact application, production evidence, adjustment rationale and current/evidenceCurrent status. Series score is the weakest case and final flags require every case. Source diversity and perceptual quality remain reviewer assertions; a series does not approve arbitrary inputs or overwrite single-application reviews.",inputSchema:{},annotations:{readOnlyHint:true}},()=>call("/dynamic-assets/review-series"));
	server.registerTool("review_dynamic_asset_series", {
		description: "Submit a cross-input style application review using qualityReviewSeries from dynamic_asset_schema: {cases:[{application,review,rationale}],rationale,coverage,limitations}. Each case may use a different placement/width/canvas of the same frozen current style. Rust compares every exact projected graph, requires all verified previews of every case (at least one per case and three distinct hashes across the series), and refuses duplicate production items. Series score is the minimum case score; final aesthetic verification requires every case's explicit listening and visual assertion, >=90 and no blockers. Record real adjustment reasons and coverage, including failures. Does not modify the style, projects or existing single-application scores.",
		inputSchema: { request: z.record(z.string(), z.unknown()) }, annotations: { readOnlyHint: false, destructiveHint: false },
	}, ({ request }) => call("/dynamic-assets/review-series", request));
	server.registerTool("read_dynamic_asset", {
		description: "Read the saved layer graph, editable text bindings, flattened template projection and execution limitations. Structural validation does not certify rendered quality.",
		inputSchema: { id: z.string().regex(/^[a-zA-Z0-9_-]+$/) }, annotations: { readOnlyHint: true },
	}, ({ id }) => call(`/dynamic-assets/${id}`));
	server.registerTool("list_dynamic_asset_applications", {
		description: "List immutable application history, optionally filtered by assetId and contextId. Records describe per-input adjustments, not saved style revisions or quality approval. Read current/stale status before restoring; stale records remain inspectable.",
		inputSchema: { assetId: z.string().optional(), contextId: z.string().optional() }, annotations: { readOnlyHint: true },
	}, ({ assetId, contextId }) => {
		const query = new URLSearchParams();
		if (assetId !== undefined) query.set("assetId", assetId);
		if (contextId !== undefined) query.set("contextId", contextId);
		return call(`/dynamic-assets/application-history${query.size ? `?${query}` : ""}`);
	});
	server.registerTool("read_dynamic_asset_application", {
		description: "Read an immutable per-input application record, its pinned styles/content, adjustment reason and current/stale status. Reading never changes the library or an editor project.",
		inputSchema: { id: z.string().regex(/^[a-zA-Z0-9_-]+$/) }, annotations: { readOnlyHint: true },
	}, ({ id }) => call(`/dynamic-assets/application-history/${id}`));
	server.registerTool("save_dynamic_asset_application", {
		description: "Save a per-input application history record using the applicationHistorySave schema from dynamic_asset_schema. Rust validates pinned style/content versions and idempotency, keeping case-specific settings separate from library defaults. Include the adjustment reason and evidence limitations. Save reusable placementPolicy:{safeInset,requireFullCoverage} and placementPadding as typed top-level fields. Bind protectedRegions with protectionContext:{sample,application,extras}, using one exact sample from samples and the current application/extras. Rust validates this context; primary overlay transform may be reused only when extra overlays have no attachment relationships. Legacy regions without protectionContext remain unbound and must not be assigned to the first sample or inferred from uiState. Do not hide rule settings or evidence identity in uiState. Does not edit projects, save a style or certify visual quality.",
		inputSchema: { request: z.record(z.string(), z.unknown()) }, annotations: { readOnlyHint: false, destructiveHint: false },
	}, ({ request }) => call("/dynamic-assets/application-history", request));
	server.registerTool("restore_dynamic_asset_application", {
		description: "Prepare restoration of a history record using applicationHistoryRestore from dynamic_asset_schema. Supply current application state so Rust preserves it before returning the target application/context and projection. Rejects stale targets. Apply the returned state through the calling workbench or the normal project edit protocol; this tool itself never overwrites a project or library style. Reuse the same request on transport retry.",
		inputSchema: { id: z.string().regex(/^[a-zA-Z0-9_-]+$/), request: z.record(z.string(), z.unknown()) }, annotations: { readOnlyHint: false, destructiveHint: false },
	}, ({ id, request }) => call(`/dynamic-assets/application-history/${id}/restore`, request));
	for (const [name, path, description, readOnly] of [
		["validate_template_samples", "/samples/validate", "Read-only validation of 1-8 sound/content samples against a template, using sampleValidationInput from template_schema. Request {template,samples}; shares production checks for pinned transcript/source, focal points, duplicate inputs, bindings and content ranges. Returns native plans for all samples; creates no jobs, projects or library revisions. Does not decode assets or certify rendered quality.", true],
		["insert_template_asset", "/assets/insert", "Insert a saved visual asset into a template draft with an independent resource slot and aspect-preserving region. Input request {template, assetId}. Returns {template, elementId}; does not save.", true],
		["add_template_element", "/elements/add", "Add an independently styled basic element to a template draft. Input request {template, representation: text|rectangle|ellipse|line|star}. Returns {template, elementId}; does not save.", true],
		["apply_template_element_entrance", "/elements/entrance", "Apply editable entrance keyframes to a visual element. Read elementEntrance in template_schema. Input request {template, elementId, entrance: fade|pop|rise, durationFraction: 0.01..1}. Duration is authored normalized progress; absent motionTiming it scales with actual resolved lifetime, otherwise the element phase clock maps it. Replaces opacity and, for pop, scale channels or, for rise, vertical motion; retains other channels. Returns {template}; does not save.", true],
		["apply_template_element_envelope", "/elements/envelope", "Apply fixed-seconds entrance and fade-out with an event-driven hold. Read elementEnvelope in template_schema. Request {template,elementId,entrance:fade|pop|rise,enterSeconds,exitSeconds}. Creates editable keyframes and motionTiming with phase boundaries 0.2/0.8. If an instance is shorter than both phases, compress them proportionally without extending speech or subtitle bounds. Other motion channels retain their authored keys and use the element phase clock. Existing motionTiming.coverage is preserved when replacing the envelope; clear it explicitly in the definition when opting into end cuts. Returns {template}; does not save.", true],
		["create_template_draft", "/create", "Create a minimal editable template draft. Input request {name, canvas:{width,height,fps}}. Native defaults include a subtitle element and full-frame layout. Returns {template}; call save_template to persist.", true],
		["duplicate_template_element", "/elements/duplicate", "Duplicate an element in a template draft with independent style and resource slot. Input: request {template, elementId}. Returns {template, elementId}; does not save. Composition relations are not copied.", true],
		["remove_template_element", "/elements/remove", "Remove an element from a template draft and clean references, including lifecycle and state relations. Input: request {template, elementId}. Returns {template}; does not save.", true],
		["inspect_dynamic_asset", "/dynamic-assets/inspect", "Validate a draft Definition and read its template projection and text-input Companion. Does not save or render.", true],
		["duplicate_dynamic_asset", "/dynamic-assets/duplicate", "Create an independent unsaved style from {definition,name}. Read duplicate in dynamic_asset_schema. Preserves graph, purpose tags, media bindings and provenance, assigns a new asset ID and revision zero. Accepts current draft edits; does not modify the source. Save the returned definition with baseRevision zero and a stable idempotencyKey; retry that save rather than duplicating again.", true],
		["edit_dynamic_asset_media", "/dynamic-assets/media", "Add or replace library media in an effect draft. Read mediaEdit in dynamic_asset_schema. Request {definition,assetId,parentId?} adds a layer; {definition,assetId,layerId} replaces compatible media while retaining geometry, timing and motion. Explicit convertShape:true with layerId converts a rectangle or ellipse to media, retaining its bounds and motion and removing unused shape style. This replaces the shape; it does not mask the media to that shape. Replacement detaches shared resource bindings; it cannot change parent or accept a video shorter than the layer maximum duration. New video layers cap duration to the clip. Returns definition and selectedLayerId without saving or changing a project.", true],
		["preview_dynamic_asset", "/dynamic-assets/preview", "Compile an ephemeral effect preview from {definition, inputs, durationSeconds, example?:{text,keyword,keywordOccurrence,intent?}}. Read preview in dynamic_asset_schema. Optional example.intent selects a synthetic semantic category (default emphasis) without overriding layer filters. Example words receive explicitly synthetic times; keywordOccurrence is zero-based, and keyword must match whole word boundaries. Caption and keyword events use the ordinary native compiler. No TTS, project or saved definition is changed. Returns tracks and example timing provenance for the shared renderer; compilation is not visual verification.", true],
		["preview_detached_dynamic_asset", "/dynamic-assets/detach-preview", "Compile an unsaved independent-pose candidate for an attached layer. Read detachPreview in dynamic_asset_schema: {preview,layerId}, where preview is the ordinary preview request. Render both ordinary and detached candidates at exactly the same scene/local time, inputs, fonts and media; use measured poses with detach_in_frame. This does not itself preserve appearance or save a definition. Never invent geometry; reject stale definition/preview measurements or changed enclosing group transforms.", true],
		["create_dynamic_asset", "/dynamic-assets/create", "Create an independent editable effect draft without a video template or project. Read create in dynamic_asset_schema. Input request {name, canvas:{width,height,fps}, purpose?:decorative_text|keyword|caption|decoration}. Explicit purposes set editable content bindings and fixed entrance/exit phases: literal decorative text, keyword-event emphasis, sentence captions with active-word highlighting, or a non-text decoration starting from an editable square. Decorations can be extended with media and independent motion. Actual event timing comes from the input at application time. Omitting purpose preserves the legacy draft defaults. Returns definition and projection; does not save or certify style quality.", true],
		["preview_dynamic_asset_sample", "/dynamic-assets/sample-preview", "Compile an ephemeral application over actual library media. Read samplePreview in dynamic_asset_schema. Request {template,sample}; sample uses the production sample contract with pinned transcriptRevision, semanticUnits, captionSpans and optional captionPolicy (per-sound segmentation settings). Reuses native production planning and source layout; returns tracks, sourceMedia and audioUrl for local preview. No project or job is created. Live playback supports source audio only; additional sound elements require rendered preview. Compilation does not certify visual quality.", true],
		["preview_dynamic_asset_application", "/dynamic-assets/application-preview", "Compile a sample-text preview of a prepared application template. Read applicationPreview in dynamic_asset_schema. Request {template,durationSeconds,example?:{text,keyword,keywordOccurrence,intent?}}. Uses the shared compiler; returns canvas and tracks for the shared renderer. Example intent defaults to emphasis and can be changed to match authored filters; word times are synthetic, not measured speech. Does not save, render source footage, or verify visual quality.", true],
		["review_dynamic_asset", "/dynamic-assets/reviews", "Submit a review using qualityReview from dynamic_asset_schema: {application,review}. Native code reconstructs the current saved style application and requires exact production graph equality (except template ID/revision), plus all verified preview hashes with at least three fixtures. Scores require actual inspection and rationale; record listening and limitations honestly. Set review.aestheticQualityVerified=true only after continuous visual review and listening of the exact current application; Rust additionally requires listened=true, total score >=90 and no blocking findings. Changed combinations must be captured/saved first. Content-identical retries deduplicate. Does not edit projects.", false],
		["capture_dynamic_asset", "/dynamic-assets/capture", "Capture an application visual graph as a new unsaved editable style. Read capture in dynamic_asset_schema: {template,name}. Preserves elements, typography, motions, per-layer readability holds, resource bindings, treatments and text-bound attachments. The host minimum display duration is retained as the captured default. Sample audio, transcript and source-video framing are not part of the style. Rejects scene-specific composition features that cannot be preserved; never silently flattens groups or drops scheduling. Returns definition at revision 0; use save_dynamic_asset to persist it.", true],
        ["advise_dynamic_asset_placement", "/dynamic-assets/placement-advice", "Apply reusable placement constraints to an exact saved effect application without saving or editing projects. Read placementAdvice in dynamic_asset_schema. Request {application,protectedRegions:[{id,region:{x,y,width,height}}],policy?:{safeInset,requireFullCoverage},padding?:number,candidates?:[{id,centerX,centerY}]}. Coordinates use the output canvas; safeInset and padding are 0–0.25. Empty candidates searches from canvas and protected-region geometry and prefers minimal pixel displacement, rather than fixed template coordinates. Explicit candidates preserve caller preference order. Preserves size, font size, rotation, timing, style and source framing. Returns decision propose, skip or needs_evidence, selectedId/application/template, per-candidate blockers, search coverage and geometryCheck. A proposal is never placement certification. No feasible position returns skip; skip this overlay or change composition and reassess instead of weakening protection or editing the library default for one subject. requireFullCoverage defaults false; true requires exact current content/application evidence for the full effect and protected-region interval, otherwise needs_evidence with null selected outputs. Caller declarations are not automatic detection or independent pixel verification. Include every other overlay in protectedRegions when composing effects; this endpoint moves only the primary effect. Optional readingCheck:{scope:{application,sample},maxLines,minFontSizePx,samples:[{id,elementId,lineCount,fontSizePx,overflowing,timing?:{stableSeconds,requiredStableSeconds}}]} checks caller-supplied renderer measurements. Supply the same current sample at request.sample. Rust rejects a stale scope when application or content changes. Missing scope preserves legacy diagnostics as unscoped with participatesInGate=false, never passed; omitted readingCheck is not_provided. Cover every text element and all reviewed content. With matching scope, failed measurements reject otherwise clear candidates. Optional timing compares caller-measured stable reading seconds (0–600) with the caller content-specific required budget (>0–600); the server does not measure time or estimate reading speed. Timing status may be not_provided, partial, passed, failed, unscoped or requires_candidate_measurement. Partial timing remains partial unless a check failed. Selection moves the application: a moved candidate reports requires_candidate_measurement and sourceStatus rather than inheriting the original reading pass. Re-measure the selected application and submit its exact scope before treating it as current evidence. Scope matching is not independent pixel verification. This is geometric advice, not image/face detection: glyphs, shadows, animated overshoot and moving subjects still require rendered verification. Mark other overlay bounds as protected when composing styles.", true],
        ["prepare_dynamic_asset_application", "/dynamic-assets/application", "Prepare a standalone trial template from an exact saved effect revision. Read application in dynamic_asset_schema. Request {assetId,assetRevision,canvas,placement,inputs?,transform?,captionWidth?,textWidths?,videoRegion?,blurredBackground?,intents?,minDisplaySeconds?}; placement proportionally contains the effect artboard in a normalized destination rectangle. Optional transform {scale,centerX,centerY,rotationDegrees?} scales the contained effect around its element-region bounds and moves that center to normalized canvas coordinates. rotationDegrees is a static clockwise rotation (-180..180) around that application center in output pixels; omission or zero preserves legacy projection. Rotation wraps only style visual members after internal groups, motion and text attachments, never source video/audio. Attachments across a rotated application boundary, split composite groups or interleaved external visual lanes are unsupported and rejected. Optional captionWidth (0.1-1 of output width) reflows only sentence-bound text around its existing center after placement, preserving font size, motion, and keyword decorations. Optional textWidths maps source text element IDs to output-width fractions (0.1-1), overriding captionWidth for those layers without changing type size, timing or motion. Unknown/non-text layers and off-canvas regions are rejected; moving does not change size or timing. Optional videoRegion {x,y,width,height} frames the source video inside a normalized rectangle independently of style layers, type size and timing; defaults to full-frame. Optional blurredBackground:true uses the existing blurred-fill layout: a full-canvas blurred copy behind a contained foreground in videoRegion, preserving source time and one source-audio stream. Uses the current native blur/opacity defaults; only visible with video input. These are application layouts, not part of the saved effect. Optional intents overrides every applied layer intent filter for this application: omitted preserves authored filters, [] allows any intent. Optional minDisplaySeconds (0.1–3 seconds) overrides the saved default hold, while explicit per-layer values take precedence; omission preserves the saved default or existing host fallback. The target can use the gap after a keyword but is capped by the next keyword, input end, maxSeconds and explicit end anchors; aligned words stay unchanged. No additional subtitle is created. Returns an unsaved deterministic template for previewOnly production with measured inputs; does not create a project or save the effect.", true],
		["edit_dynamic_asset_layers", "/dynamic-assets/layers", [
			"Edit an effect draft. Read editLayers in dynamic_asset_schema for {definition,operation}.",
			"Operations: add (representation text|rectangle|ellipse|line|star, optional parentId); duplicate/remove (layerId).",
			"outline (shape layerId, enabled) independently toggles rectangle/ellipse/star/line outline. rectangle_geometry (rectangle layerId, rectangleGeometry:{cornerRadius:0–50}|null) changes only corner geometry; radius uses the actual shorter side, null restores square corners. Clearing existing incompatible geometry is allowed without erasing other draft properties. star_geometry (star layerId, starGeometry:{points,depth}|null) changes only shape parameters, null restores default 5/45. Clear incompatible saved geometry explicitly before converting representations; full resulting draft is validated. ellipse_arc (ellipse layerId, ellipseArc:{startDegrees,sweepDegrees,cap:round|butt}|null) changes only geometry. Requires outline and positive style.strokeWidth; clearing geometry does not clear stroke_reveal. Disable/convert incompatible elements only after explicitly clearing geometry and unsupported motion. Motion property stroke_reveal uses 0..1 keys and non-overshooting easing; independent of opacity and sizeBinding. Rust rejects group/layout or other representation targets. Native editable animation path is params.strokeReveal, not bare strokeReveal.",
			"move (element or group layerId, deltaX, deltaY in canvas-normalized coordinates): converts parent coordinates and clamps within parent while retaining size and motion.",
			"resize (element or group layerId, corner top_left|top_right|bottom_left|bottom_right, canvas-normalized deltaX/deltaY): holds opposite corner, clamps to parent and one canvas pixel minimum where available. Group movement/resizing preserves descendant local coordinates, styles and motion; resizing changes their projected regions without scaling typography or motion translations.",
			"align (layerId, alignment left|center|right|top|middle|bottom): aligns to parent or artboard, preserves size and descendant local coordinates.",
			"place_beside (layerId, referenceId, side left|right|above|below, gap 0..1 in parent-normalized units): requires siblings, centers the other axis, rejects insufficient space without resizing; one-time region placement, not persistent following.",
			"spatial_relation (layerId, relation null or {elementId,relativeTo,placement:overlay|left|right|above|below,gap,offsetX,offsetY,followMotion}): persistent element-layout relation in canvas-normalized units. Follow motion inherits position, scale and rotation, not opacity or duration; compilation requires one covering parent instance. Null detaches while retaining resolved layout. Moving/resizing attached elements adjusts relation offsets. Duplicate remaps internal relationships; remove clears dangling relationships. referenceBounds selects layout (default) or text_box (rendered text/background bounds). text_box currently requires followMotion:true and measured detach_in_frame to detach. Optional sizeBinding:{width?:{factor,padding},height?:{factor,padding}} makes native rectangle/ellipse/line/star dimensions follow actual text_box (including background padding), independently by axis. Each dimension = measured text axis * factor + 2 * padding in that canvas axis; factor (0,20], padding [0,1] per side in normalized canvas units. Omitted axes retain size. Requires text_box and followMotion:true; child animation scale remains multiplicative. Descendant layout followers of a size-bound child are not supported. Geometry is measured at rendering, not inferred from authored layout.",
			"move_in_frame (layerId,deltaX,deltaY,basis): move by scene canvas pixels through renderer-measured movement basis [a,b,c,d]. scale_in_frame (layerId,delta,diagonal,pivotToOrigin,basis,axis?,visualBasis?): resize visual transform while retaining the opposite pivot; axis x/y requires the full measured visualBasis. These change transforms/attachment offsets, not text wrapping regions. Use current paused-frame measurements from the exact definition; do not guess geometry.",
			"detach_in_frame (layerId,attached,independent): poses contain sceneTime,localTime,position:[x,y],basis:[a,b,c,d]. Obtain independent pose with preview_detached_dynamic_asset. Requires matching clocks and unchanged enclosing groups; preserves the current frame and own animation, stops inheriting parent motion, and does not bake the full parent animation. Singular or sheared poses are unsupported and rejected.",
			"stack (element layerId, position front|back): changes only this element's global z order.",
			"entrance (layerId, entrance fade|pop|rise, durationFraction); envelope (layerId, entrance, enterSeconds, exitSeconds, creating fixed phases with adaptive hold).",
			"detach_style (layerId) copies a shared visual style for only that element. Already independent styles are unchanged. Preserves current visual values, content, timing, motion and highlight treatments; does not save. Rejects groups or elements without a visual style.",
			"group_fade (layerId, exitSeconds, optional enterSeconds) sets a fixed-second opacity exit on an isolated composite container; null removes that managed effect. Preserves child reveal/opacity tracks and source event bounds. enterSeconds reserves the entrance budget for proportional compression in short events; omitted keeps the prior budget or zero. Enable group_compositing first. Does not save. General motion treatments also accept motionTiming, mutually exclusive with repeatSeconds. Updating group_fade preserves existing motionTiming.coverage; removing the managed fade removes its sampling requirement.",
			"group_instances (layerId, separateInstances) opts a container into separate controllers for non-overlapping active intervals, including touching boundaries. Overlapping members share one interval. Default false spans all occurrences. No child timing edits; does not save.",
			"group_compositing (layerId, composite) opts a container into isolated compositing. Group-target treatments then affect the composited surface; child channels remain unchanged. Default false preserves per-leaf behavior. Rejects element IDs and overlapping nested composite groups. Does not save.",
			"reading_replica (layerId, primaryId string|null) declares a text layer as a visual reading replica of a non-decoration text primary. Replica must already have role decoration. Requires matching content bindings; no self/chained/dangling relations. Null removes only the relationship. Does not itself grant any reading-time exemption: diagnose_template_production_reading checks frozen event/content/measurement evidence and primary budgets. Duplicate remaps internal relations; removal cleans dangling endpoints; capture/projection and history preserve relations.",
			"semantic_role (layerId, role) changes only the element's semantic role. Use a Role enum value from the native schema or null to clear it. Preserves library purposes, content binding, timing, appearance and motion; does not save. Rejects group and unknown layer IDs.",
			"text_presentation (layerId, binding literal|sentence|keyword, highlight null or {mode:keyword|active_word,color,stroke?}). Active-word requires sentence. Changing binding preserves authored timing (anchor, endAnchor, offsetSeconds and duration limits) and motion. Creation initializes default anchors; editing content does not retime an existing layer. Keyword highlighting holds the marked phrase within each displayed caption; active_word follows measured words. Inherited group highlights can be edited with highlight_treatment (layerId, treatmentId, highlight null or {mode:keyword|active_word,color,stroke?}); this updates every reference to that existing treatment, while null removes the treatment and all its applications. It preserves content bindings, timing and motion, validates all affected targets, and rejects unrelated layer/treatment pairs.",
			"Duplicate copies a subtree with independent styles, slots and inputs. Remove cleans descendants and empty ancestors, and rejects deleting the last element. Returns definition and selectedLayerId without saving or changing a project. Direct timing and motionTiming edits use the same Definition schema. Optional minDisplaySeconds on Definition or a visual Element sets a 0.1–3 second readability hold; local element values take precedence. It reuses the native caption/keyword boundary rules, including next-keyword truncation, and does not change aligned words. This differs from timing.minSeconds, which remains a minimum-duration diagnostic. Optional timing.endAnchor independently selects event_end, cue_end, semantic_end or video_end; omission preserves the legacy end rule. Explicit ends remain capped by maxSeconds and input duration. cue_end needs an associated caption and rejects a keyword crossing its boundary; semantic_end needs an associated semantic unit. Changing content alone does not supply those associations. Fixed entrance/exit phases compress for short instances without changing event boundaries. Optional motionTiming.coverage {minExitFrames,minPostFrames} requests 0..120 frames of each kind, at least one nonzero; minExitFrames>0 requires positive exitSeconds. Omission permits an end cut. Compile/preview/production expose exitSampling with basis predicted_frame_sampling and warnings only: frame-grid opportunity counts are not decoded MP4 evidence, pixel disappearance, listening or aesthetic acceptance. Switching to relative timing removes the timing object and its sampling requirement.",
		].join(" "), true],
		["archive_dynamic_asset", "/dynamic-assets/archive", "Archive or restore a library style without changing its definition, historical versions or existing applications. Read archive in dynamic_asset_schema. Request {assetId,assetRevision,baseRevision,archived}; baseRevision is the library entry revision from list_dynamic_assets (zero when missing), distinct from assetRevision. Conflicts require rereading; do not blindly retry. list_dynamic_assets includes all definitions plus separate library entries; archived styles remain readable and usable by pinned revision.", false],
		["save_dynamic_asset", "/dynamic-assets", "Create or replace an editable asset definition using the native save schema, baseRevision and idempotencyKey. Optional definition.usageGuide contains purpose, invariants, adjustments, constraints, fallback and coverage (each nonempty, up to 4000 characters). This is authored guidance for case-specific Agent adaptation, not automatically enforced runtime policy; preserve it during edits. Optional definition.purposes is a list of discovery tags: keyword, decorative_text, caption, decoration. Tags can overlap and do not change content binding, motion or event timing. Atomic save preserves immutable historical revisions. This is a draft save, not publication or quality approval.", false],
		["insert_dynamic_asset", "/dynamic-assets/insert", "Expand an exact saved asset revision into an editable template snapshot. Optional placement is a normalized destination rectangle: the effect canvas is proportionally contained and centered inside it; pixel styles and translations scale, timing stays unchanged. Optional transform sets independent scale/center after adaptation and optional rotationDegrees (-180..180 clockwise around its application center). Rotation preserves internal group motion; cross-boundary attachments and split/interleaved composite layers are rejected; captionWidth changes sentence line width without scaling type or motion. Optional textWidths maps source text element IDs (before instance prefix) to widths (0.1-1), overriding captionWidth on those layers while preserving type and motion. Independent sizing and width overrides require placement. Optional minDisplaySeconds (0.1–3 seconds) overrides the saved default for inserted layers that lack their own explicit minimum. Inserted layers retain the effective hold independently of the host; omission keeps saved/local values and otherwise uses the host visual-rhythm fallback. Does not change word times or timing.minSeconds semantics. Optional intents overrides only the inserted layers: omitted preserves authored filters, [] allows any intent; host layers and saved asset stay unchanged. Optional attachments is an array of spatial relations with fully qualified inserted elementId, existing host text relativeTo, placement (overlay/above/below/left/right), gap, offsetX, offsetY, referenceBounds:text_box and followMotion:true. Optional attachment sizeBinding:{width?:{factor,padding},height?:{factor,padding}} resizes native rectangle/ellipse/line/star leaves to the host measured text_box; padding is per side in output-canvas normalized units, factor (0,20], padding [0,1]. Omitted axes retain size and child animation scale still multiplies. Each source is unique; existing host elements cannot be modified. Without placement, canvases must match. Returns a template and layer map; does not write a project or maintain a live asset link. Use the returned template with existing validation and compilation tools.", true],
	]) server.registerTool(name, {
		description, inputSchema: { request: z.record(z.string(), z.unknown()) },
		annotations: { readOnlyHint: readOnly, destructiveHint: false },
	}, ({ request }) => call(path, request));
	for(const [name,path,description] of [
		["create_template_production","/production","Queue automatic compilation, browser preview rendering and publication of Agent-authored templates. Read productionInput from template_schema. Supply 1-100 distinct designs and 1-8 measured-input fixtures each, with a separate project named Template Production /... for every fixture. Shared visual assets are materialized by the web transport. Inspect renderJob and item status for completion; publication requires actual MP4 decode and audio coverage checks, not just compilation. Chrome and the native renderer runtime must be installed."],
	]) server.registerTool(name,{description,inputSchema:{request:z.record(z.string(),z.unknown())},annotations:{readOnlyHint:false,destructiveHint:false}},async({request})=>{
        try {return await call(path,request);}
        catch(error){return {isError:true,content:[{type:"text",text:String(error.message??error)}]};}
    });
	server.registerTool("import_template_asset",{description:"Import a reusable still image or short silent video into the native content-addressed visual catalog. Read visualAssetImport in template_schema. PNG preserves transparency; video becomes silent H.264 MP4, with audio handled separately. Provenance is caller-supplied. Store the returned asset ID in a template resource binding; apply_template and batch production materialize it automatically in each project.",inputSchema:{request:z.record(z.string(),z.unknown())},annotations:{readOnlyHint:false,destructiveHint:false}},({request})=>call("/assets",request));
	server.registerTool("list_template_assets",{description:"List reusable native visual assets with dimensions, tags, hashes and origin statements. These are distinct from project-local media IDs and from the sound catalog.",inputSchema:{},annotations:{readOnlyHint:true}},()=>call("/assets"));
	server.registerTool("list_template_productions",{description:"List durable template production batches.",inputSchema:{},annotations:{readOnlyHint:true}},()=>call("/production"));
	server.registerTool("execute_template_production",{description:"Dispatch or retry automatic preview rendering and publication for an existing prepared batch. Native workers serialize browser rendering and preserve completed fixtures. Read renderJob and item status on read_template_production; compilation success is not publication. New batches dispatch automatically.",inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/)},annotations:{readOnlyHint:false,destructiveHint:false}},({id})=>call(`/production/${id}/execute`,{}));
	server.registerTool("diagnose_template_production_reading",{description:"Read-only reading diagnostic bound to a published frozen batch item/fixture and exact output SHA. Use productionReadingDiagnostic from template_schema: {fixtureId,outputSha256,viewportWidthPx,minFontSizePx,maxLines,budgets?:[{elementId,stableStartSeconds?,stableSeconds,requiredStableSeconds}]}. Empty budgets returns the native primaryInstances directory; use actual elementId and scene-second stable intervals. Times are caller observations, not machine visual verification. Only explicit readingReplicas with matching source event/content, actual measurements and a passing primary budget exempt a replica from independent timing. Stable geometry requires geometryCoverage=constant_record_pose_v1, every stable exported frame and droppedRecords=0. New fixtures pin textMeasurementGeometryCoverage and reject legacy/unmarked attachments. Historical unmarked records retain only their first pose: native results stay partial, cannot exempt replica timing and leave undetected boundaries unverified. Any droppedRecords>0 remains incomplete even if framesObserved appears complete. Inspect native geometryEvidence.partialReasons and geometryCheck.records[].partialReasons; do not upgrade the marker or infer a pass. Replica dwell exemption does not certify its geometry: all active frames, minimum font, line and overflow checks remain required. Producer declarations and SHA/source validation are not independently verified pixels. Visual occlusion/competition and aesthetics are unverified. Does not change scores, files, revisions, legacy placementAdvice or publication.",inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/),index:z.number().int().nonnegative(),request:z.record(z.string(),z.unknown())},annotations:{readOnlyHint:true,destructiveHint:false}},({id,index,request})=>call(`/production/${id}/items/${index}/reading-diagnostic`,request));
	server.registerTool("audit_template_production_item",{description:"Recheck published preview hashes and expected video/audio stream coverage, record PCM measurements and audit history. Requires current item revision. This does not certify perceptual quality or revoke prior publication.",inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/),index:z.number().int().nonnegative(),baseRevision:z.number().int().nonnegative()},annotations:{readOnlyHint:false,destructiveHint:false}},({id,index,baseRevision})=>call(`/production/${id}/items/${index}/audit`,{baseRevision}));
	server.registerTool("read_template_production",{description:"Read batch progress, per-template errors and publication status. Job succeeded means compilation finished; inspect item status for render_ready versus published.",inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/)},annotations:{readOnlyHint:true}},({id})=>call(`/production/${id}`));
	server.registerTool("read_template_production_item",{description:"Read an exact template and its compiled preview fixtures, request fingerprints and isolated documents for rendering.",inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/),index:z.number().int().nonnegative()},annotations:{readOnlyHint:true}},({id,index})=>call(`/production/${id}/items/${index}`));
	server.registerTool("control_template_production",{description:"Cancel at the next item boundary, resume, or retry failed compilations without duplicating completed items. Use a new batch when designs or fixture inputs change.",inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/),action:z.enum(["cancel","resume","retry_failed"])},annotations:{readOnlyHint:false,destructiveHint:false}},({id,action})=>call(`/production/${id}/control`,{action}));
	server.registerTool("publish_template_production_item",{description:"Submit rendered MP4 previews for all fixtures using productionPublish from template_schema. Rust copies and hashes previews, checks dimensions/duration and full decoding, then saves the reusable template with CAS and durable idempotency. This is technical validation, not aesthetic approval.",inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/),index:z.number().int().nonnegative(),request:z.record(z.string(),z.unknown())},annotations:{readOnlyHint:false,destructiveHint:false}},({id,index,request})=>call(`/production/${id}/items/${index}/publish`,request));
	for (const [name,path,description] of [
		["preflight_template","/preflight","Check an exact CompileInput against the actual compiler and current sound catalog without writing a project. Returns executable, issues, warnings and requestFingerprint. Use compileInput from template_schema; include the current document and media."],
		["evaluate_template_plans","/evaluate","Compile and rank bounded complete plans with score-guided search and dimension coverage. Uses evaluationInput from template_schema. Writes a local evaluation receipt, never the project. Returns evaluationId, metricVersion, requests, metrics, changes, search diagnostics and calibration profile. Readability uses the per-sound captionPolicy or the template segmentation budget, matching caption diagnostics. It does not assess faces, gestures or background clutter: inspect rendered candidates before choosing placement. Human preferences only reweight metrics from the same metricVersion; scores are not aesthetic quality guarantees."],
		["repair_template_plan","/repair","Search actual compiler outcomes for an executable plan without writing the project. Uses evaluationInput; repair.shortenElements and repair.cutTransitions explicitly limit permissible duration reductions and transition removal. Tries resourceCandidates and declared fallbacks. Returns selectedRequest and compilation, or failed candidate reasons. Re-read project before applying."],
		["record_template_preference","/preferences","Record a reviewer preference using preferenceFeedback from template_schema. Requires an evaluationId and two executable candidate IDs; metrics come from the native receipt. Optional renderedPaths must contain both local PNG/JPEG/MP4 artifacts. Render evidence is reviewer supplied. Records without artifacts do not train weights. Durable idempotency key required."],
		["retract_template_preference","/preferences/retract","Retract a preference with id and baseRevision, preserving its audit record and refitting the profile. Uses preferenceRetraction in template_schema."],
	]) server.registerTool(name,{description,inputSchema:{request:z.record(z.string(),z.unknown())},annotations:{readOnlyHint:["preflight_template","repair_template_plan"].includes(name),destructiveHint:false}},({request})=>call(path,request));
	server.registerTool("read_template_preference_profile",{description:"Read current local preference factors, revision, training sample counts and active status. Baseline remains active until sufficient rendered comparisons exist.",inputSchema:{id:z.string().regex(/^[a-zA-Z0-9_-]+$/)},annotations:{readOnlyHint:true}},({id})=>call(`/preferences/${id}`));
	server.registerTool(
		"recommend_templates",
		{
			description: "Queue local multilingual semantic retrieval using a measured input transcript and optional creative brief. Requires its current transcript revision. Returns a job; read_template_recommendation returns ranked templates, exact version references, matching text and resource/rendering limitations. Similarity is not a quality rating. No media or text is uploaded.",
			inputSchema: { inputId: z.string().min(1), transcriptRevision: z.number().int().positive(), brief: z.string().default(""), limit: z.number().int().min(1).max(10).default(5) },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		(input) => call("/recommendations", input),
	);
	server.registerTool(
		"read_template_recommendation",
		{
			description: "Read a template recommendation job and its results. stale=true means the transcript or template library changed; re-run recommendation before choosing a result.",
			inputSchema: { id: z.string().min(1) }, annotations: { readOnlyHint: true },
		},
		({ id }) => call(`/recommendations/${id}`),
	);
	server.registerTool(
		"analyze_template_sounds",
		{
			description: "Queue local AudioSet event classification for all non-rejected sounds. Results in list_templates include source/model hashes, top label scores, voice/music evidence and short-window warnings. Scores are uncalibrated model evidence, not proof of clean extraction; this does not change sound approval. Reuses an existing batch for unchanged source hashes and model revision.",
			inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false },
		},
		() => call("/sounds/analyze", {}),
	);
	server.registerTool(
		"clip_template_sound",
		{
			description: "Create a sound candidate by trimming exactly one imported inputId or existing library soundId (including separated stems). Times are relative to that file. Derived clips preserve original source timing and parent audio hash. Identical source/range reuses the existing record without resetting reviews. New clips remain unreviewed, even when their parent was approved. Audition before binding to a template.",
			inputSchema: {
				inputId: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
				soundId: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
				startSeconds: z.number().finite().nonnegative(),
				endSeconds: z.number().finite().positive(),
				name: z.string().min(1), description: z.string(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		(body) => call("/sounds/clip", body),
	);
	server.registerTool(
		"apply_template",
		{
			description: "Compile a template in Rust and atomically apply editable tracks through the project CAS writer. composition defines reusable visual treatments, their applications, element transition pairs, spatial relationships, sound-event scheduling and resource requirements. Dissolves preserve audio and total duration; incoming video requires source preroll. Layout dissolves currently require one layer per side. Read template_schema capabilities first. visualBindings supplies project media with contain/cover and sourceStartSeconds. Optional source partitions a main-track video while preserving one continuous source-audio track. Existing source retime/masks/effects/animations are refused. Re-read and wait_for_sync before visual verification.",
			inputSchema: {
				projectId: z.string().min(1), sceneId: z.string().min(1),
				baseRevision: z.number().int().nonnegative(),
				idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]+$/),
				startTimeSeconds: z.number().finite().nonnegative().default(0),
				input: z.record(z.string(), z.unknown()),
				source: z.object({ trackId: z.string().min(1), elementId: z.string().min(1), focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional() }).optional(),
				visualBindings: z.array(z.object({
					resourceId: z.string().min(1), mediaId: z.string().min(1),
					sourceStartSeconds: z.number().finite().nonnegative().default(0),
					fit: z.enum(["contain", "cover"]).default("contain"),
					focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
				})).optional(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		async ({ projectId, ...request }) => {
			try {
				const base = process.env.OPENCUT_BASE_URL ?? "http://127.0.0.1:3000";
				const document = await readProject({ projectId, base });
                await materializeTemplateAssets({projectId,template:request.input.template,bindings:request.input.resourceBindings,visualBindings:request.visualBindings,base});
				const needsMedia = request.source || request.visualBindings?.length || request.input.template?.resourceSlots?.some((r) => ["image", "video", "visual_media"].includes(r.representation)) || request.input.template?.resources?.some((r) => ["icon", "sticker", "broll"].includes(r.kind) && r.assetId);
				const media = needsMedia ? await mediaIndexOf({ projectId, base }) : undefined;
				const response = await call("/compile", { ...request, document, media });
				if (response.isError) return response;
				const compiled = JSON.parse(response.content[0].text);
				const result = compiled.deduplicated ? { revision: document.revision } :
					await writeProject({ projectId, document: compiled.document, baseRevision: request.baseRevision, base });
				const readback = await readProject({ projectId, base });
				const verification = await call("/compile", { ...request, document: readback, media });
				if (verification.isError) return verification;
				if (!JSON.parse(verification.content[0].text).deduplicated) {
					throw new Error("Template elements were not found during project readback");
				}
				return { content: [{ type: "text", text: JSON.stringify({
					projectId, ...result, elementCount: compiled.elementCount,
					deduplicated: compiled.deduplicated, warnings: compiled.warnings,
					readbackRevision: readback.revision,
					verified: true,
				}) }] };
			} catch (error) {
				return { isError: true, content: [{ type: "text", text: JSON.stringify({
					error: String(error.message ?? error), code: error.code,
				}) }] };
			}
		},
	);
	server.registerTool(
		"correct_template_transcript",
		{
			description:
				"Correct misrecognized word text with CAS revision and a reason for each edit. Preserves all measured timestamps, raw ASR and immutable correction history. Indices refer to normalized words in read_template_input.",
			inputSchema: {
				id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
				baseRevision: z.number().int().positive(),
				edits: z
					.array(
						z.object({
							index: z.number().int().nonnegative(),
							text: z.string().min(1),
							reason: z.string().min(1),
						}),
					)
					.min(1),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		({ id, ...body }) => call(`/inputs/${id}/correct`, body),
	);
	server.registerTool(
		"import_template_input",
		{
			description:
				"Import a local video or TTS audio file into the native template workbench without uploading it externally. Returns stable inputId metadata. Transcription is explicitly queued separately.",
			inputSchema: { path: z.string().min(1), name: z.string().optional() },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		(body) => call("/inputs/import", body),
	);
	server.registerTool(
		"list_template_inputs",
		{
			description:
				"List imported video/audio inputs and local transcription jobs.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() => call("/inputs"),
	);
	server.registerTool(
		"read_template_input",
		{
			description:
				"Read an input, current job, raw ASR words, normalized measured word intervals and confidence warnings. Review transcription before using words in plan_template.",
			inputSchema: { id: z.string().regex(/^[a-zA-Z0-9_-]+$/) },
			annotations: { readOnlyHint: true },
		},
		({ id }) => call(`/inputs/${id}`),
	);
	server.registerTool(
		"analyze_template_prosody",
		{
			description:
				"Measure aligned word RMS, sample peaks, word gaps, McLeod pitch and actual low-energy audio intervals. quietGapSeconds gives the longest continuous measured quiet interval within each adjacent word gap, in word order. Pass it with candidateWords to plan_template to replace ASR-gap pause guesses; use only with these exact word times. Quiet audio is not proof of speech absence, and music may mask speech pauses. Pitch includes median Hz, range and change with support counts; Chinese lexical tones need review. Returns versioned evidence without modifying transcript or project.",
			inputSchema: {
				id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
				transcriptRevision: z.number().int().positive(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		({ id, ...body }) => call(`/inputs/${id}/prosody`, body),
	);
	server.registerTool(
		"transcribe_template_input",
		{
			description:
				"Queue local CPU Whisper word-level transcription. Preserves raw model timing and reports merged overlapping units or uncertain words. Does not upload media; first use downloads model weights.",
			inputSchema: { id: z.string().regex(/^[a-zA-Z0-9_-]+$/) },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		({ id }) => call(`/inputs/${id}/transcribe`, {}),
	);
	server.registerTool(
		"separate_template_audio",
		{
			description:
				"Queue local Demucs separation for an audible reference. Returns a durable job; list_templates exposes jobs and unreviewed stems/candidates. No media is uploaded. Candidates are not clean SFX until auditioned and reviewed.",
			inputSchema: { id: z.string().regex(/^[a-zA-Z0-9_-]+$/) },
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		({ id }) => call(`/references/${id}/separate`, {}),
	);
	server.registerTool(
		"review_template_sound",
		{
			description:
				"Classify an auditioned sound with CAS revision. Approval requires sound_effect or background_music kind. Preserve contamination/source information; do not approve unlistened candidates as clean effects.",
			inputSchema: {
				id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
				baseRevision: z.number().int().nonnegative(),
				status: z.enum(["review", "approved", "rejected"]),
				kind: z.enum(["stem", "candidate", "sound_effect", "background_music"]),
				name: z.string(),
				description: z.string(),
				tags: z.array(z.string()),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		({ id, ...body }) => call(`/sounds/${id}/review`, body),
	);
	server.registerTool(
		"list_templates",
		{
			description:
				"Read the template workbench, reference audits and sound library. Template business logic and durable state live in Rust.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() => call(""),
	);
	server.registerTool(
		"template_schema",
		{
			description:
				"Read authoritative template/planning schemas and executable capabilities, composition rules and transition constraints. Read modelBoundaries: Template is a compilable composition document and may include application orchestration; Definition is the reusable visual style. Read before authoring a template.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() => call("/schema"),
	);
	server.registerTool(
		"read_template",
		{
			description: "Read one current template and its revision before editing.",
			inputSchema: { id: z.string().regex(/^[a-zA-Z0-9_-]+$/) },
			annotations: { readOnlyHint: true },
		},
		({ id }) => call(`/${id}`),
	);
	server.registerTool(
		"read_template_ontology",
		{
			description: "Read the current v2 template model used by saving and compilation: independent element features, resource slots and bindings, layout entrances, paired transition rules and separate policies. Asset references are not approval. This is an alias of read_template; schemas are in template_schema.",
			inputSchema: { id: z.string().regex(/^[a-zA-Z0-9_-]+$/) },
			annotations: { readOnlyHint: true },
		},
		({ id }) => call(`/${id}/ontology`),
	);
	server.registerTool(
		"save_template",
		{
			description:
				"Create (baseRevision=0) or update a template with compare-and-swap revision and durable idempotency key. Re-read and merge after revision_conflict. All fields follow template_schema.",
			inputSchema: {
				template: z.record(z.string(), z.unknown()),
				baseRevision: z.number().int().nonnegative(),
				idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]+$/),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		(body) => call("/save", body),
	);
	server.registerTool(
		"plan_template",
		{
			description:
				"Dry-run the v2 template model. Input follows planInput in template_schema. Accepts aligned speech words and/or evidenced soundEvents (speech, beat, onset, pause, energy_peak, section). Do not invent measured events. composition.scheduling records thresholds, score weights, cooldown, repetition penalties and occurrence limits; output includes scheduleDecisions. semanticUnits and captionSpans remain independent. Optional captionPolicy overrides segmentation for this sound without changing the library template. preserveLayoutPhrases:true opts automatic segmentation into honoring valid layoutPhrases within character/duration budgets; pauses, clause/speaker boundaries and explicit captionSpans retain priority. Default false preserves legacy timing; no source word time changes. ResourceBindings override template defaults. Output includes visual/audio instances and concrete layout/element transition pairs. Advisory text_opacity_hold_short warnings identify instance, start, end, longest fully opaque hold and recommended hold (seconds); inspect short-word fades without treating absence of warnings as visual certification. Does not mutate a project.",
			inputSchema: { input: z.record(z.string(), z.unknown()), format: z.enum(["legacy", "ontology"]).optional().describe("Compatibility route selector; both routes now return the authoritative v2 plan") },
			annotations: { readOnlyHint: true },
		},
		({ input, format }) => call(format === "ontology" ? "/ontology/plan" : "/plan", input),
	);
	server.registerTool(
		"search_template_sounds",
		{
			description: "Search the local sound library. matchBy metadata (default) compares multilingual names, descriptions and tags. matchBy audio uses CLAP to compare actual waveforms with an English sonic description using ASCII punctuation; translate Chinese intent into a concise English sound description first. Audio scores rank the best covered 10-second window, return its relative offsets and mean window score, and flag short sounds repeated for the model. Similarity is not cleanliness or quality. Defaults to approved sounds; includeReview exposes non-bindable audition candidates. Returns revisions, hashes and current voice/music evidence. No approval or project edits.",
			inputSchema: {
				query: z.string().min(1).max(600),
				matchBy: z.enum(["metadata", "audio"]).default("metadata"),
				kind: z.enum(["sound_effect", "background_music"]),
				includeReview: z.boolean().default(false),
				maxDurationSeconds: z.number().min(0.02).max(600),
				limit: z.number().int().min(1).max(20).default(5),
			},
			annotations: { readOnlyHint: true },
		},
		(body) => call("/sounds/search", body),
	);
	server.registerTool("list_template_voices", {
		description: "List installed local system TTS voices and stable voice IDs. Currently supported on macOS; unsupported platforms return available:false. No voice cloning or audio upload.",
		inputSchema: {}, annotations: { readOnlyHint: true },
	}, () => call("/tts/voices"));
	server.registerTool("generate_template_speech", {
		description: "Generate local TTS from plain script using an installed voice ID. Imports the generated WAV and queues measured ASR word timing. Read the returned input ID with read_template_input, then analyze_template_prosody and plan_template. Do not fabricate timestamps from the script; compare ASR with preserved synthesis text. Identical request and recorded OS/voice identity reuse saved audio; voice asset version may be unknown. Does not modify a project.",
		inputSchema: { name: z.string().min(1).max(100), text: z.string().min(1).max(2000), voiceId: z.string().min(1), speakingRate: z.number().int().min(80).max(350) },
		annotations: { readOnlyHint: false, destructiveHint: false },
	}, (body) => call("/tts/generate", body));
}
