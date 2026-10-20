import json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
r=Path('/Users/zhengwei/Downloads/caption-keyword-width-20260929')
inspection=json.loads((r/'inspection.json').read_text());records=[]
for e in inspection['results']:
 f,i=e['fixture'],e['index'];combined=Image.new('RGB',(1920,1120),'#182027');draw=ImageDraw.Draw(combined)
 for b,(name,start) in enumerate([('entry',max(0,e['start']-1/30)),('exit',max(0,e['start']+e['duration']-5/30))]):
  out=r/f'boundary-{f}-{i}-{name}.jpg'
  subprocess.run(['/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg','-v','error','-y','-ss',str(start),'-i',e['video'],'-vf','fps=30,crop=1280:360:0:360,scale=640:180,tile=3x3','-frames:v','1',str(out)],check=True)
  combined.paste(Image.open(out),(0,b*560+20));draw.text((8,b*560+3),f"{e['text']} | {name} | 9 consecutive frames starting {start:.3f}s",fill='white')
  records.append({'fixture':f,'event':i,'text':e['text'],'boundary':name,'start':start,'frames':9,'path':str(out)})
 combined.save(r/f'boundary-{f}-{i}.jpg',quality=95)
(r/'boundary-manifest.json').write_text(json.dumps({'frameRate':30,'crop':[0,360,1280,360],'records':records,'inspected':False},indent=2));print('Generated',len(records),'boundary strips')
