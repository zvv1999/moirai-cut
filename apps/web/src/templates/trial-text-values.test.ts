import {expect,test} from "bun:test";
import {trialTextValues} from "./trial-text-values";

test("application text URL values retain explicit defaults, whitespace and Unicode for native validation",()=>{
 const values={headline:"逐行\n显示 😀",label:" 原值 ",empty:""};
 expect(trialTextValues(JSON.parse(JSON.stringify(values)))).toEqual(values);
 expect(trialTextValues(undefined)).toEqual({});
});
test("malformed text maps fail at the link boundary instead of silently dropping input keys",()=>{
 for(const value of [null,[],"headline",{headline:17},{headline:null},{headline:true}])expect(()=>trialTextValues(value)).toThrow("文字内容参数无效");
});
