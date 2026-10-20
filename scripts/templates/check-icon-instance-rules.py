from pathlib import Path
import json,urllib.request,subprocess,hashlib,shutil,io
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/icon-instance-rules-20260929');BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def walk(es):
 for e in es:
  yield e
  for t in e.get('renderGroup',{}).get('tracks',[]):yield from walk(t['elements'])
def flat(tracks):return list(walk([e for t in tracks for e in t['elements']]))
def canonical(v):
 if isinstance(v,dict):return {k:canonical(x) for k,x in v.items() if k!='id'}
 if isinstance(v,list):return [canonical(x) for x in v]
 return v
def equivalent(a,b):
 if isinstance(a,dict) and isinstance(b,dict):return a.keys()==b.keys() and all(equivalent(a[k],b[k]) for k in a)
 if isinstance(a,list) and isinstance(b,list):return len(a)==len(b) and all(equivalent(x,y) for x,y in zip(a,b))
 if isinstance(a,(int,float)) and isinstance(b,(int,float)) and not isinstance(a,bool) and not isinstance(b,bool):return abs(a-b)<=4*2.220446049250313e-16*max(1,abs(a),abs(b))
 return a==b
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(p):return hashlib.sha256(subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-ac','2','-ar','16000','-f','s16le','-'])).hexdigest()
reports=[]
for submission in json.load(open(P/'submissions.json')):
 batch=api('/production/'+submission['batchId']);assert batch['renderJob']['status']=='succeeded'
 for index,key in enumerate(['growth','completion','clock']):
  item=api('/production/'+submission['batchId']+'/items/'+str(index));assert item['status']=='published';(P/f'{key}-{submission["batchId"]}.json').write_text(json.dumps(item,indent=2))
  for j,n in enumerate(submission['sourceFixtures']):
   fixture=item['output']['fixtures'][j];elements=flat(fixture['compilation']['document']['scenes'][0]['tracks']['overlay']);controllers=[e for e in elements if e.get('renderGroup')];children=[e for e in elements if e['params'].get('template.elementId')]
   old=json.load(open(P/f'{key}-before-preview-{n}.json'));original=[e for e in flat(old['tracks']['overlay']) if e['params'].get('template.elementId')]
   assert len(controllers)==[3,4,4][n]
   assert len(children)==len(original)
   for a,b in zip(sorted(original,key=lambda e:e['params']['template.instanceId']),sorted(children,key=lambda e:e['params']['template.instanceId'])):
    assert (a['startTime'],a['duration'])==(b['startTime'],b['duration'])
    assert equivalent(canonical(a['animations']),canonical(b['animations']))
    assert equivalent({k:v for k,v in a['params'].items() if k not in ['template.requestHash','template.applicationKey']},{k:v for k,v in b['params'].items() if k not in ['template.requestHash','template.applicationKey']})
   for c in controllers:
    keys=c['animations']['opacity']['keys'];assert keys[-1]['value']==0
    last=next(k for k in reversed(keys) if k['value']==1);assert c['duration']-last['time']==7200
   preview=next(v for v in item['previews'] if v['fixture']==j);assert preview['decodeVerified'] and preview['audioQuality']['validated'];src=Path(preview['path']);assert hashlib.sha256(src.read_bytes()).hexdigest()==preview['sha256'];out=P/f'{key}-{n}.mp4';shutil.copy2(src,out)
   assert pcm(out)==pcm(Path('/Users/zhengwei/Downloads/placement-advice-20260929')/f'after-{n}.mp4')
   # Every event at entry, hold and exit, plus a continuous shortest-event frame sequence.
   sheet=Image.new('RGB',(960,len(controllers)*205),'#17212a');d=ImageDraw.Draw(sheet)
   for row,c in enumerate(sorted(controllers,key=lambda c:c['startTime'])):
    start=c['startTime']/120000;duration=c['duration']/120000
    for col,(label,t) in enumerate([('entry',start+.04),('hold',start+duration/2),('exit',start+duration-.03)]):
     im=frame(out,t);im.thumbnail((320,180));sheet.paste(im,(col*320,row*205+25));d.text((col*320+5,row*205+4),f'{label} {t:.3f}s',fill='white')
   sheet.save(P/f'{key}-{n}.jpg')
   c=min(controllers,key=lambda c:c['duration']);first=max(0,int(c['startTime']/4000)-2);last=int((c['startTime']+c['duration'])/4000)+3
   advice=json.load(open(P/f'{key}-advice-{n}.json'));transform=advice['application']['transform'];crop_x=round(transform['centerX']*1280-180);crop_y=round(transform['centerY']*720-150)
   subprocess.run([FF,'-v','error','-y','-i',str(out),'-vf',f"select=between(n\\,{first}\\,{last}),crop=360:300:{crop_x}:{crop_y},scale=300:-1,tile=5x{(last-first+5)//5}",'-frames:v','1',str(P/f'{key}-shortest-{n}.jpg')],check=True)
   reports.append({'key':key,'sourceFixture':n,'independentOccurrences':len(controllers),'allExitsSeconds':.06,'childVisualsAndTimesUnchanged':True,'audioPcmPreserved':True,'projectId':next(p['projectId'] for p in item['fixtureProjects'] if p['fixture']==j)})
for a in json.load(open(P/'assets.json')):assert api('/dynamic-assets/'+a['id'])['definition']==json.load(open(P/f'{a["key"]}-saved.json'))
(P/'verification.json').write_text(json.dumps({'passed':True,'reports':reports,'listened':False},indent=2));print(json.dumps(reports))
