"""Compare actual exports with identical measured keyword events; no automatic score."""
from pathlib import Path
import json, subprocess, html, os
from PIL import Image, ImageDraw

root=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/cyan-type-balance-20260929'))
prior=Path(os.environ.get('PRIOR_OUTPUT','/Users/zhengwei/Downloads/cyan-translucent-20260929'))
ffmpeg='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
new=json.loads((root/'item-0.json').read_text())['output']['fixtures']
old=json.loads((prior/'item-0.json').read_text())['output']['fixtures']
def captions(fixture):
 return [e for s in fixture['compilation']['document']['scenes'] for t in s['tracks']['overlay'] for e in t['elements'] if e.get('params',{}).get('template.elementId')=='headline']
def identity(e):
 animations=json.loads(json.dumps(e.get('animations',{})))
 for track in animations.values():
  for key in track.get('keys',[]):
   key.pop('id',None) # Independent projects allocate fresh key identities.
 return (e['params']['content'],e['startTime'],e['duration'],animations)
review_title=html.escape(os.environ.get('REVIEW_TITLE','重点词长短排版比较'))
review_description=html.escape(os.environ.get('REVIEW_DESCRIPTION','左：此前半透明版；右：64像素字号、较高两行区域。'))
events=[]
for i,(a,b) in enumerate(zip(old,new)):
 assert a['request']['input']['words']==b['request']['input']['words']
 aa,bb=captions(a),captions(b)
 assert list(map(identity,aa))==list(map(identity,bb))
 sheet=Image.new('RGB',(1280,360*len(bb)),'#20242c')
 for j,e in enumerate(bb):
  time=(e['startTime']+e['duration']/2)/120000
  for column,source in enumerate([prior,root]):
   frame=root/f'compare-{i}-{j}-{column}.png'
   subprocess.run([ffmpeg,'-v','error','-y','-ss',str(time),'-i',str(source/f'preview-0-{i}.mp4'),'-vf','crop=640:360:0:100','-frames:v','1',str(frame)],check=True)
   sheet.paste(Image.open(frame).convert('RGB'),(640*column,360*j))
  events.append({'fixture':i,'index':j,'text':e['params']['content'],'time':time})
 sheet.save(root/f'type-comparison-{i}.jpg')
(root/'type-verification.json').write_text(json.dumps({'events':events,'wordsTimingAndAnimationUnchanged':True,'listened':False,'score':None},ensure_ascii=False,indent=2))
(root/'review.html').write_text('<!doctype html><meta charset="utf-8"><title>'+review_title+'</title><style>body{background:#20242c;color:white;font:16px system-ui;max-width:1280px;margin:auto;padding:24px}video,img{width:100%}p{line-height:1.7}</style><h1>'+review_title+'</h1><p>'+review_description+'使用相同文字、实测时间、位置中心和动效。待视觉检查，未试听或评分。</p>'+''.join(f'<section><h2>样例{i+1}</h2><video controls preload="metadata" src="preview-0-{i}.mp4"></video><img src="type-comparison-{i}.jpg" alt="新旧排版逐词比较"></section>' for i in range(len(new))))
print(f'Compared {len(events)} unchanged keyword events.')
