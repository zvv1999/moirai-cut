from pathlib import Path
import json,urllib.request,subprocess,hashlib,shutil,io,math
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/bold-growth-20260929');BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def audio(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','f32le','-'])
batch=api('/production/'+json.load(open(P/'submission.json'))['id']);assert batch['renderJob']['status']=='succeeded',batch['renderJob']
item=api('/production/'+batch['id']+'/items/0');assert item['status']=='published';(P/'item.json').write_text(json.dumps(item,indent=2));assert len(item['previews'])==2
rows=[];reports=[]
for i,folder in enumerate(['chinese-growth-original-20260929','chinese-growth-cue-20260929']):
 oldroot=P.parent/folder;oldbatch=api('/production/'+json.load(open(oldroot/'submission.json'))['id']);olditem=api('/production/'+oldbatch['id']+'/items/0');prev=olditem['previews'][0]['path'];fixture=item['output']['fixtures'][i];before=olditem['output']['fixtures'][0]
 assert fixture['request']['input']['words']==before['request']['input']['words']
 es=[e for t in fixture['compilation']['document']['scenes'][0]['tracks']['overlay'] for e in t['elements']];assert len(es)==1 and es[0].get('renderGroup');g=es[0];children=[e for t in g['renderGroup']['tracks']for e in t['elements']];assert len(children)==9 and all(e['type']=='graphic'for e in children)
 bg=[e for t in before['compilation']['document']['scenes'][0]['tracks']['overlay']for e in t['elements']][0];assert g['startTime']==bg['startTime'] and g['duration']==bg['duration']
 p=item['previews'][i];assert p['decodeVerified'] and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/f'{i}.mp4';shutil.copy2(p['path'],out);assert audio(out)==audio(prev),'Style change must not change prior export audio; not a source alignment claim'
 start=g['startTime']/120000;end=start+g['duration']/120000;mid=(start+end)/2
 pair=Image.new('RGB',(1088,1000),'#17212a');d=ImageDraw.Draw(pair)
 for j,(label,src)in enumerate([('Mint badge',prev),('Bold steps',out)]):pair.paste(frame(src,mid),(j*544,40));d.text((j*544+12,12),label,fill='white')
 pair.save(P/f'{i}-compare.jpg',quality=95)
 times=[t/30 for t in range(math.floor(start*30)-1,math.ceil(end*30)+2)];sheet=Image.new('RGB',(960,math.ceil(len(times)/6)*225),'#17212a');d=ImageDraw.Draw(sheet)
 for k,t in enumerate(times):
  im=frame(out,t).crop((0,0,250,310));im.thumbnail((160,200));sheet.paste(im,((k%6)*160,(k//6)*225+25));d.text(((k%6)*160+4,(k//6)*225+5),f'{t:.3f}s',fill='white')
 sheet.save(P/f'{i}-sequence.jpg',quality=95)
 rows.append(f'<h2>{"75秒桌面原片" if i==0 else "12秒既有衍生片段"}</h2><video controls preload="metadata" src="{i}.mp4"></video><img src="{i}-compare.jpg"><details><summary>完整事件帧</summary><img src="{i}-sequence.jpg"></details>')
 reports.append({'fixture':i,'nineEditableGraphics':True,'sameWordsAndTiming':True,'sameAudioAsPreviousExport':True,'sourceAudioAlignmentVerified':False,'start':start,'end':end,'sha256':p['sha256']})
(P/'verification.json').write_text(json.dumps({'structuralChecksPassed':True,'fixtures':reports,'score':None,'listened':False},indent=2))
(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>增长动图 · 风格对比</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}video{width:100%;max-height:75vh}img{max-width:100%}</style><h1>增长动图 · 风格对比</h1><p>同位置、同尺寸、同声音词时间，只改变保存版素材设计。左：薄荷绿徽章；右：红黄阶梯柱。两段内容同源，不代表跨内容验证。原片导出已知约1.45毫秒音频偏移仍未修复，未试听、未评分。</p>'+''.join(rows))
print('PASS structure, timing and unchanged export audio:',len(reports))
