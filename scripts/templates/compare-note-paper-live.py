from pathlib import Path
import json,subprocess,html
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/note-paper-safe-20260929');OLD=Path('/Users/zhengwei/Downloads/note-paper-live-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
sections=[];reports=[]
for i in range(3):
 q=P/str(i);v=json.load(open(q/'verification.json'));assert v['technicalChecksPassed'];a=json.load(open(q/'placement.json'));assert a['advice']['selectedId']==('upper_left' if i==0 else 'upper_right')
 assert json.load(open(q/'definition.json'))==json.load(open(OLD/'definition.json'))
 assert json.load(open(q/'inputs.json'))[0]==json.load(open(OLD/'inputs.json'))[i]
 assert pcm(q/'0.mp4')==pcm(OLD/f'{i}.mp4')
 im=Image.new('RGB',(1280,390),'#17212a');d=ImageDraw.Draw(im)
 for col,p in enumerate([OLD/f'{i}-hold.png',q/'0-hold.png']):
  f=Image.open(p);f.thumbnail((640,360));im.paste(f,(col*640,30));d.text((col*640+10,8),'BEFORE' if col==0 else 'AFTER',fill='white')
 im.save(P/f'compare-{i}.jpg',quality=95)
 reports.append({'fixture':i,'selected':a['advice']['selectedId'],'savedAssetUnchanged':True,'inputUnchanged':True,'exportPcmUnchanged':True})
 sections.append(f'<h2>样例 {i+1}</h2><img src="compare-{i}.jpg"><video src="{i}/0.mp4" controls preload="metadata"></video><a href="{i}/review.html">完整检查帧</a>')
(P/'comparison.json').write_text(json.dumps(reports,indent=2))
(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>便签实拍 · 构图规则对照</title><style>body{max-width:1280px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}img{width:100%}video{width:100%;max-height:70vh}a{color:#ffe7a0}</style><h1>便签实拍 · 构图规则对照</h1><p>同一保存素材；应用统一缩放从0.65改为0.5，使用同一左上/右上候选位置。Rust根据人工标注的保护区选择位置，不是自动识别人脸或图示。保留原文、词时间和输入，前后导出PCM相同，不代表源波形严格对齐已通过。未试听、未授予90分，不作为三款新模板计数。</p>'+''.join(sections))
print('PASS same asset/input and export PCM for 3 cases')
