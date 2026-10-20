import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlacementAdviceResult, PlacementPolicyControls, placementCandidateName, type PlacementAdvice, type PlacementPolicy } from "./placement-advisor";

function control(tree: ReactNode, label: string): Record<string, any> {
 let found: Record<string, any> | undefined;
 function visit(node: ReactNode) { Children.forEach(node, child => { if (!isValidElement<Record<string, any>>(child)) return; if (child.props["aria-label"] === label) found = child.props; visit(child.props.children); }); }
 visit(tree); if (!found) throw Error(label); return found;
}
const policy:PlacementPolicy={safeInset:.04,requireFullCoverage:false};
const proposal:PlacementAdvice={selectedId:"auto-2",application:{transform:{scale:.6,centerX:.2,centerY:.4}},candidates:[{id:"auto-2",eligible:true,reason:"clear"}],decision:"propose",geometryCheck:{status:"requires_render_measurement",placementCertified:false},search:{method:"obstacle_boundary_minimum_pixel_displacement",complete:true,evaluatedCenters:12}};
function markup(advice:PlacementAdvice,rule=policy) { return renderToStaticMarkup(<PlacementAdviceResult advice={advice} policy={rule} regions={[]} disabled={false} onApply={()=>{}}/>); }

test("placement controls preserve independent rule fields and never invent full coverage",()=>{
 let current=policy;
 const tree=()=>PlacementPolicyControls({policy:current,onChange:next=>{current=next;}});
 control(tree(),"画面安全边距").onChange({target:{valueAsNumber:6}});
 expect(current).toEqual({safeInset:.06,requireFullCoverage:false});
 control(tree(),"要求完整避让证据").onChange({target:{checked:true}});
 expect(current).toEqual({safeInset:.06,requireFullCoverage:true});
 control(tree(),"画面安全边距").onChange({target:{valueAsNumber:NaN}});
 expect(current.safeInset).toBe(.06);
 const html=renderToStaticMarkup(<PlacementPolicyControls policy={current} onChange={()=>{}}/>);
 expect(html).toContain("圈出单帧不代表已完成检查");
});

test("native proposals stay provisional and legacy decisions remain display-compatible",()=>{
 const html=markup(proposal);
 expect(html).toContain("待预览方案：自动候选 2");expect(html).toContain("应用待预览方案");expect(html).toContain("不代表通过验收");expect(html).not.toContain("安全通过");
 expect(placementCandidateName("upper_left")).toBe("左上");expect(placementCandidateName("custom-label")).toBe("custom-label");
 const legacy={...proposal,decision:undefined,geometryCheck:undefined,search:undefined};
 expect(markup(legacy)).toContain("应用待预览方案");
 const strict=markup(legacy,{...policy,requireFullCoverage:true});
 expect(strict).toContain("尚缺完整避让证据");expect(strict).not.toContain("应用待预览方案");
});

test("missing evidence, blocked space and unchanged implicit transforms never apply a candidate",()=>{
 const strict=markup({...proposal,decision:"needs_evidence",selectedId:null,application:null,candidates:[{id:"auto-2",eligible:false,reason:"evidence_incomplete"}]},{...policy,requireFullCoverage:true});
 expect(strict).toContain("全程避让证据不完整");expect(strict).not.toContain("应用待预览方案");
 const blocked=markup({...proposal,decision:"skip",selectedId:null,application:null});
 expect(blocked).toContain("跳过本次叠加");expect(blocked).not.toContain("调整保护框");expect(blocked).not.toContain("应用待预览方案");
 const current=markup({...proposal,selectedId:"current",application:{},candidates:[{id:"current",eligible:true,reason:"clear"}]});
 expect(current).toContain("当前应用已在候选位置");expect(current).not.toContain("应用待预览方案");
});
