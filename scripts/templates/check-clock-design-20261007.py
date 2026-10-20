from pathlib import Path
import json,urllib.request,subprocess,hashlib,math,shutil
import numpy as np
from PIL import Image,ImageDraw
R=Path('/Users/zhengwei/Downloads/clock-design-20261007');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
api=lambda p:json.load(urllib.request.urlopen('http://127.0.0.1:3000/api/footage/templates'+p))
write=lambda n,d:(R/n).write_text(json.dumps(d,ensure_ascii=False,indent=2))
sub=json.load(open(R/'submission.json'));batch=api('/production/'+sub['id']);write('batch.json',batch)
assert batch['renderJob']['status']=='succeeded',batch['renderJob']
items=[api('/production/'+sub['id']+'/items/'+str(n))for n in [0,1]]
for n,i in enumerate(items):assert i['status']=='published';write('item-'+str(n)+'.json',i)
saved=json.load(open(R/'saved.json'));assert api('/dynamic-assets/'+saved['id'])['definition']==saved
app=json.load(open(R/'application.json'));sources=json.load(open(R/'input-evidence.json'))
leafs={l['content']['element']['id']:l['content']['element']for l in saved['layers'] if l['content']['kind']=='element'}
assert len(leafs)==28
projection=json.load(open(R/'template.json'));actual=items[0]['output']['template']
def same(a,b):
 if isinstance(a,(float,int))and isinstance(b,(float,int)):return math.isclose(a,b,rel_tol=1e-13,abs_tol=1e-13)
 if isinstance(a,dict)and isinstance(b,dict):return a.keys()==b.keys()and all(same(a[k],b[k])for k in a)
 if isinstance(a,list)and isinstance(b,list):return len(a)==len(b)and all(same(x,y)for x,y in zip(a,b))
 return a==b
assert same({k:v for k,v in projection.items()if k not in ['id','revision']},{k:v for k,v in actual.items()if k not in ['id','revision']})
def value(e,prop,t):
 keys=e.get('animations',{}).get(prop,{}).get('keys',[])
 if not keys:return e['params'].get(prop,0)
 if t<=keys[0]['time']:return keys[0]['value']
 for a,b in zip(keys,keys[1:]):
  if t<=b['time']:return a['value']+(b['value']-a['value'])*(t-a['time'])/(b['time']-a['time'])
 return keys[-1]['value']
def frame(path,n):
 b=subprocess.check_output([FF,'-hide_banner','-loglevel','error','-i',str(path),'-vf',f'select=eq(n\\,{n})','-frames:v','1','-f','image2pipe','-vcodec','png','-threads','1','-'])
 import io
 return Image.open(io.BytesIO(b)).convert('RGB')
