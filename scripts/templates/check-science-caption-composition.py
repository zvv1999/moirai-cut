from pathlib import Path
import os,json,urllib.request,subprocess,hashlib,shutil,io,html
from PIL import Image,ImageDraw
P=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/science-caption-composition-20260929'));BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(p):return hashlib.sha256(subprocess.check_output([FF,'-v','error','-i',str(p),'-map','0:a:0','-f','s16le','-'])).hexdigest()
def flat(ts):
 out=[]
 for t in ts:
  for e in t['elements']:
   out.append(e);out+=flat(e.get('renderGroup',{}).get('tracks',[]))
 return out
batch=api('/production/'+json.load(open(P/'submission.json'))['id']);assert batch['renderJob']['status']=='succeeded',batch['renderJob'];item=api('/production/'+batch['id']+'/items/0');assert item['status']=='published';(P/'item.json').write_text(json.dumps(item,indent=2));reports=[];sections=[]
for n,f in enumerate(item['output']['fixtures']):
 es=flat(f['compilation']['document']['scenes'][0]['tracks']['overlay']);groups=[e for e in es if e.get('renderGroup')];assert len(groups)==[0,1,2][n]
 captions=sorted([e for e in es if e.get('params',{}).get('template.elementId')=='headline'],key=lambda e:e['startTime']);cues=f['compilation']['plan']['captions'];assert len(captions)==len(cues)
 for e,c in zip(captions,cues):
  assert e['params']['content']==c['text'];assert abs(e['startTime']/120000-c['start'])<1/120000;assert abs((e['startTime']+e['duration'])/120000-c['end'])<1/120000
  assert e['params'].get('text.highlightEnabled') is True
  windows=json.loads(e['params']['text.wordTimings'])['windows'];keys=e['animations']['text.highlightRange']['keys']
  for w in windows:
   assert any(k['time']==w['startTime'] and json.loads(k['value']).get('start')==w['start'] and json.loads(k['value']).get('end')==w['end'] for k in keys if k['value'])
 expected=sum(len(s['captionSpans'])for s in [json.load(open(P/'manifest.json'))['samples'][n]])
 assert len(captions)==expected
 p=next(p for p in item['previews']if p['fixture']==n);assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/f'preview-{n}.mp4';shutil.copy2(p['path'],out);assert pcm(out)==pcm(Path('/Users/zhengwei/Downloads/placement-advice-20260929')/f'after-{n}.mp4')
 sheet=Image.new('RGB',(960,len(captions)*205),'#17212a');draw=ImageDraw.Draw(sheet)
 for row,e in enumerate(captions):
  start=e['startTime']/120000;end=(e['startTime']+e['duration'])/120000
  for col,t in enumerate([start+.06,(start+end)/2,end-.04]):
   im=frame(out,t);im.thumbnail((320,180));sheet.paste(im,(col*320,row*205+25));draw.text((col*320+5,row*205+5),f'{t:.3f}s',fill='white')
 sheet.save(P/f'captions-{n}.jpg',quality=95)
 for j,e in enumerate(groups):frame(out,(e['startTime']+e['duration']*.5)/120000).save(P/f'overlap-{n}-{j}.png')
 # Adjacent ASR boundaries verify active-word paint changes without line movement.
 words=f['request']['input']['words'];times=[max(0,w['start']+.03)for w in words[:min(9,len(words))]]
 seq=Image.new('RGB',(960,((len(times)+2)//3)*130),'#17212a');sd=ImageDraw.Draw(seq)
 for j,t in enumerate(times):
  im=frame(out,t).crop((0,540,1280,720));im.thumbnail((320,90));seq.paste(im,((j%3)*320,(j//3)*130+25));sd.text(((j%3)*320+5,(j//3)*130+5),f'{t:.3f}s',fill='white')
 seq.save(P/f'word-boundaries-{n}.jpg',quality=95)
 reports.append({'sample':n,'captions':len(captions),'globeOccurrences':len(groups),'measuredCaptionTimes':True,'pcmUnchanged':True,'sha256':p['sha256']})
 project=next(x['projectId'] for x in item['fixtureProjects'] if x['fixture']==n)
 sections.append(f'<section><h2>样例 {n+1} · {len(groups)} 次主题提示</h2><video controls preload="metadata" src="preview-{n}.mp4"></video><p><a href="http://127.0.0.1:3000/editor/{project}">打开可编辑成片</a></p><details><summary>字幕与逐词高亮检查</summary><img src="captions-{n}.jpg"><img src="word-boundaries-{n}.jpg"></details></section>')
(P/'verification.json').write_text(json.dumps({'passed':True,'reports':reports,'listened':False,'score':None},indent=2));print('PASS three full compositions')
(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>地球科普 · 完整字幕与主题动图</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}img,video{width:100%}section{margin:32px 0}</style><h1>地球科普 · 逐词讲述与经纬提示</h1><p>字幕跟随完整语音，图标仅出现在内容侧标注的地球词段。第一份不相关内容用来检查图标是否保持关闭。固定右上区域需在应用前检查，不自动识别人物或主题。候选待审，未试听，不代表90分验收。</p><p><a href="http://127.0.0.1:3000/templates/compositions?template=composition-science-caption-20260929">打开候选模板</a> · <a href="agent-content.json">下载试映内容标注</a></p>'+''.join(sections)+'<script>document.addEventListener("play",e=>{for(const v of document.querySelectorAll("video"))if(v!==e.target)v.pause()},true)</script>')
manifest=json.load(open(P/'manifest.json'));template=manifest['designs'][0]['template']
p=P/'review.html';p.write_text(p.read_text().replace('composition-science-caption-20260929',template['id']).replace('地球科普 · 逐词讲述与经纬提示',html.escape(template['name'])))
(P/'agent-content.json').write_text(json.dumps({'version':1,'entries':[dict(s,layoutPhrases=s.get('layoutPhrases',[]))for s in manifest['samples']],'liveInputId':manifest['samples'][1]['inputId']},ensure_ascii=False,indent=2))
