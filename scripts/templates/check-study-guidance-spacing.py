"""Measure representative-frame clearance on this known solid-background composition.
This is not a general collision detector or perceptual quality score.
"""
import json, subprocess
from pathlib import Path
from PIL import Image
root=Path('/Users/zhengwei/Downloads/study-guidance-spacing-2026-09-29')
prior=Path('/Users/zhengwei/Downloads/study-guidance-hierarchy-2026-09-29')
ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
old=json.loads((prior/'item.json').read_text()); new=json.loads((root/'item.json').read_text())
def elements(f):return [e for s in f['compilation']['document']['scenes'] for t in s['tracks']['overlay'] for e in t['elements']]
def cues(f):return [(e['params'].get('template.elementId'),e['params'].get('content'),e['startTime'],e['duration']) for e in elements(f)]
def bands(path):
 im=Image.open(path).convert('RGB'); rows=[]
 for y in range(200,770):
  active=sum(max(abs(c-b) for c,b in zip(im.getpixel((x,y)),(32,35,51)))>50 for x in range(80,640))
  if active>=8:rows.append(y)
 groups=[]
 for y in rows:
  if not groups or y>groups[-1][-1]+2:groups.append([y])
  else:groups[-1].append(y)
 return [[g[0],g[-1]] for g in groups]
checks=[]
for i,f in enumerate(new['output']['fixtures']):
 assert cues(f)==cues(old['output']['fixtures'][i]); assert f['request']['input']['words']==old['output']['fixtures'][i]['request']['input']['words']
 for j,e in enumerate(x for x in elements(f) if x['params'].get('template.elementId')=='note--headline'):
  time=(e['startTime']+e['duration']/2)/120000; result={'fixture':i,'note':j,'time':time}
  for name,folder in [('old',prior),('new',root)]:
   path=root/f'clearance-{i}-{j}-{name}.png'
   subprocess.run([ff,'-v','error','-y','-ss',str(time),'-i',str(folder/f'preview-{i}.mp4'),'-frames:v','1',str(path)],check=True)
   ranges=bands(path);assert len(ranges)==2 or (name=='old' and len(ranges)==1),(name,i,j,ranges)
   result[name]={'bands':ranges,'gapPixels':ranges[1][0]-ranges[0][1]-1 if len(ranges)==2 else 0}
  assert result['new']['gapPixels']>result['old']['gapPixels'];assert result['new']['gapPixels']>=20
  checks.append(result)
(root/'spacing-verification.json').write_text(json.dumps({'checks':checks,'sameContentAndTiming':True,'method':'Midpoint full frames, x80..639 y200..769; row active when >=8 pixels differ from #202333 by >50 in any RGB channel. Known composition only.','listened':False,'score':None},indent=2))
print(json.dumps([{'fixture':c['fixture'],'note':c['note'],'oldGap':c['old']['gapPixels'],'newGap':c['new']['gapPixels']} for c in checks],indent=2))
