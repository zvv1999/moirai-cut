from pathlib import Path
import json
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/note-caption-compact-20260929');OLD=Path('/Users/zhengwei/Downloads/note-caption-20260929')
assert json.load(open(P/'definition.json'))==json.load(open(OLD/'definition.json'))
assert json.load(open(P/'inputs.json'))==json.load(open(OLD/'inputs.json'))
a=json.load(open(P/'application.json'));b=json.load(open(OLD/'application.json'));b['transform']=a['transform'];assert a==b
v=json.load(open(P/'verification.json'));assert v['technicalChecksPassed'];sections=[]
for i,cue in [(0,1),(1,3),(2,3)]:
 im=Image.new('RGB',(1280,390),'#17212a');d=ImageDraw.Draw(im)
 for col,root in enumerate([OLD,P]):
  f=Image.open(root/f'{i}-{cue}-hold.png');f.thumbnail((640,360));im.paste(f,(640*col,30));d.text((col*640+10,8),'INITIAL' if col==0 else 'COMPACT',fill='white')
 im.save(P/f'compare-{i}.jpg',quality=95);sections.append(f'<h2>样例 {i+1}</h2><img src="compare-{i}.jpg"><video controls preload="metadata" src="{i}.mp4"></video><details><summary>全部字幕中点</summary><img src="{i}-captions.jpg"></details>')
(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>便签字幕 · 轻量版对照</title><style>body{max-width:1280px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}img,video{width:100%}video{max-height:75vh}</style><h1>便签字幕 · 轻量版对照</h1><p>同一保存样式和三份实测输入，仅统一缩放0.65→0.52、垂直中心0.85→0.89；两行上限与84%文字区域保持。无逐句坐标或固定换行。完整字幕、事件时间、文件校验及前后导出音频检查通过。未试听，未授予90分，底部手势仍可能被遮挡。</p>'+''.join(sections))
print('PASS same asset/content, only application transform changed')
