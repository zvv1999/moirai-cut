from pathlib import Path
import json,urllib.request,subprocess,hashlib,shutil,io,math,html
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/cyan-protected-placement-20260930');OLD=Path('/Users/zhengwei/Downloads/cyan-natural-real-2026-09-29');BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def flat(ts):
 out=[]
 for t in ts:
  for e in t['elements']:out.append(e);out.extend(flat(e.get('renderGroup',{}).get('tracks',[])))
 return out
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
prior=json.load(open(OLD/'item.json'));old_template=json.load(open(OLD/'designs.json'))['designs'][0]['template'];reports=[];sections=[]
for sub in json.load(open(P/'submissions.json')):
 i=sub['fixture'];folder=P/str(i);template=json.load(open(folder/'manifest.json'))['designs'][0]['template'];assert template['styles']==old_template['styles'];assert [(e['motions'],e['timing'],e['region']['width'],e['region']['height'])for e in template['elements']]==[(e['motions'],e['timing'],e['region']['width'],e['region']['height'])for e in old_template['elements']];b=api('/production/'+sub['id']);assert b['renderJob']['status']=='succeeded',b['renderJob'];item=api('/production/'+sub['id']+'/items/0');(folder/'item.json').write_text(json.dumps(item,indent=2));f=item['output']['fixtures'][0];old=prior['output']['fixtures'][i];assert {k:v for k,v in f['request']['input'].items()if k!='template'}=={k:v for k,v in old['request']['input'].items()if k!='template'}
 es=flat(f['compilation']['document']['scenes'][0]['tracks']['overlay']);os=flat(old['compilation']['document']['scenes'][0]['tracks']['overlay']);texts=[e for e in es if e['type']=='text'];ot=[e for e in os if e['type']=='text'];assert [(e['params']['content'],e['startTime'],e['duration'])for e in texts]==[(e['params']['content'],e['startTime'],e['duration'])for e in ot]
 p=item['previews'][0];assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];video=P/f'{i}.mp4';shutil.copy2(p['path'],video);legacy_equal=pcm(video)==pcm(OLD/f'preview-{i}.mp4')
 sheet=Image.new('RGB',(1280,math.ceil(len(texts)/2)*390),'#17212a');draw=ImageDraw.Draw(sheet)
 for k,e in enumerate(texts):
  t=(e['startTime']+e['duration']/2)/120000;im=frame(video,t);im.thumbnail((640,360));sheet.paste(im,((k%2)*640,(k//2)*390+25));draw.text(((k%2)*640+5,(k//2)*390+5),f'{t:.3f}s',fill='white')
 sheet.save(P/f'{i}-events.jpg',quality=95)
 t=(texts[0]['startTime']+texts[0]['duration']/2)/120000;frame(video,t).save(P/f'{i}-after.png');frame(OLD/f'preview-{i}.mp4',t).save(P/f'{i}-before.png')
 reports.append({'fixture':i,'selected':sub['selected'],'keywordCount':len(texts),'sameEventContentAndTiming':True,'legacyPcmEqual':legacy_equal,'sha256':p['sha256']});sections.append(f'<section><h2>样例{i+1} · {sub["selected"]}</h2><div class="pair"><figure><figcaption>原固定左上</figcaption><img src="{i}-before.png"></figure><figure><figcaption>保护区候选</figcaption><img src="{i}-after.png"></figure></div><video controls preload="metadata" src="{i}.mp4"></video><details><summary>全部关键词中点</summary><img src="{i}-events.jpg"></details></section>')
(P/'verification.json').write_text(json.dumps({'reports':reports,'score':None,'listened':False},indent=2));(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>青色强调 · 保护区摆放对照</title><style>body{max-width:1400px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img,video{max-width:100%}video{display:block;width:100%;max-height:75vh;margin:20px 0}section{margin:36px 0}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>青色强调 · 保护区摆放对照</h1><p>同一保存样式r2，共同左右候选；保护区由Agent依据画面标注，不是自动识别。字体、动效、词时间、原声不变。几何建议不代替最终视觉检查；不继承原位置分数。未试听、未实时连续观看。</p>'+''.join(sections));print('PASS',reports)
