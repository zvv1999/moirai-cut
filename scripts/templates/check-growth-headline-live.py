from pathlib import Path
import json,urllib.request,subprocess,hashlib,shutil,io,math,html
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/growth-headline-live-20260929');BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def flat(ts):
 out=[]
 for t in ts:
  for e in t['elements']:out.append(e);out.extend(flat(e.get('renderGroup',{}).get('tracks',[])))
 return out
b=api('/production/'+json.load(open(P/'submission.json'))['id']);assert b['renderJob']['status']=='succeeded',b['renderJob'];inp=json.load(open(P/'input.json'));assert hashlib.sha256((P/'source.mp4').read_bytes()).hexdigest()==inp['input']['sha256'];words=inp['transcript']['words'];start=words[23]['start'];end=words[24]['end'];reports=[];sections=[]
for i in range(2):
 item=api('/production/'+b['id']+'/items/'+str(i));assert item['status']=='published';(P/f'item-{i}.json').write_text(json.dumps(item,indent=2));f=item['output']['fixtures'][0];assert f['request']['input']['words']==words;es=flat(f['compilation']['document']['scenes'][0]['tracks']['overlay']);groups=[e for e in es if e.get('renderGroup')];growth=[g for g in groups if any(e['type']=='graphic'for e in flat(g['renderGroup']['tracks']))];assert len(growth)==1;g=growth[0];assert abs(g['startTime']/120000-start)<1e-5 and abs((g['startTime']+g['duration'])/120000-end)<1e-5
 texts=[e for e in es if e['type']=='text'];caption=[e for e in texts if e.get('params',{}).get('template.elementId')=='headline'];assert len(caption)==6,(len(caption),[e.get('params',{}).get('template.elementId')for e in texts]);assert ''.join(e['params']['content']for e in sorted(caption,key=lambda e:e['startTime'])).replace(' ','')==''.join(w['text']for w in words).replace(' ','')
 p=item['previews'][0];assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/f'{i}.mp4';shutil.copy2(p['path'],out);frame(out,(start+end)/2).save(P/f'{i}-hold.png');sheet=Image.new('RGB',(960,math.ceil(len(caption)/3)*300),'#17212a');d=ImageDraw.Draw(sheet)
 for k,e in enumerate(sorted(caption,key=lambda e:e['startTime'])):
  t=(e['startTime']+e['duration']*.5)/120000;im=frame(out,t);im.thumbnail((320,275));sheet.paste(im,((k%3)*320,(k//3)*300+25));d.text(((k%3)*320+5,(k//3)*300+5),f'{t:.2f}s',fill='white')
 sheet.save(P/f'{i}-captions.jpg',quality=95);times=[t/30 for t in range(max(0,math.floor(start*30)-1),math.ceil(end*30)+2)];sheet=Image.new('RGB',(1000,math.ceil(len(times)/5)*270),'#17212a');d=ImageDraw.Draw(sheet)
 for k,t in enumerate(times):
  im=frame(out,t);im.thumbnail((200,245));sheet.paste(im,((k%5)*200,(k//5)*270+25));d.text(((k%5)*200+5,(k//5)*270+5),f'{t:.3f}s',fill='white')
 sheet.save(P/f'{i}-sequence.jpg',quality=95);reports.append({'design':i,'fullCaptionCoverage':True,'keywordStart':start,'keywordEnd':end,'sha256':p['sha256']});sections.append(f'<h2>{"横屏画内强调"if i==0 else"竖屏独立阅读区"}</h2><video controls preload="metadata" src="{i}.mp4"></video><img src="{i}-hold.png"><details><summary>字幕与动效检查帧</summary><img src="{i}-captions.jpg"><img src="{i}-sequence.jpg"></details>')
(P/'verification.json').write_text(json.dumps({'technicalChecksPassed':True,'reports':reports,'listened':False,'score':None},indent=2));(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>成长访谈 · 实拍应用</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}video{width:100%;max-height:75vh}img{max-width:100%;max-height:80vh}</style><h1>成长访谈 · 实拍双画幅</h1><p>同一原声访谈、完整逐词字幕，仅在go forward词段使用阶梯花字。两种人工设计构图，不代表自动人物识别或任意画幅适配。未试听、未授予90分。</p>'+''.join(sections));print('PASS full caption coverage and measured keyword:',start,end)
