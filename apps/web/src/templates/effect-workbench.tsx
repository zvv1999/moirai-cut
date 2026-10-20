"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { DynamicAssetLibrary } from "./dynamic-assets";
import "./workbench.css";

async function api<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(`/api/footage/templates${path}`, {
		method: body === undefined ? "GET" : "POST", cache:"no-store",
		headers: {"content-type":"application/json","x-requested-with":"moirai-footage"},
		body:body === undefined ? undefined : JSON.stringify(body),
	});
	const result = await response.json();
	if (!response.ok) throw new Error(result.error ?? "请求失败");
	return result;
}

export function EffectWorkbench() {
	const [message,setMessage] = useState("");
	const [pending,setPending] = useState(false);
	return <div className="template-workbench" onClickCapture={(event) => {
		if(pending && event.target instanceof Element && event.target.closest("a[href]") && !event.metaKey && !event.ctrlKey){event.preventDefault();setMessage("请先保存当前效果的修改。");}
	}}>
		<header className="tw-header">
			<Link href="/projects" aria-label="返回工程" title="返回工程"><ArrowLeft size={18}/></Link>
			<h1>样式素材工作台</h1><span className="tw-spacer" />
			<Link href="/templates/compositions">模板组合</Link>
		</header>
		<main className="tw-effect-workbench">
			<p className="tw-style-guidance">这里设计可复用的重点词、花字、字幕和装饰。编辑并保存样式版本后，进入“用声音试效果”为具体素材调整位置、行宽和内容；单次应用与模板版本分别保存。</p>
			{message && <p role="status">{message}</p>}
			<DynamicAssetLibrary api={api} onMessage={setMessage} onPendingChange={setPending}/>
		</main>
	</div>;
}
