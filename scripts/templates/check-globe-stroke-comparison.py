from pathlib import Path
import json,html
from PIL import Image,ImageDraw
old=Path('/Users/zhengwei/Downloads/globe-decoration-20260929');new=Path('/Users/zhengwei/Downloads/globe-stroke-rule-20260929')
a=json.load(open(old/'item.json'));b=json.load(open(new/'item.json'))
def flat(ts):
 out=[]
 for t in ts:
  for e in t['elements']:
   out.append(e);out+=flat(e.get('renderGroup',{}).get('tracks',[]))
 return out
def clean(v):
 if isinstance(v,dict):return {k:clean(x)for k,x in v.items()if k not in ['id','template.requestHash','template.applicationKey','strokeWidth']}
 if isinstance(v,list):return [clean(x)for x in v]
 return v
comparisons=[]
for n in range(2):
 aa=a['output']['fixtures'][n];bb=b['output']['fixtures'][n]
 assert {k:v for k,v in aa['request']['input'].items() if k!='template'}=={k:v for k,v in bb['request']['input'].items()if k!='template'}
 before=aa['compilation']['document']['scenes'][0]['tracks']['overlay'];after=bb['compilation']['document']['scenes'][0]['tracks']['overlay'];assert clean(before)==clean(after)
 for x,y in zip(flat(before),flat(after)):
  if 'strokeWidth'in x['params']:
   expected=x['params']['strokeWidth']/.32
   assert abs(y['params']['strokeWidth']-expected)<1e-9
 for row in range(n+1):
  sheet=Image.new('RGB',(1000,330),'#17212a');d=ImageDraw.Draw(sheet)
  for col,p in enumerate([old,new]):
   im=Image.open(p/f'full-{n}-{row}.png').crop((940,110,1160,320));im.thumbnail((440,280));sheet.paste(im,(col*500+20,35));d.text((col*500+20,8),'BEFORE' if col==0 else 'CORRECT SOURCE STROKE',fill='white')
  sheet.save(new/f'compare-{n}-{row}.jpg',quality=95);comparisons.append(f'<img src="compare-{n}-{row}.jpg" alt="描边缩放前后对比">')
p=new/'review.html';s=p.read_text().replace('<a href=', '<h2>修复前后 · 相同版本与尺寸</h2>'+''.join(comparisons)+'<a href=',1);p.write_text(s)
(new/'stroke-comparison.json').write_text(json.dumps({'passed':True,'sameSourceInputs':True,'onlyGraphicStrokeWidthChanged':True,'scale':.32,'events':3},indent=2))
print('PASS unchanged inputs/geometry/timing/animation; graphic stroke corrected')
