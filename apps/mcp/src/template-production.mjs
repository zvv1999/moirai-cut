import fs from "node:fs/promises";
import { fstatSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readProject, writeProject } from "./project-file.mjs";
import { produceTemplates } from "./template-authoring.mjs";
import { callRendererTool } from "./template-renderer-tool.mjs";
import { productionMeasurementAttachment, productionCompilationDocument } from "./template-measurement-transport.mjs";

// Platform adapter: Rust owns batches, eligibility, compilation and publication.
// This process drives the existing browser renderer and reports its exact outputs.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = process.env.OPENCUT_BASE_URL ?? "http://127.0.0.1:3000";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(route, body) {
  const response = await fetch(`${base}/api/footage/templates${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-requested-with": "moirai-footage" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  const raw = await response.text();
  let result;
  try { result = JSON.parse(raw); }
  catch { throw new Error(`Template API ${route} HTTP ${response.status}: ${raw.slice(0,4096) || response.statusText || "empty non-JSON response"}`); }
  if (!response.ok) throw new Error(`Template API ${route} HTTP ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

async function browser() {
  const executable = process.env.MOIRAI_CHROME ?? (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "/usr/bin/google-chrome");
  await fs.access(executable);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "moirai-template-render-"));
  const child = spawn(executable, ["--headless=new", "--window-size=1440,1000", "--remote-debugging-port=0", `--user-data-dir=${directory}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let failure;
  child.on("error", (error) => { failure = error; });
  const close = async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      for (let i=0;i<50&&child.exitCode===null;i++) await pause(100);
      if(child.exitCode===null) child.kill("SIGKILL");
    }
    await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});
  };
  for (let i=0;i<100;i++) {
    if(failure||child.exitCode!==null){await close();throw failure??new Error("Chrome stopped during startup");}
    try {
      const port=Number((await fs.readFile(path.join(directory,"DevToolsActivePort"),"utf8")).split("\n")[0]);
      if(port>0)return {port,close};
    } catch {}
    await pause(100);
  }
  await close();throw new Error("Chrome debugging endpoint did not start");
}

async function main() {
  const [flag,value]=process.argv.slice(2);
  if(!["--batch","--manifest","--designs","--worker-batch"].includes(flag)||!value)throw new Error("Usage: bun apps/mcp/src/template-production.mjs --batch ID | --manifest /absolute/path.json | --designs /absolute/path.json");
  const batchId=flag==="--designs"?(await produceTemplates({request:JSON.parse(await fs.readFile(value,"utf8")),base})).id:flag==="--manifest"?(await api("/production",JSON.parse(await fs.readFile(value,"utf8")))).id:value;
  if(!/^[a-zA-Z0-9_-]+$/.test(batchId))throw new Error("Invalid batch ID");
  if(flag!=="--worker-batch") {
    await api(`/production/${batchId}/execute`,{});
    console.log(JSON.stringify({batchId,status:"dispatched"}));
    let previous;
    for(;;){
      const current=await api(`/production/${batchId}`);
      const progress=JSON.stringify({batchId,summary:current.summary,renderJob:current.renderJob});
      if(progress!==previous){console.log(progress);previous=progress;}
      if(!["queued","running"].includes(current.renderJob?.status)){
        if(current.renderJob?.status!=="succeeded"||current.summary.failed||current.summary.renderReady)process.exitCode=1;
        return;
      }
      await pause(1500);
    }
  }
  if(process.env.MOIRAI_TEMPLATE_WORKER!=="1"||!fstatSync(0).isFile())throw new Error("Worker requires the native renderer lock");
  console.log(JSON.stringify({batchId,status:"waiting_for_compilation"}));
  let batch;
  for(;;){
    batch=await api(`/production/${batchId}`);
    if(batch.cancelled){console.log(JSON.stringify({batchId,status:"cancelled"}));return;}
    if(!["queued","running"].includes(batch.job.status))break;
    await pause(1500);
  }
  if(batch.job.status==="failed")throw new Error(batch.job.error??"Compilation worker failed");
  if(!batch.items.some(i=>i.status==="render_ready")){console.log(JSON.stringify(batch.summary));if(batch.summary.failed)process.exitCode=1;return;}
  const chrome=await browser();
  const client=new Client({name:"template-production-renderer",version:"1"});
  const call=(name,args)=>callRendererTool(client,name,args,{
    onReadinessRetry: update => console.log(JSON.stringify({batchId,status:"waiting_for_editor",...update})),
  });
  const failures=[];
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,"apps/mcp/src/server.mjs")],cwd:root,env:{...process.env,OPENCUT_BASE_URL:base,OPENCUT_CDP_PORT:String(chrome.port)}}));
    for(const summary of batch.items){
      if(summary.status!=="render_ready")continue;
      if((await api(`/production/${batchId}`)).cancelled)break;
      const route=`/production/${batchId}/items/${summary.index}`;
      let item=await api(route);const previews=[];
      try {
        for(const fixture of item.output.fixtures){
          const request=fixture.request;
          const projectId=request.document.metadata.id;
          let state=item.renders?.[String(fixture.index)];
          const progress=async(update)=>{
            item=await api(route+"/render",{baseRevision:item.revision,fixture:fixture.index,requestFingerprint:fixture.requestFingerprint,jobId:update.jobId,status:update.status,path:update.path??null,error:update.error??null,...(update.textMeasurements?{textMeasurements:update.textMeasurements}:{})});
            return item.renders[String(fixture.index)];
          };
          if(state?.status==="completed"){
            try{await fs.access(state.path);previews.push({fixture:fixture.index,requestFingerprint:fixture.requestFingerprint,path:state.path});continue;}catch{}
          }
          const document=await readProject({projectId,base});
          if(!document.metadata.name.startsWith("Template Production /"))throw new Error("Preview project ownership changed");
          // The compiler's receipt validates already applied instances after a resumed run.
          const compilation=await api("/compile",{...request,document});
          // Keep the native fixture identities: a fresh compile allocates new IDs.
          if(!compilation.deduplicated)await writeProject({projectId,document:productionCompilationDocument(fixture,compilation),baseRevision:request.baseRevision,base});
          const current=await readProject({projectId,base});
          try {
            await call("open_editor",{projectId});
            await call("wait_for_sync",{projectId,revision:current.revision,timeoutSeconds:60});
            let job=state?.status==="running"?await call("get_export",{projectId,jobId:state.jobId}):null;
            if(!job||["failed","cancelled"].includes(job.status)){
              job=await call("start_export",{projectId,format:"mp4",quality:"high",includeAudio:true,name:`${batchId}-${summary.index}-${fixture.index}`});
              state=await progress({jobId:job.jobId,status:"running"});
            }
            console.log(JSON.stringify({batchId,item:summary.index,fixture:fixture.index,jobId:job.jobId,status:"rendering"}));
            let reported=-1;
            while(job.status==="running"){
              await pause(1500);
              job=await call("get_export",{projectId,jobId:job.jobId});
              if(!job)throw new Error("Render job disappeared from browser; rerun batch to resume");
              const percent=Math.floor(job.progress*10)*10;
              if(percent!==reported){console.log(JSON.stringify({item:summary.index,fixture:fixture.index,progress:percent}));reported=percent;}
              if((await api(`/production/${batchId}`)).cancelled){await call("cancel_export",{projectId,jobId:job.jobId});throw new Error("Production cancelled");}
            }
            if(job.status!=="completed"||!job.stable||!job.path){await progress({jobId:job.jobId,status:"failed",error:job.error??"unstable or incomplete export"});throw new Error(job.error??"Render did not complete stably");}
            if(fixture.textMeasurementContractVersion!==1)console.log(JSON.stringify({batchId,item:summary.index,fixture:fixture.index,textMeasurementStatus:"not_measured",reason:"legacy fixture predates the measurement identity contract"}));
            await progress({jobId:job.jobId,status:"completed",path:job.path,...productionMeasurementAttachment(fixture,job)});
            previews.push({fixture:fixture.index,requestFingerprint:fixture.requestFingerprint,path:job.path});
          }catch(error){
            await progress({jobId:state?.jobId??`setup-${fixture.index}`,status:"failed",error:String(error.message??error)}).catch(()=>{});
            throw error;
          }finally{await call("close_editor",{projectId}).catch(()=>{});}
        }
        item=await api(route);
        const published=await api(route+"/publish",{baseRevision:item.revision,previews});
        console.log(JSON.stringify({batchId,item:summary.index,templateId:published.templateId,status:published.status,previews:published.previews}));
      }catch(error){failures.push({index:summary.index,error:String(error.message??error)});console.error(JSON.stringify(failures.at(-1)));}
    }
  }finally{await client.close().catch(()=>{});await chrome.close();}
  const result=await api(`/production/${batchId}`);
  console.log(JSON.stringify({batchId,summary:result.summary,failures}));
  if(failures.length||result.summary.failed||result.summary.renderReady)process.exitCode=1;
}
main().catch(error=>{console.error(String(error.stack??error));process.exitCode=1;});
