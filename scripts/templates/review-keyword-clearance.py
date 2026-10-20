"""Review a placement-only experiment across each keyword's full measured hold."""
import hashlib,json,subprocess,urllib.request,shutil
from pathlib import Path
from PIL import Image,ImageDraw
r=Path('/Users/zhengwei/Downloads/keyword-top-clearance-20260929')
prior=Path('/Users/zhengwei/Downloads/keyword-semantic-end-20260929')
base='http://127.0.0.1:3000/api/footage/templates'
batch=json.load(urllib.request.urlopen(base+'/production/'+json.loads((r/'submission.json').read_text())['id']))
assert batch['renderJob']['status']=='succeeded',batch['renderJob']
item=json.load(urllib.request.urlopen(base+'/production/'+batch['id']+'/items/0'))
old=json.loads((prior/'item-0.json').read_text())
(r/'batch.json').write_text(json.dumps(batch,indent=2));(r/'item-0.json').write_text(json.dumps(item,indent=2))
def elements(f):return [e for s in f['compilation']['document']['scenes'] for t in s['tracks']['overlay'] for e in t['elements']]
def without_identity(x):
 if isinstance(x,dict):return {k:without_identity(v) for k,v in x.items() if k not in ('id','name','template.requestHash','template.applicationKey')}
 if isinstance(x,list):return [without_identity(v) for v in x]
 return x
records=[]
for preview in batch['items'][0]['previews']:
 f=preview['fixture'];video=Path(preview['path']);assert preview['decodeVerified'] and preview['audioQuality']['validated'];assert hashlib.sha256(video.read_bytes()).hexdigest()==preview['sha256'];shutil.copy2(video,r/f'preview-{f}.mp4')
 before=elements(old['output']['fixtures'][f]);after=elements(item['output']['fixtures'][f]);assert len(before)==len(after)
 for a,b in zip(before,after):
  a=without_identity(a);b=without_identity(b)
  if b['params'].get('template.elementId')!='emphasis--headline':assert a==b;continue
  # A placement-only change must retain every compiled property except vertical position.
  assert a['params']['transform.positionY']!=b['params']['transform.positionY']
  expected=json.loads(json.dumps(b))
  for key in ('transform.positionY',):expected['params'][key]=a['params'][key]
  assert expected==a,(a,b)
  start=b['startTime']/120000;end=start+b['duration']/120000
  times=[];t=start
  while t<end:
   times.append(round(t,6));t+=.2
  if end-start>.02:times.append(round(end-.02,6))
  times=sorted(set(times));rows=(len(times)+3)//4;sheet=Image.new('RGB',(1280,rows*205),'#17212b');draw=ImageDraw.Draw(sheet);i=len(records)
  for j,t in enumerate(times):
   frame=r/f'event-{i}-frame-{j}.png'
   subprocess.run(['/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg','-v','error','-y','-ss',str(t),'-i',str(video),'-frames:v','1','-vf','scale=320:180',str(frame)],check=True)
   x=(j%4)*320;y=(j//4)*205;draw.text((x+5,y+3),f'{t:.3f}s',fill='white');sheet.paste(Image.open(frame),(x,y+25))
  path=r/f'event-{i}.jpg';sheet.save(path,quality=95);records.append({'fixture':f,'text':b['params']['content'],'start':start,'end':end,'times':times,'image':path.name})
(r/'clearance-inspection.json').write_text(json.dumps({'technicalVerified':True,'onlyVerticalPlacementChanged':True,'sampleIntervalSeconds':.2,'events':records,'visuallyInspected':False,'listened':False,'score':None},indent=2));print('Verified and sampled',len(records),'keyword holds')
