import {execFileSync} from "node:child_process";
import {existsSync,readFileSync,writeFileSync} from "node:fs";
import {homedir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const executable=name=>{
  const local=path.join(homedir(),".cargo","bin",name+(process.platform==="win32"?".exe":""));
  return existsSync(local)?local:name;
};
const cargo=process.env.CARGO??executable("cargo"),bindgen=executable("wasm-bindgen");
const version=readFileSync(path.join(root,"Cargo.lock"),"utf8").match(/name = "wasm-bindgen"\s+version = "([^"]+)"/)?.[1];
if(!version)throw new Error("Cargo.lock does not contain wasm-bindgen");
let installed;
try {installed=execFileSync(bindgen,["--version"],{encoding:"utf8"}).trim().split(/\s+/)[1];}catch{}
if(installed!==version)throw new Error(`Install the matching renderer tool: cargo install wasm-bindgen-cli --version ${version} --locked`);
execFileSync(cargo,["build","--locked","-p","opencut-wasm","--target","wasm32-unknown-unknown","--release"],{cwd:root,stdio:"inherit"});
const metadata=JSON.parse(execFileSync(cargo,["metadata","--no-deps","--format-version","1"],{cwd:root,encoding:"utf8"}));
const pkg=metadata.packages.find(p=>p.name==="opencut-wasm");
const output=path.join(root,"rust","wasm","pkg");
execFileSync(bindgen,[path.join(metadata.target_directory,"wasm32-unknown-unknown","release","opencut_wasm.wasm"),"--target","bundler","--out-dir",output],{cwd:root,stdio:"inherit"});
writeFileSync(path.join(output,"package.json"),JSON.stringify({
  name:pkg.name,version:pkg.version,type:"module",description:pkg.description,license:pkg.license,
  main:"opencut_wasm.js",types:"opencut_wasm.d.ts",
  files:["opencut_wasm_bg.wasm","opencut_wasm.js","opencut_wasm_bg.js","opencut_wasm.d.ts"],
  sideEffects:["./opencut_wasm.js","./snippets/*"],
},null,2)+"\n");
console.log(`Built local Rust renderer: ${output}`);
