from pathlib import Path
import os,json,urllib.request,subprocess,hashlib,shutil,io,math
from PIL import Image,ImageDraw
P=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/globe-decoration-20260929'));BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(p):return hashlib.sha256(subprocess.check_output([FF,'-v','error','-i',str(p),'-map','0:a:0','-f','s16le','-'])).hexdigest()
batch=api('/production/'+json.load(open(P/'submission.json'))['id']);assert batch['renderJob']['status']=='succeeded',batch['renderJob'];item=api('/production/'+batch['id']+'/items/0');assert item['status']=='published';(P/'item.json').write_text(json.dumps(item,indent=2));saved=json.load(open(P/'definition.json'));assert api('/dynamic-assets/'+saved['id'])['definition']==saved
reports=[]
for n,f in enumerate(item['output']['fixtures']):
 req=f['request']['input'];words=req['words'];expected=[(words[u['keyword']['startWord']]['start'],words[u['keyword']['endWord']-1]['end'])for u in req['semanticUnits']if u['keyword']]
 es=[e for t in f['compilation']['document']['scenes'][0]['tracks']['overlay']for e in t['elements']];groups=sorted([e for e in es if e.get('renderGroup')],key=lambda e:e['startTime']);assert len(groups)==len(expected)==[1,2][n]
 for e,(start,end)in zip(groups,expected):
  assert abs(e['startTime']/120000-start)<1/120000;assert abs((e['startTime']+e['duration'])/120000-end)<1/120000
  children=[c for t in e['renderGroup']['tracks']for c in t['elements']];assert len(children)==6
  assert {c['params']['template.elementId']for c in children}=={'edge','ocean','rim','meridian','equator','glint'}
  ks=e['animations']['opacity']['keys'];assert ks[-1]['value']==0;assert e['duration']-next(k['time']for k in reversed(ks)if k['value']==1)==7200
 p=next(p for p in item['previews']if p['fixture']==n);assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/f'live-{n}.mp4';shutil.copy2(p['path'],out);assert pcm(out)==pcm(Path('/Users/zhengwei/Downloads/placement-advice-20260929')/f'after-{n+1}.mp4')
 sheet=Image.new('RGB',(960,205*len(groups)),'#17212a');draw=ImageDraw.Draw(sheet)
 for row,e in enumerate(groups):
  a=e['startTime']/120000;b=(e['startTime']+e['duration'])/120000
  for col,(label,t)in enumerate([('entry',a+.04),('hold',(a+b)/2),('exit',b-.03)]):
   im=frame(out,t);im.thumbnail((320,180));sheet.paste(im,(col*320,row*205+25));draw.text((col*320+5,row*205+5),f'{label} {t:.3f}',fill='white')
  frame(out,(a+b)/2).save(P/f'full-{n}-{row}.png')
 sheet.save(P/f'live-{n}.jpg',quality=95)
 e=min(groups,key=lambda e:e['duration']);a=e['startTime']/120000;b=(e['startTime']+e['duration'])/120000;times=[i/30 for i in range(math.floor(a*30),math.ceil(b*30)+2)]
 sheet=Image.new('RGB',(960,math.ceil(len(times)/4)*200),'#17212a');draw=ImageDraw.Draw(sheet)
 for k,t in enumerate(times):
  im=frame(out,t).crop((900,70,1210,370));im.thumbnail((240,175));sheet.paste(im,((k%4)*240,(k//4)*200+25));draw.text(((k%4)*240+5,(k//4)*200+5),f'{t:.3f}',fill='white')
 sheet.save(P/f'shortest-{n}.jpg',quality=95);reports.append({'source':n+1,'events':expected,'sixEditableLayersPerEvent':True,'unrelatedUnitsNoGlobe':True,'pcmUnchanged':True,'sha256':p['sha256']})
(P/'verification.json').write_text(json.dumps({'passed':True,'reports':reports,'score':None,'listened':False},indent=2));print('PASS two semantic applications, three occurrences')
(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>地球科普 · 经纬展开</title><style>body{max-width:1050px;margin:auto;padding:24px;background:#182129;color:#eee;font:16px system-ui}img,video{width:100%}section{margin:32px 0}</style><h1>地球科普 · 经纬展开</h1><p>6个可编辑图形层，经线展开、整体轻弹与独立退场。在两个已有科普片段的地球相关词段出现。示意图非地理地图，语义由Agent标注，保护区人工提供；未试听、未作90分验收。</p><a href="http://127.0.0.1:3000/templates?effect=style-study-20260929-globe">编辑动图样式</a>'+''.join(f'<section><h2>科普样例 {i+1}</h2><video controls preload="metadata" src="live-{i}.mp4"></video><details><summary>进退场与逐帧检查</summary><img src="live-{i}.jpg"><img src="shortest-{i}.jpg"></details></section>'for i in range(2))+'<script>document.addEventListener("play",e=>{for(const v of document.querySelectorAll("video"))if(v!==e.target)v.pause()},true)</script>')
