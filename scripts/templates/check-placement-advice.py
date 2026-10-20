from pathlib import Path
import json,urllib.request,subprocess,hashlib,shutil,io
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/placement-advice-20260929');BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def walk(es):
 for e in es:
  yield e
  for t in e.get('renderGroup',{}).get('tracks',[]):yield from walk(t['elements'])
def leaves(f):return [e for e in walk([e for s in f['compilation']['document']['scenes'] for t in s['tracks']['overlay'] for e in t['elements']]) if e['params'].get('template.elementId')]
def frame(path,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(path),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(path):return hashlib.sha256(subprocess.check_output([FF,'-v','error','-i',str(path),'-vn','-ac','2','-ar','16000','-f','s16le','-'])).hexdigest()
def canonical(v):
 if isinstance(v,dict):return {k:canonical(x) for k,x in v.items() if k!='id'}
 if isinstance(v,list):return [canonical(x) for x in v]
 return v
old=api('/production/production-666b831eac99e9c654644673a618c782/items/1');reports=[]
for s in json.load(open(P/'submissions.json')):
 batch=api('/production/'+s['batchId']);assert batch['renderJob']['status']=='succeeded';item=api('/production/'+s['batchId']+'/items/0');assert item['status']=='published';(P/(s['batchId']+'.json')).write_text(json.dumps(item,indent=2))
 for j,n in enumerate(s['sourceFixtures']):
  a=old['output']['fixtures'][n];b=item['output']['fixtures'][j];assert {k:v for k,v in a['request']['input'].items() if k!='template'}=={k:v for k,v in b['request']['input'].items() if k!='template'}
  original={e['params']['template.instanceId']:e for e in leaves(a)};updated={e['params']['template.instanceId']:e for e in leaves(b)};assert original.keys()==updated.keys()
  record=json.load(open(P/f'fixture-{n}.json'));delta=(record['result']['application']['transform']['centerX']-.18)*1280
  for key,x in original.items():
   y=updated[key];assert (x['startTime'],x['duration'])==(y['startTime'],y['duration']);assert canonical(x['animations'])==canonical(y['animations'])
   for field in ['transform.scaleX','transform.scaleY','transform.positionY','fill','stroke','strokeWidth']:assert x['params'].get(field)==y['params'].get(field)
   assert abs(y['params']['transform.positionX']-x['params']['transform.positionX']-delta)<1e-6
  paths=[]
  for version,srcitem,index in [('before',old,n),('after',item,j)]:
   v=next(v for v in srcitem['previews'] if v['fixture']==index);assert v['decodeVerified'] and v['audioQuality']['validated'];path=Path(v['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==v['sha256'];dst=P/f'{version}-{n}.mp4';shutil.copy2(path,dst);paths.append(dst)
  assert pcm(paths[0])==pcm(paths[1]);events=[e for e in updated.values() if e['params']['template.elementId']=='backing'];events.sort(key=lambda e:e['startTime'])
  for phase in ['entry','hold','exit']:
   sheet=Image.new('RGB',(960,len(events)*295),'#17212a');d=ImageDraw.Draw(sheet)
   for k,e in enumerate(events):
    start=e['startTime']/120000;duration=e['duration']/120000;t=start+(.04 if phase=='entry' else duration/2 if phase=='hold' else duration-.02)
    for v,path in enumerate(paths):
     im=frame(path,t);im.thumbnail((480,270));sheet.paste(im,(v*480,k*295+25));d.text((v*480+6,k*295+5),('before' if v==0 else 'after')+f' {t:.3f}s',fill='white')
   sheet.save(P/f'{phase}-{n}.jpg')
  shortest=min(events,key=lambda e:e['duration']);first=max(0,int(shortest['startTime']/4000)-2);last=int((shortest['startTime']+shortest['duration'])/4000)+3
  subprocess.run([FF,'-v','error','-y','-i',str(paths[1]),'-vf',f"select=between(n\\,{first}\\,{last}),crop=1280:360:0:0,scale=480:-1,tile=6x{(last-first+6)//6}",'-frames:v','1',str(P/f'shortest-{n}.jpg')],check=True)
  reports.append({'fixture':n,'selectedId':record['result']['selectedId'],'eventCount':len(events),'horizontalShiftPixels':delta,'timingSizeMotionAudioPreserved':True,'batchId':s['batchId'],'projectId':item['fixtureProjects'][j]['projectId']})
assert api('/dynamic-assets/style-study-20260928-growth')['definition']==json.load(open('/Users/zhengwei/Downloads/growth-rule-20260929/saved.json'))
(P/'export-verification.json').write_text(json.dumps({'passed':True,'reports':reports,'listened':False},indent=2));print(reports)
