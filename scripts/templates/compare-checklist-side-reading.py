from pathlib import Path
import json,subprocess,html
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/checklist-side-reading-20260930');OLD=Path('/Users/zhengwei/Downloads/checklist-live-reviewed-20260930');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
policy=json.load(open(P/'policy.json'));definition=json.load(open(P/'definition.json'));original=json.load(open(OLD/'manifest.json'));sections=[];reports=[]
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
for i in range(3):
 root=P/str(i);m=json.load(open(root/'manifest.json'));assert m['samples']==[original['samples'][i]];assert json.load(open(root/'definition.json'))==definition
 evidence=json.load(open(root/'placement.json'));req=evidence['request'];assert {k:v for k,v in req.items()if k!='protectedRegions'}==policy
 assert evidence['advice']['selectedId']==['left','left','right'][i];assert json.load(open(root/'verification.json'))['technicalChecksPassed'];assert pcm(root/'0.mp4')==pcm(OLD/f'{i}.mp4')
 im=Image.new('RGB',(1280,390),'#17212a');draw=ImageDraw.Draw(im)
 for col,path in enumerate([OLD/f'{i}-hold.png',root/'0-hold.png']):
  frame=Image.open(path);frame.thumbnail((640,360));im.paste(frame,(640*col,30));draw.text((640*col+8,8),'BOTTOM CAPTIONS' if col==0 else 'SIDE READING',fill='white')
 im.save(P/f'compare-{i}.jpg',quality=95)
 reports.append({'fixture':i,'selected':evidence['advice']['selectedId'],'sameSavedStyleAndPolicy':True,'sameAnnotations':True,'sameExportPcm':True})
 sections.append(f'<h2>{html.escape(m["samples"][0]["title"])}</h2><img src="compare-{i}.jpg"><video controls preload="metadata" src="{i}/0.mp4"></video><details><summary>全部字幕检查帧</summary><img src="{i}/0-captions.jpg"></details>')
(P/'comparison.json').write_text(json.dumps({'reports':reports,'decision':'needs_revision_not_default','blockingFindings':['Long captions wrap into four or five lines with isolated words; position clearance alone is not readability acceptance.'],'manualProtectedRegions':True,'listened':False,'score':None},indent=2))
(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>清单字幕 · 避让与阅读取舍</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}img,video{width:100%}video{max-height:75vh}</style><h1>侧栏试验：手势露出，但长句阅读未通过</h1><p>同一保存样式、同一左右候选规则，Rust根据人工提供的保护区选择左/左/右。原声及内容标注保持。位置无碰撞不等于效果合格：长句产生四五行与孤词，不能作为通用默认布局，不计入90分模板。未试听或实时连续观看。</p>'+''.join(sections))
print('PASS common saved style/policy, same annotations and PCM; visual decision needs revision')
