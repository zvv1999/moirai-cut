import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = 'http://127.0.0.1:3000';
const scenario = process.env.SELECTION_SCENARIO ?? 'rotated';
assert.ok(['rotated','scaled','chain'].includes(scenario));
async function api(path, body) {
	const response = await fetch(base + '/api/footage/templates' + path, body ? {
		method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'moirai-footage' }, body: JSON.stringify(body),
	} : {});
	const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
}
const { definition } = await api('/dynamic-assets/create', { name: '测量选中验证 ' + randomUUID(), canvas: { width: 720, height: 720, fps: 30 } });
const first = definition.layers.find(layer => layer.content.kind === 'element');
first.content.element.region = { x: 0.1, y: 0.2, width: 0.8, height: 0.2 };
const second = structuredClone(first);
Object.assign(second.content.element, { id: 'selection-secondary', description: '副文字', styleId: 'secondary-style', region: { x: 0.1, y: 0.65, width: 0.8, height: 0.2 } });
second.content.element.motions = [{ property: 'rotation', keys: [{ time: 0, value: 25, easing: 'linear' }, { time: 1, value: 25, easing: 'linear' }] }];
if(scenario!=='rotated')for(const [property,value] of [['scale_x',1.3],['scale_y',0.7]])second.content.element.motions.push({property,keys:[{time:0,value,easing:'linear'},{time:1,value,easing:'linear'}]});
definition.layers.push(second);
definition.styles.push({ ...structuredClone(definition.styles[0]), id: 'secondary-style', fontSize: 40 });
definition.inputs.push({ id: 'secondary-text', label: '副文字', default: '点击我', maxCharacters: 20, layerIds: ['selection-secondary'] });
const badge = structuredClone(second);
Object.assign(badge.content.element, { id: 'selection-badge', description: '依附装饰', styleId: 'badge-style', motions: [], region: { x: 0.8, y: 0.65, width: 0.04, height: 0.04 } });
badge.content.element.features.representation = 'rectangle';
definition.layers.push(badge);
definition.styles.push({ ...structuredClone(definition.styles[0]), id: 'badge-style', fill: '#FF0000', background: null, strokeWidth: 0 });
definition.spatialRelations = [{ elementId: 'selection-badge', relativeTo: 'selection-secondary', placement: 'right', referenceBounds: 'text_box', gap: 0.02, offsetX: 0, offsetY: 0, followMotion: true }];
if(scenario==='chain') {
	first.content.element.motions=[{property:'rotation',keys:[{time:0,value:-15,easing:'linear'},{time:1,value:-15,easing:'linear'}]}];
	definition.spatialRelations.push({elementId:'selection-secondary',relativeTo:first.content.element.id,placement:'below',referenceBounds:'text_box',gap:0.2,offsetX:0,offsetY:0,followMotion:true});
}
await api('/dynamic-assets', { definition, baseRevision: 0, idempotencyKey: randomUUID() });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
	page.setDefaultTimeout(30000);
	await page.goto(base + '/templates');
	await page.getByRole('button', { name: new RegExp(definition.name) }).click();
	await page.getByRole('button', { name: '编辑布局区域', exact: true }).click();
	const secondary = page.locator('polygon[data-measured-layer-id="selection-secondary"]');
	await secondary.waitFor({ state: 'visible' });
	assert.equal(await secondary.evaluate(element => {
		const box = element.getBoundingClientRect();
		return document.elementFromPoint(box.left + 1, box.top + 1) === element;
	}), false, 'rotated bounding-box corner must not hit the polygon');
	await secondary.click();
	assert.equal(await secondary.getAttribute('aria-pressed'), 'true');
	assert.equal(await page.getByRole('spinbutton', { name: '字号', exact: true }).inputValue(), '40');
	const primary = page.locator(`polygon[data-measured-layer-id="${first.content.element.id}"]`);
	await primary.focus(); await primary.press('Enter');
	assert.equal(await primary.getAttribute('aria-pressed'), 'true');
	assert.equal(await secondary.getAttribute('aria-pressed'), 'false');
	// Seeking must discard the old selection surface until its frame is ready.
	const progress = page.getByRole('slider', { name: '效果预览进度' });
	await progress.fill('0.7');
	await page.waitForFunction(() => Number(document.querySelector('canvas[aria-label="效果实时画面"]')?.getAttribute('data-render-time')) === 0.7);
	await secondary.waitFor({ state: 'visible' });
	await secondary.focus(); await secondary.press('Space');
	assert.equal(await secondary.getAttribute('aria-pressed'), 'true');
	const decoration = page.locator('polygon[data-measured-layer-id="selection-badge"]');
	await decoration.waitFor({ state: 'visible' });
	assert.equal(await decoration.evaluate(element => {
		const points = [...element.points];
		const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
		const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
		const canvas = document.querySelector('canvas[aria-label="效果实时画面"]');
		const [r,g,b] = canvas.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data;
		return r > 200 && g < 50 && b < 50;
	}), true, 'decoration selection must cover the actual corrected red pixels');
	await decoration.click();
	assert.equal(await decoration.getAttribute('aria-pressed'), 'true');
	assert.equal(await secondary.getAttribute('aria-pressed'), 'false');
	const saved = (await api('/dynamic-assets')).assets.find(asset => asset.id === definition.id);
	assert.equal(saved.revision, 1, 'selection must not mutate the asset');
	const center=async locator=>{const box=await locator.boundingBox();assert.ok(box);return {x:box.x+box.width/2,y:box.y+box.height/2};};
	const before=await center(decoration);
	const generation=await page.locator('.tw-effect-stage').getAttribute('data-preview-generation');
	const moved=page.waitForResponse(response=>response.url().endsWith('/dynamic-assets/layers'));
	await page.mouse.move(before.x,before.y);await page.mouse.down();await page.mouse.move(before.x+20,before.y-12,{steps:5});await page.mouse.up();
	const response=await moved;assert.equal(response.status(),200,await response.text());
	const changed=await response.json();
	const relation=changed.definition.spatialRelations.find(r=>r.elementId==='selection-badge');
	assert.ok(Math.abs(relation.offsetX)>0.001&&Math.abs(relation.offsetY)>0.001,'drag edits relation offsets');
	assert.deepEqual(changed.definition.layers.find(l=>l.content.element?.id==='selection-badge').content.element.region,badge.content.element.region,'drag retains authored size/region');
	await page.waitForFunction(old=>document.querySelector('.tw-effect-stage')?.getAttribute('data-preview-generation')!==old,generation);
	await decoration.waitFor({state:'visible'});
	const after=await center(decoration);
	assert.ok(Math.abs(after.x-before.x-20)<1&&Math.abs(after.y-before.y+12)<1,JSON.stringify({before,after}));
	await page.mouse.move(after.x,after.y);await page.mouse.down();await page.mouse.move(after.x+15,after.y+10);await page.keyboard.press('Escape');await page.mouse.up();
	const cancelled=await center(decoration);
	assert.ok(Math.abs(cancelled.x-after.x)<0.01&&Math.abs(cancelled.y-after.y)<0.01,'Escape cancels temporary drag');
	await page.getByRole('button',{name:'保存修改',exact:true}).click();
	await page.waitForFunction(()=>document.querySelector('.tw-dynamic-meta span')?.textContent==='v2');
	const persisted=(await api('/dynamic-assets')).assets.find(asset=>asset.id===definition.id);
	assert.equal(persisted.spatialRelations.length,changed.definition.spatialRelations.length);
	for(let index=0;index<persisted.spatialRelations.length;index++) {
		const {offsetX,offsetY,...identity}=persisted.spatialRelations[index];
		const {offsetX:expectedX,offsetY:expectedY,...expectedIdentity}=changed.definition.spatialRelations[index];
		assert.deepEqual(identity,expectedIdentity);
		assert.ok(Math.abs(offsetX-expectedX)<1e-12&&Math.abs(offsetY-expectedY)<1e-12);
	}
	await page.reload();
	await page.getByRole('button', { name: new RegExp(definition.name) }).click();
	await page.getByRole('button', { name: '编辑布局区域', exact: true }).click();
	await progress.fill('0.7');
	await page.waitForFunction(() => Number(document.querySelector('canvas[aria-label="效果实时画面"]')?.getAttribute('data-render-time')) === 0.7);
	await decoration.waitFor({state:'visible'});
	const restored=await center(decoration);
	assert.ok(Math.abs(restored.x-after.x)<1&&Math.abs(restored.y-after.y)<1,'reload preserves dragged position');
	const beforeNudgeGeneration=await page.locator('.tw-effect-stage').getAttribute('data-preview-generation');
	const nudged=page.waitForResponse(response=>response.url().endsWith('/dynamic-assets/layers'));
	await decoration.focus();await decoration.press('Shift+ArrowRight');
	assert.equal((await nudged).status(),200);
	await page.waitForFunction(old=>document.querySelector('.tw-effect-stage')?.getAttribute('data-preview-generation')!==old,beforeNudgeGeneration);
	await decoration.waitFor({state:'visible'});
	const nudge=await center(decoration),stage=await page.locator('.tw-effect-stage').boundingBox();
	assert.ok(Math.abs(nudge.x-restored.x-10*stage.width/720)<1&&Math.abs(nudge.y-restored.y)<1,JSON.stringify({reason:'keyboard nudge uses canvas pixels',restored,nudge,stage}));
	// Discard the unsaved nudge in this isolated fixture, then independently hide
	// the parent. Its visible child must retain a valid movement reference.
	const hidden=structuredClone(persisted);
	hidden.layers.find(layer=>layer.content.element?.id==='selection-secondary').content.element.motions.push({property:'opacity',keys:[{time:0,value:0,easing:'linear'},{time:1,value:0,easing:'linear'}]});
	await api('/dynamic-assets',{definition:hidden,baseRevision:persisted.revision,idempotencyKey:randomUUID()});
	page.on('dialog',dialog=>dialog.accept());
	await page.reload();
	await page.getByRole('button',{name:new RegExp(definition.name)}).click();
	await page.getByRole('button',{name:'编辑布局区域',exact:true}).click();
	await progress.fill('0.7');
	await page.waitForFunction(() => Number(document.querySelector('canvas[aria-label="效果实时画面"]')?.getAttribute('data-render-time')) === 0.7);
	await decoration.waitFor({state:'visible'});
	assert.equal(await secondary.count(),0,'transparent parent has no selectable measured polygon');
	const hiddenStart=await center(decoration),hiddenGeneration=await page.locator('.tw-effect-stage').getAttribute('data-preview-generation');
	const hiddenMove=page.waitForResponse(response=>response.url().endsWith('/dynamic-assets/layers'));
	await page.mouse.move(hiddenStart.x,hiddenStart.y);await page.mouse.down();await page.mouse.move(hiddenStart.x-15,hiddenStart.y+8,{steps:5});await page.mouse.up();
	assert.equal((await hiddenMove).status(),200);
	await page.waitForFunction(old=>document.querySelector('.tw-effect-stage')?.getAttribute('data-preview-generation')!==old,hiddenGeneration);
	await decoration.waitFor({state:'visible'});
	const hiddenEnd=await center(decoration);
	assert.ok(Math.abs(hiddenEnd.x-hiddenStart.x+15)<1&&Math.abs(hiddenEnd.y-hiddenStart.y-8)<1,JSON.stringify({hiddenStart,hiddenEnd}));
	const scaleResults=[];
	const redBounds=()=>page.locator('canvas[aria-label="效果实时画面"]').evaluate(canvas=>{
		const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
		let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
		for(let i=0;i<pixels.length;i+=4)if(pixels[i]>200&&pixels[i+1]<50&&pixels[i+2]<50){const x=i/4%canvas.width,y=Math.floor(i/4/canvas.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
		return {width:right-left+1,height:bottom-top+1};
	});
	for(const [layerId,factor,axis] of [['selection-badge',1.5,null],[first.content.element.id,1.25,null],['selection-badge',1.4,'x'],['selection-badge',0.8,'y'],[first.content.element.id,0.9,'x'],[first.content.element.id,0.85,'y']]) {
		const polygon=page.locator(`polygon[data-measured-layer-id="${layerId}"]`);
		await polygon.click();
		const oldPoints=await polygon.evaluate(element=>[...element.points].map(p=>({x:p.x,y:p.y})));
		const oldPixels=layerId==='selection-badge'?await redBounds():null;
		const rect=await page.locator('.tw-effect-stage').boundingBox();
		const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
		const corner=axis==='x'?midpoint(oldPoints[1],oldPoints[2]):axis==='y'?midpoint(oldPoints[2],oldPoints[3]):oldPoints[2];
		const pivot=axis==='x'?midpoint(oldPoints[0],oldPoints[3]):axis==='y'?midpoint(oldPoints[0],oldPoints[1]):oldPoints[0];
		const start={x:rect.x+corner.x*rect.width/720,y:rect.y+corner.y*rect.height/720};
		const generation=await page.locator('.tw-effect-stage').getAttribute('data-preview-generation');
		const responsePromise=page.waitForResponse(response=>response.url().endsWith('/dynamic-assets/layers'));
		await page.mouse.move(start.x,start.y);await page.mouse.down();
		await page.mouse.move(start.x+(corner.x-pivot.x)*(factor-1)*rect.width/720,start.y+(corner.y-pivot.y)*(factor-1)*rect.height/720,{steps:5});
		await page.mouse.up();
		const response=await responsePromise;assert.equal(response.status(),200,await response.text());
		await page.waitForFunction(old=>document.querySelector('.tw-effect-stage')?.getAttribute('data-preview-generation')!==old,generation);
		await polygon.waitFor({state:'visible'});
		const points=await polygon.evaluate(element=>[...element.points].map(p=>({x:p.x,y:p.y})));
		const expected=oldPoints.map((point,index)=>{
			if(!axis)return {x:pivot.x+(point.x-pivot.x)*factor,y:pivot.y+(point.y-pivot.y)*factor};
			const active=axis==='x'?(index===1||index===2):index>=2;
			const vector=axis==='x'?{x:oldPoints[1].x-oldPoints[0].x,y:oldPoints[1].y-oldPoints[0].y}:{x:oldPoints[3].x-oldPoints[0].x,y:oldPoints[3].y-oldPoints[0].y};
			return {x:point.x+(active?vector.x*(factor-1):0),y:point.y+(active?vector.y*(factor-1):0)};
		});
		const maxError=Math.max(...points.map((point,index)=>Math.hypot(point.x-expected[index].x,point.y-expected[index].y)));
		assert.ok(maxError<1,JSON.stringify({layerId,factor,axis,oldPoints,points,maxError}));
		if(oldPixels){const pixels=await redBounds();assert.ok(oldPixels.width>5&&oldPixels.height>5);const width=Math.max(...expected.map(p=>p.x))-Math.min(...expected.map(p=>p.x)),height=Math.max(...expected.map(p=>p.y))-Math.min(...expected.map(p=>p.y));assert.ok(Math.abs(pixels.width-width)<=2&&Math.abs(pixels.height-height)<=2,JSON.stringify({pixels,width,height,factor,axis}));}
		scaleResults.push({layerId,factor,axis,maxError});
	}
	const geometry=()=>page.locator('polygon[data-measured-layer-id]').evaluateAll(elements=>elements.map(element=>({id:element.getAttribute('data-measured-layer-id'),points:[...element.points].map(p=>({x:p.x,y:p.y}))})));
	const beforeScaleSave=await geometry();
	await page.getByRole('button',{name:'保存修改',exact:true}).click();
	await page.waitForFunction(()=>document.querySelector('.tw-dynamic-meta span')?.textContent==='v4');
	await page.reload();await page.getByRole('button',{name:new RegExp(definition.name)}).click();
	await page.getByRole('button',{name:'编辑布局区域',exact:true}).click();
	await progress.fill('0.7');
	await page.waitForFunction(() => Number(document.querySelector('canvas[aria-label="效果实时画面"]')?.getAttribute('data-render-time')) === 0.7);
	await decoration.waitFor({state:'visible'});
	assert.deepEqual(await geometry(),beforeScaleSave,'saved scale and pivot correction survive reload');
	await decoration.click();
	const detachBefore=await decoration.evaluate(element=>[...element.points].map(p=>({x:p.x,y:p.y})));
	const detachPixels=await redBounds(),detachGeneration=await page.locator('.tw-effect-stage').getAttribute('data-preview-generation');
	const detachedResponse=page.waitForResponse(response=>response.url().endsWith('/dynamic-assets/layers'));
	await page.getByRole('button',{name:'解除依附并保持外观',exact:true}).click();
	const detachResult=await detachedResponse;assert.equal(detachResult.status(),200,await detachResult.text());
	const detached=await detachResult.json();
	assert.ok(!detached.definition.spatialRelations.some(relation=>relation.elementId==='selection-badge'));
	await page.waitForFunction(old=>document.querySelector('.tw-effect-stage')?.getAttribute('data-preview-generation')!==old,detachGeneration);
	await decoration.waitFor({state:'visible'});
	const detachAfter=await decoration.evaluate(element=>[...element.points].map(p=>({x:p.x,y:p.y})));
	const detachError=Math.max(...detachAfter.map((p,i)=>Math.hypot(p.x-detachBefore[i].x,p.y-detachBefore[i].y)));
	assert.ok(detachError<0.5,JSON.stringify({detachBefore,detachAfter,detachError}));
	const detachedPixels=await redBounds();assert.ok(Math.abs(detachedPixels.width-detachPixels.width)<=1&&Math.abs(detachedPixels.height-detachPixels.height)<=1);
	await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.tw-dynamic-meta span')?.textContent==='v5');
	await page.reload();await page.getByRole('button',{name:new RegExp(definition.name)}).click();
	await page.getByRole('button',{name:'编辑布局区域',exact:true}).click();await progress.fill('0.7');
	await page.waitForFunction(() => Number(document.querySelector('canvas[aria-label="效果实时画面"]')?.getAttribute('data-render-time')) === 0.7);
	await decoration.waitFor({state:'visible'});
	const detachReload=await decoration.evaluate(element=>[...element.points].map(p=>({x:p.x,y:p.y})));
	assert.deepEqual(detachReload,detachAfter,'detach correction survives reload');
	await primary.click();const parentGeneration=await page.locator('.tw-effect-stage').getAttribute('data-preview-generation');
	const parentMoved=page.waitForResponse(response=>response.url().endsWith('/dynamic-assets/layers'));
	await primary.press('Shift+ArrowRight');assert.equal((await parentMoved).status(),200);
	await page.waitForFunction(old=>document.querySelector('.tw-effect-stage')?.getAttribute('data-preview-generation')!==old,parentGeneration);
	await decoration.waitFor({state:'visible'});
	assert.deepEqual(await decoration.evaluate(element=>[...element.points].map(p=>({x:p.x,y:p.y}))),detachAfter,'former ancestor motion no longer moves detached decoration');
	await page.screenshot({ path: '/tmp/measured-text-selection.png', fullPage: true });
	console.log(JSON.stringify({ scenario, assetId: definition.id, drag:{before,after}, hiddenParentDrag:{hiddenStart,hiddenEnd}, scaleResults,detachError, passed: ['rotated polygon hit testing', 'rendered-region pointer selection', 'property-panel selection', 'Enter and Space selection', 'seek refresh', 'attached decoration pixel alignment and selection', 'selection does not mutate asset', 'rotated attachment drag edits offsets', 'Escape cancellation', 'save and reload persistence', 'Shift-arrow canvas-pixel nudge', 'visible child of transparent parent remains draggable', 'text and attached decoration scale about fixed opposite corner', 'scaled decoration pixel size', 'scale save/reload geometry', 'detach preserves current geometry and pixels', 'detach save/reload', 'detached decoration stops following former ancestor'] }));
	const library=await api('/dynamic-assets');
	const archiveAsset=library.assets.find(asset=>asset.id===definition.id);
	const entry=library.library?.find(entry=>entry.assetId===definition.id);
	await api('/dynamic-assets/archive',{assetId:definition.id,assetRevision:archiveAsset.revision,baseRevision:entry?.revision??0,archived:true});
} finally { await browser.close(); }
