from pathlib import Path
import os,json,urllib.request,subprocess,hashlib,shutil,io,math
from PIL import Image,ImageDraw
P=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/editorial-interview-20260929'));BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def flat(ts):
 out=[]
 for t in ts:
  for e in t['elements']:out.append(e);out.extend(flat(e.get('renderGroup',{}).get('tracks',[])))
 return out
b=api('/production/'+json.load(open(P/'submission.json'))['id']);assert b['renderJob']['status']=='succeeded',b['renderJob'];item=api('/production/'+b['id']+'/items/0');assert item['status']=='published';(P/'item.json').write_text(json.dumps(item,indent=2));inputs=json.load(open(P/'inputs.json'));manifest=json.load(open(P/'manifest.json'));reports=[];sections=[]
for i,f in enumerate(item['output']['fixtures']):
 words=inputs[i]['transcript']['words'];assert f['request']['input']['words']==words;es=flat(f['compilation']['document']['scenes'][0]['tracks']['overlay']);captions=[e for e in es if e.get('params',{}).get('template.elementId')=='headline'];assert len(captions)==[6,3][i];assert ''.join(e['params']['content']for e in sorted(captions,key=lambda e:e['startTime'])).replace(' ','')==''.join(w['text']for w in words).replace(' ','');titles=[e for e in es if e.get('params',{}).get('template.elementId')=='editorial-title'];assert len(titles)==1 and titles[0]['params']['content']==manifest['samples'][i]['title'];marks=[e for e in es if e.get('params',{}).get('template.elementId','').startswith('growth--bar-')];assert len(marks)==[9,0][i]
 p=item['previews'][i];assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/f'{i}.mp4';shutil.copy2(p['path'],out);frame(out,5.25 if i==0 else 3).save(P/f'{i}-hold.png');times=[(e['startTime']+e['duration']*.5)/120000 for e in sorted(captions,key=lambda e:e['startTime'])];times+=[4.94,5.0,5.07,5.25,5.53,5.6]if i==0 else[];sheet=Image.new('RGB',(1080,math.ceil(len(times)/4)*505),'#17212a');d=ImageDraw.Draw(sheet)
 for k,t in enumerate(times):
  im=frame(out,t);im.thumbnail((270,480));sheet.paste(im,((k%4)*270,(k//4)*505+25));d.text(((k%4)*270+5,(k//4)*505+5),f'{t:.2f}s',fill='white')
 sheet.save(P/f'{i}-frames.jpg',quality=95);reports.append({'fixture':i,'completeCaptionCoverage':True,'titleBoundToInput':True,'growthGraphicLayers':len(marks),'sha256':p['sha256']});sections.append(f'<h2>{manifest["samples"][i]["title"]}</h2><video controls preload="metadata" src="{i}.mp4"></video><details><summary>字幕与动效检查帧</summary><img src="{i}-frames.jpg"></details>')
(P/'verification.json').write_text(json.dumps({'technicalChecksPassed':True,'reports':reports,'listened':False,'score':None},indent=2));(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+manifest['name']+'</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}video{width:100%;max-height:75vh}img{max-width:100%}</style><h1>'+manifest['name']+'</h1><p>标题来自内容输入，'+('画面按人工焦点裁切两侧，正文在画面下方逐词显示。'if manifest['samples'][0].get('focalPoint') else'视频完整容纳，正文在画面下方逐词显示。')+'仅第一段明确的go forward触发成长装饰，第二段无相关关键词，不强行添加装饰。人工构图，不是自动人脸识别。未试听、未授予90分。</p>'+''.join(sections));print('PASS two inputs: titles, full captions, optional keyword graphics')
