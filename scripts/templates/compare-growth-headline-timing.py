from pathlib import Path
import json,subprocess,io,hashlib
from PIL import Image,ImageDraw
old=Path('/Users/zhengwei/Downloads/growth-headline-20260929');new=Path('/Users/zhengwei/Downloads/growth-headline-timing-20260929');ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
a=json.load(open(old/'definition.json'));b=json.load(open(new/'definition.json'));b['revision']=a['revision'];b['provenance']=a['provenance'];changes=0
for x,y in zip(a['layers'],b['layers']):
 if x['content'].get('element',{}).get('features',{}).get('representation')=='rectangle':
  assert x['content']['element']['motionTiming']['enterSeconds']==.22;assert y['content']['element']['motionTiming']['enterSeconds']==.12;y['content']['element']['motionTiming']['enterSeconds']=.22;changes+=1
assert a==b and changes==9

def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([ff,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(p):return hashlib.sha256(subprocess.check_output([ff,'-v','error','-i',str(p),'-vn','-f','f32le','-'])).hexdigest()
for i in range(3):assert pcm(old/f'{i}.mp4')==pcm(new/f'{i}.mp4')
# Identical stable-state image and no new layout drift, allowing encoder pixel error.
reports=[]
for i,t in enumerate([1.88,2.60,1.50]):
 x=frame(old/f'{i}.mp4',t);y=frame(new/f'{i}.mp4',t);mae=sum(abs(u-v)for p,q in zip(x.getdata(),y.getdata())for u,v in zip(p,q))/(x.width*x.height*3);assert mae<1,mae;reports.append({'fixture':i,'stableFrameMeanAbsoluteError':mae,'exportPcmUnchanged':True})
sheet=Image.new('RGB',(1200,660),'#17212a');d=ImageDraw.Draw(sheet)
for row,p in enumerate([old/'0.mp4',new/'0.mp4']):
 for col,delta in enumerate([.04,.10,.14,.20,.28,.36]):
  im=frame(p,1.58+delta);im=im.crop((190,240,530,480));im.thumbnail((200,280));sheet.paste(im,(col*200,row*330+40));d.text((col*200+5,row*330+8),f'{"220ms" if row==0 else "120ms"} +{delta:.2f}s',fill='white')
sheet.save(new/'timing-comparison.jpg',quality=95)
(new/'comparison-verification.json').write_text(json.dumps({'onlyNineEntranceDurationsChanged':True,'reports':reports,'sourceAudioAlignmentVerified':False,'listened':False},indent=2))
p=new/'review.html';s=p.read_text();s=s.replace('<h1>增长宣言 · 随文字布局的阶梯花字</h1>','<h1>增长宣言 · 120毫秒统一入场</h1><p>上排原版220毫秒展开，下排新版120毫秒展开；同一0.4秒关键词、相同配音。稳定造型与文字排版保持。</p><img src="timing-comparison.jpg">');p.write_text(s);print('PASS timing-only definition change, unchanged PCM, stable frames',reports)
