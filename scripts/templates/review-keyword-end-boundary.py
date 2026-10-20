import json,subprocess,hashlib,shutil
from pathlib import Path
import urllib.request
from PIL import Image,ImageDraw
r=Path('/Users/zhengwei/Downloads/keyword-semantic-end-20260929');old=Path('/Users/zhengwei/Downloads/caption-keyword-corner-20260929')
base='http://127.0.0.1:3000/api/footage/templates'
batch=json.load(urllib.request.urlopen(base+'/production/'+json.loads((r/'submission.json').read_text())['id']))
assert batch['renderJob']['status']=='succeeded',batch['renderJob']
item=json.load(urllib.request.urlopen(base+'/production/'+batch['id']+'/items/0'));prior=json.loads((old/'item-0.json').read_text());previous_batch=json.loads((old/'batch.json').read_text());validation=json.loads((r/'validation.json').read_text())
(r/'batch.json').write_text(json.dumps(batch,indent=2));(r/'item-0.json').write_text(json.dumps(item,indent=2));records=[];checked=0
ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def elements(f):return [e for s in f['compilation']['document']['scenes'] for t in s['tracks']['overlay'] for e in t['elements']]
def scrub(x):
 if isinstance(x,dict):return {k:scrub(v)for k,v in x.items()if k!='id'}
 if isinstance(x,list):return [scrub(v)for v in x]
 return x
for preview in batch['items'][0]['previews']:
 f=preview['fixture'];video=Path(preview['path']);assert preview['decodeVerified'] and preview['audioQuality']['validated'];assert hashlib.sha256(video.read_bytes()).hexdigest()==preview['sha256'];shutil.copy2(video,r/f'preview-{f}.mp4')
 before=elements(prior['output']['fixtures'][f]);after=elements(item['output']['fixtures'][f]);assert len(before)==len(after)
 oldvideo=next(p['path']for p in previous_batch['items'][0]['previews']if p['fixture']==f)
 for a,b in zip(before,after):
  assert a['startTime']==b['startTime']
  assert {k:v for k,v in a['params'].items()if k not in ['template.requestHash','template.applicationKey']}=={k:v for k,v in b['params'].items()if k not in ['template.requestHash','template.applicationKey']}
  if a['params'].get('template.elementId')!='emphasis--headline':
   assert a['duration']==b['duration'] and scrub(a.get('animations'))==scrub(b.get('animations'));continue
  checked+=1
  plan=next(e for e in validation['samples'][f]['plan']['elements']if e['elementId']=='emphasis--headline' and abs(e['start']-b['startTime']/120000)<1e-6)
  assert abs((b['startTime']+b['duration'])/120000-plan['end'])<1/120000
  for channel in ['transform.scaleX','transform.scaleY']:assert scrub(a['animations'][channel]['keys'][:3])==scrub(b['animations'][channel]['keys'][:3])
  assert b['animations']['opacity']['keys'][-1]['time']==b['duration'];assert b['animations']['opacity']['keys'][-2]['time']==b['duration']-4800
  if a['duration']==b['duration']:continue
  oldend=(a['startTime']+a['duration'])/120000;newend=(b['startTime']+b['duration'])/120000
  videoend=validation['samples'][f]['plan']['durationSeconds']
  postend=newend+.08
  times=[min(oldend+.1,(oldend+newend)/2),newend-.02,postend if postend<videoend-.04 else None]
  canvas=Image.new('RGB',(1280,1170),'#182027');draw=ImageDraw.Draw(canvas);index=len(records)
  for row,time in enumerate(times):
   if time is None:
    draw.text((8,row*390+7),'Post-exit sample unavailable: event ends at the video boundary.',fill='white');continue
   draw.text((8,row*390+7),f"{b['params']['content']} | {time:.3f}s | LEFT word end | RIGHT semantic end",fill='white')
   for col,src in enumerate([oldvideo,str(video)]):
    out=r/f'frame-{index}-{row}-{col}.png';subprocess.run([ff,'-v','error','-y','-ss',str(time),'-i',src,'-frames:v','1','-vf','scale=640:360',str(out)],check=True);canvas.paste(Image.open(out),(col*640,row*390+30))
  out=r/f'hold-comparison-{index}.jpg';canvas.save(out,quality=95);records.append({'fixture':f,'text':b['params']['content'],'oldEnd':oldend,'newEnd':newend,'times':times,'postExitSampleAvailable':times[-1] is not None,'image':out.name})
(r/'inspection.json').write_text(json.dumps({'technicalVerified':True,'keywordEvents':checked,'excludedIdentityParams':['template.requestHash','template.applicationKey'],'unchangedCaptionParamsAndAnimations':True,'popTimingPreserved':True,'exitFadeSeconds':.04,'extended':records,'visuallyInspected':False,'listened':False,'score':None},indent=2));print('Verified',checked,'keyword events; generated',len(records),'same-time comparisons')
