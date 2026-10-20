import type {TrialContentSnapshot} from "./production-create";
import type {Plan} from "./types";
import {moveTrialDesignBindings} from "./trial-resource-bindings";

export type TrialContentValidation = {samples: {inputId: string; plan: Pick<Plan, "semanticUnits">}[]};

/** Restore the native planner's segments so its diagnostic destinations also
 * exist in the content editor. Explicit segments and event-only inputs remain
 * exactly as recorded; this adapter never derives word ranges itself. */
export function trialContentWithNativeSegments(snapshot: TrialContentSnapshot, validation: TrialContentValidation): TrialContentSnapshot {
	return {...snapshot, entries: snapshot.entries.map(entry => {
		if (entry.transcriptRevision == null || entry.semanticUnits.length) return entry;
		const plans = validation.samples.filter(sample => sample.inputId === entry.inputId);
		if (plans.length !== 1 || !Array.isArray(plans[0].plan?.semanticUnits)) {
			throw Error(`${entry.title} 的内容分段校验结果不完整，当前内容未被替换。`);
		}
		return {...entry, semanticUnits: plans[0].plan.semanticUnits};
	})};
}

/** Browser snapshot identity only. Rebind the explicitly recorded draft after
 * returning from a style edit; Rust still validates design/slot compatibility. */
export function trialContentForTemplate(snapshot:TrialContentSnapshot,templateId:string):TrialContentSnapshot{
	const previousId=snapshot.sourceTemplateId;
	if(previousId!==undefined&&(typeof previousId!=="string"||!previousId.trim()))throw Error("试映内容的来源样式标识无效。当前内容未被替换。");
	// Legacy snapshots have no authoritative source identity. Do not guess from
	// the number or names of design keys, or silently erase unrelated overrides.
	if(previousId===undefined||previousId===templateId)return snapshot;
	const entries=snapshot.entries.map(entry=>{
		const bindings=entry.designResourceBindings;
		if(!bindings||!Object.hasOwn(bindings,previousId))return entry;
		if(Object.hasOwn(bindings,templateId))throw Error("试映内容同时包含来源样式和当前样式的素材设置，无法自动合并。请先核对内容文件；当前内容未被替换。");
		return {...entry,designResourceBindings:moveTrialDesignBindings(bindings,previousId,templateId)};
	});
	return {...snapshot,sourceTemplateId:templateId,entries};
}
