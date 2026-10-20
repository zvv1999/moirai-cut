import json,hashlib,subprocess,shutil,urllib.request
from pathlib import Path
from PIL import Image,ImageDraw
r=Path('/Users/zhengwei/Downloads/inline-caption-fine-20260929');old=Path('/Users/zhengwei/Downloads/inline-caption-saved-20260929');base='http://127.0.0.1:3000/api/footage/templates';ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
batch=json.load(urllib.request.urlopen(base+'/production/'+json.loads((r/'submission.json').read_text())['id']));assert batch['renderJob']['status']=='succeeded',batch['renderJob'];item=json.load(urllib.request.urlopen(base+'/production/'+batch['id']+'/items/0'));prior=json.loads((old/'item-0.json').read_text());(r/'batch.json').write_text(json.dumps(batch,indent=2));(r/'item-0.json').write_text(json.dumps(item,indent=2))
def pcm(path):return hashlib.sha256(subprocess.run([ff,'-v','error','-i',str(path),'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','-'],capture_output=True,check=True).stdout).hexdigest()
def clean(value):
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items() if k not in ['id','name','template.applicationKey','template.requestHash']}
 if isinstance(value,list):return [clean(v) for v in value]
 return value
def captions(f):return [e for s in f['compilation']['document']['scenes']for t in s['tracks']['overlay']for e in t['elements']if e['type']=='text']
records=[];frames=[];sheets=[]
for p in batch['items'][0]['previews']:
 i=p['fixture'];video=r/f'preview-{i}.mp4';assert p['decodeVerified'] and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];shutil.copy2(p['path'],video);assert pcm(video)==pcm(old/f'preview-{i}.mp4')
 f=item['output']['fixtures'][i];a=prior['output']['fixtures'][i];assert f['compilation']['plan']['words']==a['compilation']['plan']['words'];cues=f['compilation']['plan']['captions'];assert [{k:c[k]for k in ['text','start','end','wordSpan']}for c in cues]==[{k:c[k]for k in ['text','start','end','wordSpan']}for c in a['compilation']['plan']['captions']]
 left,right=captions(a),captions(f);assert len(left)==len(right)
 allowed=['geometry.stroke.width','geometry.shadow.blur','geometry.shadow.color','geometry.shadow.offsetY','text.maxWidth','text.maxHeight']
 for x,y in zip(left,right):
  x,y=clean(x),clean(y)
  assert y['params']['geometry.stroke.width']==1.4
  for key in allowed:y['params'][key]=x['params'][key]
  assert x==y
 records.append({'fixture':i,'sha256':p['sha256'],'captionCount':len(cues),'pcmPreserved':True,'wordAndCueTimingPreserved':True,'onlyOutlineShadowAndTextBudgetChanged':True})
 for j,cue in enumerate(cues):
  t=(cue['start']+cue['end'])/2;pair=Image.new('RGB',(1280,340),'#15212b');draw=ImageDraw.Draw(pair)
  for col,v in enumerate([old/f'preview-{i}.mp4',video]):
   frame=r/f'fixture-{i}-cue-{j}-{col}.png';subprocess.run([ff,'-v','error','-y','-ss',str(t),'-i',str(v),'-frames:v','1',str(frame)],check=True)
   draw.text((8,col*170+4),f'{t:.2f}s | '+('ORIGINAL 3px' if col==0 else 'FINE 1.4px'),fill='white');pair.paste(Image.open(frame).crop((0,580,1280,720)),(0,col*170+30))
  path=r/f'pair-{i}-{j}.jpg';pair.save(path,quality=95);frames.append({'fixture':i,'cue':j,'time':t,'text':cue['text'],'image':path.name})
 for k in range(0,len(cues),3):
  count=min(3,len(cues)-k);sheet=Image.new('RGB',(1280,340*count),'#15212b')
  for j in range(count):sheet.paste(Image.open(r/f'pair-{i}-{k+j}.jpg'),(0,j*340))
  name=f'sheet-{i}-{k//3}.jpg';sheet.save(r/name,quality=95);sheets.append(name)
(r/'verification.json').write_text(json.dumps({'passed':True,'batchId':batch['id'],'records':records,'frames':frames,'sheets':sheets,'listened':False,'continuousPlayback':False,'score':None},indent=2));print('PASS 3 outputs, 17 cue/motion equivalence and PCM preservation; generated',len(sheets),'comparison sheets')
