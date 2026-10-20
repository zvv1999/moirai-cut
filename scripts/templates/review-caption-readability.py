import json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
root=Path('/Users/zhengwei/Downloads/inline-caption-readability-20260929');root.mkdir(exist_ok=True)
src=Path('/Users/zhengwei/Downloads/inline-caption-saved-20260929');item=json.loads((src/'item-0.json').read_text());records=[]
for i,f in enumerate(item['output']['fixtures']):
 caps=[e for s in f['compilation']['document']['scenes'] for t in s['tracks']['overlay'] for e in t['elements'] if e['params'].get('template.elementId')=='headline']
 sheet=Image.new('RGB',(1280,230*len(caps)), '#182027');draw=ImageDraw.Draw(sheet)
 for j,e in enumerate(caps):
  start=e['startTime']/120000;dur=e['duration']/120000;t=start+dur/2;txt=e['params']['content'];path=root/f'fixture-{i}-cue-{j}.png'
  subprocess.run(['/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg','-v','error','-y','-ss',str(t),'-i',str(src/f'preview-{i}.mp4'),'-frames:v','1','-vf','crop=1280:200:0:520',str(path)],check=True)
  draw.text((8,j*230+5),f'{start:.2f}-{start+dur:.2f}s | {len(txt)/dur:.1f} chars/sec | {txt}',fill='white');sheet.paste(Image.open(path),(0,j*230+30))
  records.append({'fixture':i,'cue':j,'text':txt,'start':start,'duration':dur,'charactersPerSecond':len(txt)/dur,'image':path.name})
 sheet.save(root/f'fixture-{i}-sheet.jpg',quality=95)
(root/'readability.json').write_text(json.dumps({'records':records,'listened':False,'continuousPlayback':False,'notes':'Character rates describe authored display intervals; no universal readability pass threshold is assumed.'},indent=2));print(root)
