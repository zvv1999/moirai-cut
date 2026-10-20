import { redirect } from "next/navigation";
import { EffectWorkbench } from "@/templates/effect-workbench";
export default async function TemplatesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
	const params=await searchParams;
	if(params.template) {
		const query=new URLSearchParams();
		for(const [key,value] of Object.entries(params)) {
			for(const item of Array.isArray(value)?value:value===undefined?[]:[value]) query.append(key,item);
		}
		redirect(`/templates/compositions?${query.toString()}`);
	}
	return <EffectWorkbench />;
}
