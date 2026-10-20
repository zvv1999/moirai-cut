from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/checklist-refined-20260930');OLD=Path('/Users/zhengwei/Downloads/checklist-headline-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
a=json.load(open(OLD/'manifest.json'));b=json.load(open(P/'manifest.json'));assert a['samples']==b['samples'];assert json.load(open(OLD/'inputs.json'))==json.load(open(P/'inputs.json'))
assert json.load(open(P/'definition.json'))['revision']==2
assert json.load(open(P/'verification.json'))['technicalChecksPassed']

item=json.load(open(P/'item.json'))
for fixture in item['output']['fixtures']:
 groups=[e for t in fixture['compilation']['document']['scenes'][0]['tracks']['overlay'] for e in t['elements']]
 children=[e for g in groups for t in g['renderGroup']['tracks'] for e in t['elements']]
 ticks=[e for e in children if str(e.get('params',{}).get('template.elementId','')).startswith('tick-')]
 assert len(ticks)==6
 for e in ticks:
  keys=e['animations']['opacity']['keys'];assert keys[0]['value']==0
  first=next(k for k in keys if k['value']==1);assert first['time']==9600

def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
for i in range(3):assert pcm(P/f'{i}.mp4')==pcm(OLD/f'{i}.mp4')
im=Image.new('RGB',(1080,570),'#17212a');d=ImageDraw.Draw(im)
for col,root in enumerate([OLD,P]):
 f=Image.open(root/'2-hold.png');f.thumbnail((540,540));im.paste(f,(540*col,30));d.text((540*col+10,8),'REVISION 1' if col==0 else 'REVISION 2',fill='white')
im.save(P/'compare.jpg',quality=95)
(P/'comparison.json').write_text(json.dumps({'sameInputsAndAnnotations':True,'sameExportPcm':True,'revision':2,'score':None},indent=2))
p=P/'review.html';s=p.read_text().replace('<h1>行动清单 · 方法花字</h1>','<h1>行动清单 · 阅读与勾选节奏修订</h1><p>相同配音和标注，对比初版与修订版。共用较宽阅读区域、78px文字及80ms同步勾选显现。</p><img src="compare.jpg">');p.write_text(s)
print('PASS same source words, annotations, timing and three PCM streams')
