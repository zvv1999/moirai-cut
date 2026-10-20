import {expect,test} from "bun:test";
import {Children,isValidElement,type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {StarGeometryControls} from "./star-geometry-controls";
function field(tree:ReactNode,label:string){let result:any;function visit(n:ReactNode){Children.forEach(n,c=>{if(!isValidElement<Record<string, any>>(c))return;if(c.props['aria-label']===label)result=c.props;visit(c.props.children);});}visit(tree);if(!result)throw Error(label);return result;}
test("star defaults mirror native renderer and geometry edits preserve other axis",()=>{
 let value:{points:number;depth:number}|undefined;const tree=()=>StarGeometryControls({value,eligible:true,onChange:v=>value=v});
 expect(field(tree(),'星形角数').value).toBe(5);expect(field(tree(),'星形内半径百分比').value).toBe(45);
 field(tree(),'星形角数').onChange({target:{valueAsNumber:4}});expect(value).toEqual({points:4,depth:45});
 field(tree(),'星形内半径百分比').onChange({target:{valueAsNumber:20}});expect(value).toEqual({points:4,depth:20});
 field(tree(),'星形角数').onChange({target:{valueAsNumber:4.5}});field(tree(),'星形内半径百分比').onChange({target:{valueAsNumber:NaN}});expect(value).toEqual({points:4,depth:20});
});
test("incompatible saved star remains visible and explicit clear stays available",()=>{
 const html=renderToStaticMarkup(<StarGeometryControls value={{points:4,depth:20}} eligible={false} onChange={()=>{}}/>);
 expect(html).toContain('清除星形参数');expect(html).toContain('disabled=""');expect(html).not.toContain('type="color"');
});
