from pathlib import Path
import json,urllib.request,subprocess,hashlib,shutil,io,math
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/editorial-cross-input-20260929');BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def flat(ts):
 out=[]
 for t in ts:
  for e in t['elements']:out.append(e);out.extend(flat(e.get('renderGroup',{}).get('tracks',[])))
 return out
b=api('/production/'+json.load(open(P/'submission.json'))['id']);assert b['renderJob']['status']=='succeeded',b['renderJob'];inputs=json.load(open(P/'inputs.json'));manifest=json.load(open(P/'manifest.json'));library=api('');reports=[]
for d in range(2):
 saved=json.load(open(P/f'saved-{d}.json'));assert next(t for t in library['templates']if t['id']==saved['id'])==saved
 item=api('/production/'+b['id']+'/items/'+str(d));assert item['status']=='published';(P/f'item-{d}.json').write_text(json.dumps(item,indent=2))
 for i,f in enumerate(item['output']['fixtures']):
  inp=inputs[i];assert hashlib.sha256((P/f'source-{i}.mp4').read_bytes()).hexdigest()==inp['input']['sha256'];words=inp['transcript']['words'];assert f['request']['input']['words']==words;es=flat(f['compilation']['document']['scenes'][0]['tracks']['overlay']);assert not any(e.get('params',{}).get('template.elementId','').startswith('growth--')for e in es);caps=[e for e in es if e.get('params',{}).get('template.elementId')=='headline'];assert len(caps)==len(manifest['samples'][i]['captionSpans']);assert ''.join(e['params']['content']for e in sorted(caps,key=lambda e:e['startTime'])).replace(' ','')==''.join(w['text']for w in words).replace(' ','');titles=[e for e in es if e.get('params',{}).get('template.elementId')=='editorial-title'];assert len(titles)==1 and titles[0]['params']['content']==manifest['samples'][i]['title']
  p=next(x for x in item['previews']if x['fixture']==i);assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/f'{d}-{i}.mp4';shutil.copy2(p['path'],out);frame(out,3).save(P/f'{d}-{i}-hold.png');sheet=Image.new('RGB',(1080,math.ceil(len(caps)/4)*505),'#17212a');draw=ImageDraw.Draw(sheet)
  for k,e in enumerate(sorted(caps,key=lambda e:e['startTime'])):
   t=(e['startTime']+e['duration']*.5)/120000;im=frame(out,t);im.thumbnail((270,480));sheet.paste(im,((k%4)*270,(k//4)*505+25));draw.text(((k%4)*270+5,(k//4)*505+5),f'{t:.2f}s',fill='white')
  sheet.save(P/f'{d}-{i}-captions.jpg',quality=95);reports.append({'design':d,'fixture':i,'captionCoverage':True,'titleBinding':True,'unrelatedDecorationAbsent':True,'sha256':p['sha256']})
sections=[]
for i in range(3):
 sheet=Image.new('RGB',(720,665),'#17212a');draw=ImageDraw.Draw(sheet)
 for d,label in enumerate(['Full frame','Subject crop']):
  im=Image.open(P/f'{d}-{i}-hold.png');im.thumbnail((360,640));sheet.paste(im,(d*360,25));draw.text((d*360+8,7),label,fill='white')
 sheet.save(P/f'{i}-comparison.jpg',quality=95);sections.append(f'<h2>{manifest["samples"][i]["title"]}</h2><img src="{i}-comparison.jpg"><div class="pair"><video controls preload="metadata" src="0-{i}.mp4"></video><video controls preload="metadata" src="1-{i}.mp4"></video></div><details><summary>全部字幕代表帧</summary><img src="0-{i}-captions.jpg"><img src="1-{i}-captions.jpg"></details>')
(P/'verification.json').write_text(json.dumps({'technicalChecksPassed':True,'reports':reports,'savedTemplatesUnchanged':True,'listened':False,'score':None},indent=2));(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>阅读卡 · 跨人物验证</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}img{max-width:100%}.pair{display:flex;gap:16px}.pair video{width:48%;max-height:70vh}</style><h1>同一模板 · 三位人物与双构图</h1><p>保存模板不变，仅更换内容标题、实测字幕与人工焦点。左为完整画面，右为人物裁切。太阳图示与背景标识需评估是否应保留，不能将人物居中当作构图必然正确。未试听、未授予90分。</p>'+''.join(sections));print('PASS six exports, unchanged saved definitions')
