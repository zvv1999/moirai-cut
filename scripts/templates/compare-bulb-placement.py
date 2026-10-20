from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/bulb-caption-bound-20260929');OLD=Path('/Users/zhengwei/Downloads/bulb-live-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
assert json.load(open(P/'definition.json'))==json.load(open(OLD/'definition.json'));assert json.load(open(P/'inputs.json'))==json.load(open(OLD/'inputs.json'));assert json.load(open(P/'manifest.json'))['samples']==json.load(open(OLD/'manifest.json'))['samples']
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
for i in range(3):assert pcm(P/f'{i}.mp4')==pcm(OLD/f'{i}.mp4')
im=Image.new('RGB',(1280,390),'#17212a');d=ImageDraw.Draw(im)
for col,root in enumerate([OLD,P]):
 f=Image.open(root/'1-hold.png');f.thumbnail((640,360));im.paste(f,(640*col,30));d.text((640*col+10,8),'CORNER' if col==0 else 'CAPTION ATTACHED',fill='white')
im.save(P/'compare.jpg',quality=95)
(P/'comparison.json').write_text(json.dumps({'sameSavedAsset':True,'sameInputsAndAnnotations':True,'sameExportPcm':True,'sameKeywordTiming':True},indent=2))
p=P/'review.html';s=p.read_text();s=s.replace('<h1>灵感灯泡 · 语义触发对照</h1>','<h1>灯泡 · 角落与字幕依附对照</h1><img src="compare.jpg"><p>共用依附规则：灯泡位于当前字幕实测边界左侧，16层保持整体造型。原声与语义标注不变；无关键词仍不生成装饰。此为构图候选对照，未评90分。</p>');p.write_text(s)
print('PASS same saved asset, inputs, annotations and three export PCM streams')
