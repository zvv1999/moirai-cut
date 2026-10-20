from pathlib import Path
import json
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/note-caption-balanced-20260929');OLD=Path('/Users/zhengwei/Downloads/note-caption-compact-20260929')
for name in ['definition','inputs','application']:
 assert json.load(open(P/(name+'.json')))==json.load(open(OLD/(name+'.json')))
a=json.load(open(P/'manifest.json'));b=json.load(open(OLD/'manifest.json'));assert a['designs']==b['designs'];assert a['samples']==b['samples'];assert json.load(open(P/'verification.json'))['technicalChecksPassed'];sections=[]
for i,cue in [(0,1),(1,3),(2,2)]:
 im=Image.new('RGB',(1280,390),'#17212a');d=ImageDraw.Draw(im)
 for col,root in enumerate([OLD,P]):
  f=Image.open(root/f'{i}-{cue}-hold.png');f.thumbnail((640,360));im.paste(f,(col*640,30));d.text((col*640+10,8),'GREEDY LEFT WRAP' if col==0 else 'BALANCED LEFT WRAP',fill='white')
 im.save(P/f'compare-{i}.jpg',quality=95)
 sections.append(f'<h2>样例 {i+1}</h2><img src="compare-{i}.jpg"><video src="{i}.mp4" controls preload="metadata"></video><details><summary>全部字幕中点</summary><img src="{i}-captions.jpg"></details>')
boundary_section = '<h2>连续换句边界</h2><p>每个起止点前后按30fps取7个时间点，展示底部200像素裁切。包含8.80秒和11.52秒两处无间隔换句；不是实时连续播放或试听。</p>' + ''.join(f'<details><summary>样例 {i+1}：所有起止边界</summary><img src="{i}-boundaries.jpg"></details>' for i in range(3)) if (P/'boundary-verification.json').exists() else ''
(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>左对齐字幕 · 行长平衡</title><style>body{max-width:1280px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}img,video{width:100%}video{max-height:75vh}</style><h1>左对齐字幕 · 行长平衡</h1><p>模板、输入、字号、位置完全相同，仅渲染器自动分行规则变化。行长平衡现在独立于左/中/右对齐；保留显式段落和有效短语边界。24项回归测试通过；三段完整字幕、实测时间、文件解码和导出音频检查通过。未试听，未授予90分。</p>'+''.join(sections)+boundary_section)
print('PASS unchanged definitions, input, application, design and samples')
