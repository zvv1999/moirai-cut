/** Shape check for browser links. Text constraints are validated by Rust. */
export function trialTextValues(value:unknown):Record<string,string>{
	if(value===undefined)return {};
	if(!value||typeof value!=="object"||Array.isArray(value)||Object.values(value).some(text=>typeof text!=="string"))throw Error("文字内容参数无效，请重新选择或输入。");
	return value as Record<string,string>;
}
