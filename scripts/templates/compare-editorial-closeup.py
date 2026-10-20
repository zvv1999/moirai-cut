from pathlib import Path
import json,subprocess,hashlib
from PIL import Image,ImageDraw
old=Path('/Users/zhengwei/Downloads/editorial-interview-20260929');initial=Path('/Users/zhengwei/Downloads/editorial-closeup-20260929');new=Path('/Users/zhengwei/Downloads/editorial-closeup-clean-20260929');ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def pcm(p):return hashlib.sha256(subprocess.check_output([ff,'-v','error','-i',str(p),'-vn','-f','f32le','-'])).hexdigest()
a=json.load(open(old/'manifest.json'));b=json.load(open(new/'manifest.json'));first=json.load(open(initial/'manifest.json'))
for i in range(2):
 sample=dict(b['samples'][i]);assert sample.pop('focalPoint')=={'x':.62,'y':.5};assert sample==a['samples'][i];assert pcm(old/f'{i}.mp4')==pcm(new/f'{i}.mp4')
 before=first['designs'][0]['template'];after=b['designs'][0]['template'];before['elements']=[e for e in before['elements']if e['id']!='footer-rule'];before['styles']=[s for s in before['styles']if s['id']!='footer-rule-style'];assert before==after
 sheet=Image.new('RGB',(1080,665),'#17212a');d=ImageDraw.Draw(sheet)
 for col,(p,label)in enumerate([(old,'Full frame'),(initial,'Close-up / line collision'),(new,'Close-up / final')]):
  im=Image.open(p/f'{i}-hold.png');im.thumbnail((360,640));sheet.paste(im,(col*360,25));d.text((col*360+6,6),label,fill='white')
 sheet.save(new/f'{i}-comparison.jpg',quality=95)
(new/'comparison-verification.json').write_text(json.dumps({'sampleChangesOnlyFocalPoint':True,'exportAudioPcmUnchanged':True,'cleanupOnlyRemovedFooterLine':True,'sourceWaveformAlignmentVerified':False},indent=2));p=new/'review.html';s=p.read_text().replace('<h1>成长访谈 · 人物阅读卡</h1>','<h1>成长访谈 · 人物阅读卡</h1><p>左：完整画面版；中：发现装饰线碰撞的初稿；右：移除分隔线后的版本。裁切牺牲两侧环境及部分边缘手势，须按输入检查。</p><img src="0-comparison.jpg"><img src="1-comparison.jpg">');p.write_text(s);print('PASS unchanged content/audio, line-only cleanup; comparisons saved')
