from pathlib import Path
import json,urllib.request,subprocess,hashlib,shutil,io,html
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/phrase-measured-matrix-20260929');BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def flat(tracks):
 out=[]
 for t in tracks:
  for e in t['elements']:
   out.append(e);out+=flat(e.get('renderGroup',{}).get('tracks',[]))
 return out
def clean(v):
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items() if k not in ['id','template.applicationKey','template.requestHash','text.layoutPhrases']}
 if isinstance(v,list):return [clean(x) for x in v]
 return v
def equivalent(a,b):
 if isinstance(a,dict) and isinstance(b,dict):return a.keys()==b.keys() and all(equivalent(a[k],b[k]) for k in a)
 if isinstance(a,list) and isinstance(b,list):return len(a)==len(b) and all(equivalent(x,y) for x,y in zip(a,b))
 if type(a)in(int,float) and type(b)in(int,float):return abs(a-b)<=4*2.220446049250313e-16*max(1,abs(a),abs(b))
 return a==b
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(p):return hashlib.sha256(subprocess.check_output([FF,'-v','error','-i',str(p),'-map','0:a:0','-f','s16le','-'])).hexdigest()
batch=api('/production/'+json.load(open(P/'submission.json'))['id']);assert batch['renderJob']['status']=='succeeded',batch['renderJob'];(P/'batch.json').write_text(json.dumps(batch,indent=2))
reports=[];sections=[];assets=json.load(open(P/'assets.json'));inputs=json.load(open(P/'inputs.json'))
for d in range(3):
 item=api('/production/'+batch['id']+'/items/'+str(d));assert item['status']=='published';(P/f'item-{d}.json').write_text(json.dumps(item,indent=2))
 assert api('/dynamic-assets/'+assets[d]['id'])['definition']==assets[d]
 for n,fixture in enumerate(item['output']['fixtures']):
  before=json.load(open(P/f'before-{d}-{n}.json'));tracks=fixture['compilation']['document']['scenes'][0]['tracks']['overlay']
  assert equivalent(clean(before['tracks']['overlay']),clean(tracks)),(d,n,'unexpected visual change')
  assert fixture['request']['input']['words']==inputs[n]['transcript']['words']
  es=flat(tracks);texts=[e for e in es if e.get('params',{}).get('content')]
  annotated=[e for e in texts if e['params'].get('text.layoutPhrases')];assert annotated
  preview=next(p for p in item['previews'] if p['fixture']==n);assert preview['decodeVerified'] and preview['audioQuality']['validated'];src=Path(preview['path']);assert hashlib.sha256(src.read_bytes()).hexdigest()==preview['sha256'];out=P/f'{d}-{n}.mp4';shutil.copy2(src,out)
  assert pcm(out)==pcm(Path('/Users/zhengwei/Downloads/caption-measured-chinese-20260929')/f'preview-0-{n}.mp4')
  # Unique content occurrences, including every keyword and shortest actual event.
  events=sorted({(e['startTime'],e['duration'],e['params']['content'])for e in texts})
  sheet=Image.new('RGB',(960,len(events)*205),'#17212a');draw=ImageDraw.Draw(sheet)
  for row,(start,duration,content) in enumerate(events):
   for col,(label,t) in enumerate([('entry',start/120000+.04),('hold',(start+duration*.5)/120000),('exit',(start+duration)/120000-.03)]):
    im=frame(out,t);im.thumbnail((320,180));sheet.paste(im,(col*320,row*205+25));draw.text((col*320+5,row*205+6),f'{label} {t:.3f}s',fill='white')
  sheet.save(P/f'{d}-{n}.jpg',quality=94)
  start,duration,_=min(events,key=lambda e:e[1]);times=[t/30 for t in range(int(start/120000*30),int((start+duration)/120000*30)+2)]
  seq=Image.new('RGB',(960,((len(times)+3)//4)*155),'#17212a');sd=ImageDraw.Draw(seq)
  for k,t in enumerate(times):
   im=frame(out,t);im.thumbnail((240,135));seq.paste(im,((k%4)*240,(k//4)*155+20));sd.text(((k%4)*240+4,(k//4)*155+3),f'{t:.3f}s',fill='white')
  seq.save(P/f'{d}-{n}-shortest.jpg',quality=94)
  reports.append({'style':assets[d]['id'],'revision':assets[d]['revision'],'fixture':n,'events':len(events),'onlyPhraseMetadataChanged':True,'audioPcmUnchanged':True,'annotatedLayers':len(annotated),'sha256':preview['sha256']})
  sections.append(f'<section><h2>{html.escape(assets[d]["name"])} · 样例 {n+1}</h2><video controls preload="metadata" src="{d}-{n}.mp4"></video><details><summary>全部事件与最短事件连续帧</summary><img src="{d}-{n}.jpg"><img src="{d}-{n}-shortest.jpg"></details></section>')
(P/'verification.json').write_text(json.dumps({'passed':True,'reports':reports,'listened':False,'score':None},ensure_ascii=False,indent=2))
(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>实测中文 · 跨样式短语</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#18181b;color:#eee;font:16px system-ui}video,img{width:100%}section{margin:32px 0}h2{font-size:20px}</style><h1>真实词时间下的中文短语排版</h1><p>两种语速的同稿配音与长旁白；黑色背景，仅验证文字与声音适配。不是实拍画面，不代表90分验收，未试听。</p>'+''.join(sections)+'<script>document.addEventListener("play",e=>{for(const v of document.querySelectorAll("video"))if(v!==e.target)v.pause()},true)</script>')
print('PASS',len(reports),'exports')
