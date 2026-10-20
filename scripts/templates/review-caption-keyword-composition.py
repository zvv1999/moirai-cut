import json, urllib.request, hashlib, subprocess, os
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(os.environ.get('COMPOSITION_OUTPUT','/Users/zhengwei/Downloads/caption-keyword-composition-20260929'))
baseline_root=os.environ.get('COMPOSITION_BASELINE')
base='http://127.0.0.1:3000/api/footage/templates'
def api(path):return json.load(urllib.request.urlopen(base+path))
batch=api('/production/'+json.loads((root/'submission.json').read_text())['id'])
assert batch['renderJob']['status']=='succeeded',batch['renderJob']
(root/'batch.json').write_text(json.dumps(batch,indent=2))
results=[]
for i in range(len(batch["items"])):
 item=api('/production/'+batch['id']+'/items/'+str(i))
 (root/f'item-{i}.json').write_text(json.dumps(item,indent=2))
 for preview in batch['items'][i]['previews']:
  source=Path(preview['path']);assert preview['decodeVerified'] and preview['audioQuality']['validated']
  assert hashlib.sha256(source.read_bytes()).hexdigest()==preview['sha256']
  fixture=preview['fixture'];doc=item['output']['fixtures'][fixture]['compilation']['document']
  elements=[e for s in doc['scenes'] for t in s['tracks']['overlay'] for e in t['elements']]
  words=[e for e in elements if e.get('params',{}).get('template.elementId')=='emphasis--headline']
  assert words
  for index,e in enumerate(words):
   midpoint=(e['startTime']+e['duration']*.5)/120000
   out=root/f'frame-{i}-{fixture}-{index}.png'
   subprocess.run(['/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg','-v','error','-y','-ss',str(midpoint),'-i',str(source),'-frames:v','1','-vf','scale=640:360',str(out)],check=True)
   results.append({'design':i,'fixture':fixture,'index':index,'text':e['params']['content'],'start':e['startTime']/120000,'duration':e['duration']/120000,'time':midpoint,'frame':str(out),'video':str(source)})
baseline=json.loads((Path(baseline_root)/'inspection.json').read_text())['results'] if baseline_root else results
for fixture in range(3):
 a=[r for r in baseline if r['design']==0 and r['fixture']==fixture]
 for offset in range(0,len(a),3):
  chunk=a[offset:offset+3];im=Image.new('RGB',(1280,len(chunk)*390),(25,28,32));draw=ImageDraw.Draw(im)
  for row,r in enumerate(chunk):
   other=next(x for x in results if x['design']==(0 if baseline_root else 1) and x['fixture']==fixture and x['index']==r['index'])
   assert (r['text'],r['start'],r['duration'])==(other['text'],other['start'],other['duration'])
   label=os.environ.get("COMPARISON_LABEL", "LEFT original width | RIGHT width=.50" if baseline_root else "LEFT y=.70 | RIGHT y=.76")
   draw.text((8,row*390+6),f"{r['text']}  {r['time']:.2f}s | {label}",fill='white')
   im.paste(Image.open(r['frame']),(0,row*390+30));im.paste(Image.open(other['frame']),(640,row*390+30))
  im.save(root/f'comparison-{fixture}-{offset//3}.jpg')
(root/'inspection.json').write_text(json.dumps({'results':results,'listened':False,'score':None,'visualInspection':'pending'},indent=2))
print(json.dumps({'batchId':batch['id'],'frames':len(results),'comparisons':[str(x) for x in root.glob('comparison-*.jpg')]}))
