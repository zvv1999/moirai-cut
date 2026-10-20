from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/bulb-reading-width-20260929');OLD=Path('/Users/zhengwei/Downloads/bulb-attachment-coverage-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
a=json.load(open(OLD/'manifest.json'));b=json.load(open(P/'manifest.json'));assert a['samples']==b['samples']
x=a['designs'][0]['template'];y=b['designs'][0]['template']
x=json.loads(json.dumps(x));y=json.loads(json.dumps(y))
for t in [x,y]:
 for k in ['id','name','revision']:t.pop(k,None)
ra=next(e['region']for e in x['elements']if e['id']=='headline');rb=next(e['region']for e in y['elements']if e['id']=='headline')
assert abs(ra['x']+ra['width']/2-rb['x']-rb['width']/2)<1e-10
assert ra['width']==.78 and rb['width']==.64
rb.update(ra);assert x==y
assert json.load(open(P/'verification.json'))['technicalChecksPassed']
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
for i in range(3):assert pcm(P/f'{i}.mp4')==pcm(OLD/f'{i}.mp4')
im=Image.new('RGB',(1280,780),'#17212a');d=ImageDraw.Draw(im)
for row,i in enumerate([1,2]):
 for col,root in enumerate([OLD,P]):
  f=Image.open(root/f'{i}-hold.png');f.thumbnail((640,360));im.paste(f,(640*col,390*row+30));d.text((640*col+10,390*row+8),'WIDTH .78' if col==0 else 'WIDTH .64',fill='white')
im.save(P/'compare.jpg',quality=95)
(P/'comparison.json').write_text(json.dumps({'onlyCaptionWidthChanged':True,'sameInputsAndAnnotations':True,'sameExportPcm':True,'score':None},indent=2))
p=P/'review.html';s=p.read_text().replace('<h1>灵感灯泡 · 语义触发对照</h1>','<h1>字幕阅读宽度 · 同内容对照</h1><p>左为78%宽度，右为64%宽度。只改通用阅读宽度，字号、图标、时间与输入均相同；比较长句换行和图文依附。</p><img src="compare.jpg">');p.write_text(s)
print('PASS only caption width changes; same source annotations and three export PCM streams')
