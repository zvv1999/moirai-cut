import json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
r=Path('/Users/zhengwei/Downloads/inline-keyword-caption-20260929');item=json.loads((r/'item-0.json').read_text());records=[]
for f,fixture in enumerate(item['output']['fixtures']):
 caps=[e for s in fixture['compilation']['document']['scenes']for t in s['tracks']['overlay']for e in t['elements'] if e['params'].get('template.elementId')=='headline']
 # Each cue end covers outgoing text and the next cue or gap. Also cover the first entry.
 boundaries=[('first entry',0.)]+[(e['params']['content'],(e['startTime']+e['duration'])/120000)for e in caps]
 duration=json.loads((r/'validation.json').read_text())['samples'][f]['plan']['durationSeconds']
 for label,time in boundaries:
  idx=len(records);sheet=Image.new('RGB',(1920,250),'#182027');draw=ImageDraw.Draw(sheet);times=[]
  for j,offset in enumerate([-2/30,-1/30,0.,1/30,2/30,4/30]):
   t=time+offset;x=(j%3)*640;y=(j//3)*125
   if t<0 or t>=duration-1/30:draw.text((x+8,y+4),'Unavailable outside video bounds',fill='white');times.append(None);continue
   times.append(t);frame=r/f'boundary-{idx}-frame-{j}.png';subprocess.run(['/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg','-v','error','-y','-ss',str(t),'-i',str(r/f'preview-{f}.mp4'),'-frames:v','1','-vf','crop=1280:200:0:520,scale=640:100',str(frame)],check=True);draw.text((x+8,y+4),f'{t:.3f}s',fill='white');sheet.paste(Image.open(frame),(x,y+25))
  path=r/f'caption-boundary-{idx}.jpg';sheet.save(path,quality=95);records.append({'fixture':f,'label':label,'boundarySeconds':time,'sampleTimes':times,'image':path.name})
for start in range(0,len(records),4):
 subset=records[start:start+4];sheet=Image.new('RGB',(1920,len(subset)*280),'#182027');draw=ImageDraw.Draw(sheet)
 for row,e in enumerate(subset):draw.text((8,row*280+4),e['label'],fill='white');sheet.paste(Image.open(r/e['image']),(0,row*280+25))
 sheet.save(r/f'boundary-sheet-{start//4}.jpg',quality=95)
(r/'boundary-inspection.json').write_text(json.dumps({'records':records,'crop':[0,520,1280,200],'visuallyInspected':False,'listened':False},indent=2));print('Generated',len(records),'caption boundary sheets')