def pcm(path):return subprocess.check_output([FF,'-hide_banner','-loglevel','error','-i',str(path),'-map','0:a:0','-ar','48000','-ac','2','-f','s16le','-'])
report={'styleId':saved['id'],'revision':saved['revision'],'leafCount':28,'batchId':batch['id'],'exactApplicationProjection':True,'listened':False,'continuousPlaybackViewed':False,'score':None,'fixtures':[]}
for f,source in enumerate(sources):
 row={'fixture':f,'inputId':source['inputId'],'wordDuration':source['wordDuration'],'positive':source['keyword'] is not None}
 files=[]
 for n,item in enumerate(items):
  p=next(p for p in item['previews']if p['fixture']==f);sourcepath=Path(p['path']);assert hashlib.sha256(sourcepath.read_bytes()).hexdigest()==p['sha256'];dest=R/f'r{5 if n==0 else 4}-fixture-{f}.mp4';shutil.copyfile(sourcepath,dest);files.append(dest)
  fi=item['output']['fixtures'][f];inp=fi['request']['input'];raw=json.load(open(R/(source['inputId']+'.json')));assert inp['words']==raw['transcript']['words'];assert same(inp['semanticUnits'],[{'keyword':None,**unit} for unit in json.load(open(R/'samples.json'))[f]['semanticUnits']])
  if n==0:row['previewEvidence']=p
 doc=items[0]['output']['fixtures'][f]['compilation']['document'];write('compiled-fixture-'+str(f)+'.json',doc)
 overlays=doc['scenes'][0]['tracks']['overlay'];groups=[e for t in overlays for e in t['elements'] if e.get('renderGroup')]
 if row['positive']:
  assert len(groups)==1;g=groups[0];children={e['params']['template.elementId']:e for t in g['renderGroup']['tracks']for e in t['elements']};assert set(children)==set(leafs)
  assert abs(g['startTime']/120000-source['start'])<1e-9;assert abs(g['duration']/120000-source['wordDuration'])<1e-9
  assert all(e['duration']==g['duration'] for e in children.values())
  hub=children['hub'];pivot=np.array([hub['params']['transform.positionX'],hub['params']['transform.positionY']]);errors=[]
  for lid in ['hour','hour-tip','hour-highlight','minute','minute-tip','minute-highlight']:
   e=children[lid];region=leafs[lid]['region'];v=np.array([region['x']+region['width']/2-.5,region['y']+region['height']/2-.5])*720*app['transform']['scale']
   for t in np.linspace(0,.135*120000,541):
    a=math.radians(value(e,'transform.rotate',t));rotation=np.array([[math.cos(a),-math.sin(a)],[math.sin(a),math.cos(a)]])
    inferred=np.array([value(e,'transform.positionX',t),value(e,'transform.positionY',t)])-rotation@v;errors.append(float(np.linalg.norm(inferred-pivot)))
  row['maxPivotErrorPx']=max(errors);assert row['maxPivotErrorPx']<.5
  row['start']=source['start'];row['end']=source['end'];row['leafCount']=len(children);row['stableHoldSeconds']=source['wordDuration']-.135-.045
  # Every encoded frame through entry, hold, exit, plus two outside frames.
  a=max(0,math.floor(source['start']*30)-2);b=math.ceil(source['end']*30)+2;indices=list(range(a,b+1));cols=6;tw,th=300,275;sheet=Image.new('RGB',(cols*tw,math.ceil(len(indices)/cols)*th),'#15191d');draw=ImageDraw.Draw(sheet)
  for j,n in enumerate(indices):
   im=frame(files[0],n);roi=im.crop((920,35,1200,295));x=(j%cols)*tw;y=(j//cols)*th;sheet.paste(roi,(x+10,y+15));draw.text((x+12,y+2),f'frame {n} / {n/30:.3f}s',fill='white')
  sheet.save(R/f'fixture-{f}-motion-strip.jpg',quality=95);row['inspectedFrameNumbers']=indices
  hold=math.ceil((source['start']+.18)*30);comparison=Image.new('RGB',(1280,380),'#171b20');draw=ImageDraw.Draw(comparison)
  for n in [0,1]:
   im=frame(files[n],hold);im.save(R/f'r{5 if n==0 else 4}-fixture-{f}-hold.png');comparison.paste(im.resize((640,360)),(n*640,20));draw.text((n*640+10,4),f'r{5 if n==0 else 4} - exact same source frame {hold}',fill='white')
  comparison.save(R/f'fixture-{f}-compare.jpg',quality=95)
 else:
  assert not groups;assert not overlays;row['overlayCount']=0
  for n in [0,1]:frame(files[n],180).save(R/f'r{5 if n==0 else 4}-fixture-{f}-hold.png')
 oldpcm,newpcm=pcm(files[1]),pcm(files[0]);assert oldpcm==newpcm
 row['audioPcmIdenticalToR4']=True;row['pcmSha256']=hashlib.sha256(newpcm).hexdigest();row['pcmBytes']=len(newpcm)
 report['fixtures'].append(row)
# Black and white are two real native renders of the same frozen hold frame.
# Their difference checks background compositing; MP4 exports have no alpha channel.
black=np.asarray(Image.open(R/'saved-black.png').convert('RGB'),dtype=float);white=np.asarray(Image.open(R/'saved-white.png').convert('RGB'),dtype=float)
alpha=np.clip(1-(white-black).mean(axis=2)/255,0,1);outside=np.zeros(alpha.shape,dtype=bool);outside[:80,:]=True;outside[-65:,:]=True;outside[:,:75]=True;outside[:,-75:]=True
assert alpha[outside].max()==0
report['backgroundCompositing']={'method':'same-frame native black/white/checker renders, not an alpha-channel MP4 export','outerMarginMaxInferredAlpha':float(alpha[outside].max()),'fractionNontransparent':float((alpha>.01).mean()),'matteRectangleDetected':False}
write('verification.json',report)
sections=[]
for f,row in enumerate(report['fixtures']):
 sections.append(f'<section><h2>{f+1}. '+('时间语义 · '+str(round(row['wordDuration'],2))+'秒' if row['positive'] else '无时间语义负例')+f'</h2><div class="pair"><div><h3>r5 当前版本</h3><video controls preload="metadata" src="r5-fixture-{f}.mp4"></video></div><div><h3>r4 同源对照</h3><video controls preload="metadata" src="r4-fixture-{f}.mp4"></video></div></div>'+ (f'<img src="fixture-{f}-compare.jpg"><details><summary>30fps 入场、稳定及退场帧（含事件前后）</summary><img src="fixture-{f}-motion-strip.jpg"></details>'if row['positive']else'<p>显式无关键词：原生计划没有图标图层。此项不代表自动识别语义。</p>')+'</section>')
html='''<!doctype html><meta charset="utf-8"><title>时间提示 · 造型与动效对照</title><style>body{margin:36px auto;max-width:1340px;background:#11171d;color:#eaf0f4;font:16px/1.7 system-ui;padding:0 24px}h1{font-size:30px}section{margin:32px 0;padding:20px;background:#1b2530;border-radius:16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}video,img{width:100%;max-width:100%;border-radius:10px}summary{cursor:pointer}.proof{display:flex;gap:14px}.proof img{width:32%}a{color:#90c7f8}</style><h1>时间提示 · 原生造型与动效迭代</h1><p>同一素材 ID：style-study-20260929-clock，r4 → r5。11 → 28 个原生可编辑图层；属于同一时钟家族，不新增达标模板计数。</p><p>新增外壳厚度、窄高光、十二刻度、双针高光、铜轴心。约100ms整组入场，135ms指针运动，45ms整组退场。词时间与原声保持；无真实计时含义。</p><p>技术检查通过，未提交≥90审美评分；未试听、未连续视频观片。本页视频可自行播放。逐帧检查范围见每个样例与verification.json。</p><div class="proof"><img src="saved-black.png"><img src="saved-white.png"><img src="saved-checker.png"></div>'''+''.join(sections)+'''<p><a href="verification.json">验证数据</a> · <a href="application.json">本次应用</a> · <a href="saved.json">保存版定义</a> · <a href="input-evidence.json">语义与实测词时间</a></p><p>边界：当前16:9、一个真人背景和两个音频黑底正例；更小尺寸、竖屏、密集触发、更多复杂背景仍需独立验证。</p>'''
(R/'review.html').write_text(html)
print(json.dumps({'batch':batch['id'],'fixtures':len(report['fixtures']),'pivotMaxPx':max(x.get('maxPivotErrorPx',0)for x in report['fixtures']),'report':str(R/'review.html')},ensure_ascii=False))
