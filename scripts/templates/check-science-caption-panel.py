from pathlib import Path
import json,subprocess,io
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/science-caption-panel-20260929');OLD=Path('/Users/zhengwei/Downloads/science-caption-composition-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
a=json.load(open(OLD/'item.json'));b=json.load(open(P/'item.json'));rows=[];reports=[]
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
for n,(before,after)in enumerate(zip(a['output']['fixtures'],b['output']['fixtures'])):
 assert {k:v for k,v in before['request']['input'].items()if k!='template'}=={k:v for k,v in after['request']['input'].items()if k!='template'}
 assert all(m['width']/m['height']==1280/720 for m in after['request']['media'].values() if m.get('type')=='video')
 assert before['compilation']['plan']['captions']==after['compilation']['plan']['captions']
 clips=[e for t in after['compilation']['document']['scenes'][0]['tracks']['overlay']for e in t['elements']]
 sharp=[e for e in clips if e['type']=='video'];assert len(sharp)==1;e=sharp[0];p=e['params'];assert p['transform.scaleX']==p['transform.scaleY']==.75;assert not e.get('masks');assert all(p.get('crop.'+side,0)==0 for side in ['left','right','top','bottom'])
 assert abs(p['transform.positionY']-(-68.4))<1e-8
 # For these three 16:9 sources on the 1280x720 canvas, sharp image bottom=561.6; caption box starts 592.56.
 captions=[e for e in clips if e.get('params',{}).get('template.elementId')=='headline'];assert captions
 for e in captions:
  p=e['params'];top=p['transform.positionY']+360-p['template.textLayoutHeight']/2
  assert top>561.6
 t=[4.21,7.06,9.5][n];sheet=Image.new('RGB',(960,580),'#17212a');draw=ImageDraw.Draw(sheet)
 for row,root in enumerate([OLD,P]):
  im=frame(root/f'preview-{n}.mp4',t);im.thumbnail((960,270));sheet.paste(im,(240,row*290+20));draw.text((20,row*290+5),'OVERLAY'if row==0 else 'RESERVED CAPTION AREA',fill='white')
 sheet.save(P/f'comparison-{n}.jpg',quality=96)
 reports.append({'fixture':n,'sameWordsCuesAndAudio':True,'sharpSourceScale':.75,'sourceCropped':False,'captionRegionOutsideSharpVideo':True,'sampleTime':t})
 rows.append(f'<section><h2>样例 {n+1}</h2><div><figure><video controls preload="metadata" src="../science-caption-composition-20260929/preview-{n}.mp4"></video><figcaption>原叠加版</figcaption></figure><figure><video controls preload="metadata" src="preview-{n}.mp4"></video><figcaption>独立阅读区</figcaption></figure></div><img src="comparison-{n}.jpg"><details><summary>新版字幕检查图</summary><img src="captions-{n}.jpg"><img src="word-boundaries-{n}.jpg"></details></section>')
(P/'layout-verification.json').write_text(json.dumps({'passed':True,'reports':reports},indent=2))
(P/'comparison.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>字幕独立留位 · 实拍对照</title><style>body{max-width:1200px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}img,video{width:100%}section{margin:30px 0}section div{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0}@media(max-width:650px){section div{grid-template-columns:1fr}}</style><h1>字幕独立留位 · 实拍对照</h1><p>相同三份原片和词时间。主画面完整缩至75%，字幕不占主画面，代价是人物变小。模糊填充保留背景氛围。候选待审，未试听、未作90分验收。</p><p><a href="http://127.0.0.1:3000/templates/compositions?template=composition-science-caption-panel-trial-20260929">打开独立阅读区候选模板</a></p>'+''.join(rows)+'<script>document.addEventListener("play",e=>{for(const v of document.querySelectorAll("video"))if(v!==e.target)v.pause()},true)</script>')
print('PASS all 3 inputs: source uncropped, caption boxes outside sharp video')
