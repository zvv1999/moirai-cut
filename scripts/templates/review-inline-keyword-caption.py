import json,hashlib,subprocess,shutil,urllib.request
from pathlib import Path
from PIL import Image,ImageDraw
r=Path('/Users/zhengwei/Downloads/inline-keyword-caption-20260929');old=Path('/Users/zhengwei/Downloads/keyword-top-clearance-20260929');base='http://127.0.0.1:3000/api/footage/templates'
batch=json.load(urllib.request.urlopen(base+'/production/'+json.loads((r/'submission.json').read_text())['id']));assert batch['renderJob']['status']=='succeeded',batch['renderJob'];item=json.load(urllib.request.urlopen(base+'/production/'+batch['id']+'/items/0'));prior=json.loads((old/'item-0.json').read_text());events=json.loads((old/'clearance-inspection.json').read_text())['events'];(r/'batch.json').write_text(json.dumps(batch,indent=2));(r/'item-0.json').write_text(json.dumps(item,indent=2))
def captions(f):return [e for s in f['compilation']['document']['scenes'] for t in s['tracks']['overlay'] for e in t['elements'] if e['params'].get('template.elementId')=='headline']
records=[];count=0
for p in batch['items'][0]['previews']:
 f=p['fixture'];v=Path(p['path']);assert p['decodeVerified'] and p['audioQuality']['validated'];assert hashlib.sha256(v.read_bytes()).hexdigest()==p['sha256'];shutil.copy2(v,r/f'preview-{f}.mp4')
 a=captions(prior['output']['fixtures'][f]);b=captions(item['output']['fixtures'][f]);assert len(a)==len(b)
 for x,y in zip(a,b):
  for k in ['startTime','duration']:assert x[k]==y[k]
  for k in ['content','fontSize','text.maxWidth','text.maxHeight','transform.positionX','transform.positionY']:assert x['params'][k]==y['params'][k]
  count+=1
 for e in [e for e in events if e['fixture']==f]:
  t=(e['start']+e['end'])/2;i=len(records);canvas=Image.new('RGB',(1280,390),'#17212b');ImageDraw.Draw(canvas).text((8,6),f"{e['text']} | {t:.3f}s | LEFT separate keyword | RIGHT inline emphasis",fill='white')
  for col,video in enumerate([old/f'preview-{f}.mp4',v]):
   frame=r/f'frame-{i}-{col}.png';subprocess.run(['/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg','-v','error','-y','-ss',str(t),'-i',str(video),'-frames:v','1','-vf','scale=640:360',str(frame)],check=True);canvas.paste(Image.open(frame),(col*640,30))
  path=r/f'comparison-{i}.jpg';canvas.save(path,quality=95);records.append({'fixture':f,'keyword':e['text'],'time':t,'image':path.name})
(r/'inspection.json').write_text(json.dumps({'technicalVerified':True,'unchangedCaptionCount':count,'unchangedCaptionTextTimesGeometry':True,'comparisons':records,'visuallyInspected':False,'listened':False,'score':None},indent=2));print('Verified',count,'caption cues;',len(records),'same-time comparisons')
