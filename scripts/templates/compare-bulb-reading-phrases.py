from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/bulb-reading-phrases-20260929');OLD=Path('/Users/zhengwei/Downloads/bulb-reading-width-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
a=json.load(open(OLD/'manifest.json'));b=json.load(open(P/'manifest.json'));assert a['designs']==b['designs']
assert b['samples'][2]['layoutPhrases']==[{'wordSpan':{'startWord':11,'endWord':18}}]
b['samples'][2]['layoutPhrases']=[];assert a['samples']==b['samples']
assert json.load(open(P/'verification.json'))['technicalChecksPassed']
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
for i in range(3):assert pcm(P/f'{i}.mp4')==pcm(OLD/f'{i}.mp4')
im=Image.new('RGB',(1280,390),'#17212a');d=ImageDraw.Draw(im)
for col,root in enumerate([OLD,P]):
 f=Image.open(root/'2-hold.png');f.thumbnail((640,360));im.paste(f,(640*col,30));d.text((640*col+10,8),'WIDTH ONLY' if col==0 else 'SAME TEMPLATE + CONTENT PHRASE',fill='white')
im.save(P/'compare.jpg',quality=95)
(P/'comparison.json').write_text(json.dumps({'sameTemplate':True,'onlyContentPhraseChanged':True,'sameExportPcm':True,'score':None},indent=2))
p=P/'review.html';s=p.read_text().replace('<h1>灵感灯泡 · 语义触发对照</h1>','<h1>紧凑阅读 · 内容短语与样式分离</h1><p>保持64%宽度模板不变，只在输入中标注完整因果短语。比较未标注/标注后的断行；未修改声音时间。</p><img src="compare.jpg">');p.write_text(s)
print('PASS same template, only content phrase changes, unchanged PCM')
