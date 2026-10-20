from pathlib import Path
import os,json,urllib.request,subprocess,hashlib,shutil,io,math,html
from PIL import Image,ImageDraw
P=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/note-caption-20260929'));BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
def flat(ts):
 out=[]
 for t in ts:
  for e in t['elements']:out.append(e);out.extend(flat(e.get('renderGroup',{}).get('tracks',[])))
 return out
b=api('/production/'+json.load(open(P/'submission.json'))['id']);assert b['renderJob']['status']=='succeeded',b['renderJob'];inputs=json.load(open(P/'inputs.json'));manifest=json.load(open(P/'manifest.json'));definition=json.load(open(P/'definition.json'));assert api('/dynamic-assets/'+definition['id'])['definition']==definition
item=api('/production/'+b['id']+'/items/0');assert item['status']=='published';(P/'item.json').write_text(json.dumps(item,indent=2));reports=[];sections=[]
for i,inp in enumerate(inputs):
 words=inp['transcript']['words'];f=item['output']['fixtures'][i];assert f['request']['input']['words']==words;es=flat(f['compilation']['document']['scenes'][0]['tracks']['overlay']);groups=sorted([e for e in es if e.get('renderGroup')],key=lambda e:e['startTime']);spans=manifest['samples'][i]['captionSpans'];assert len(groups)==len(spans)
 texts=[]
 for g,span in zip(groups,spans):
  children=flat(g['renderGroup']['tracks']);assert len(children)==3;ts=[e for e in children if e['type']=='text'];assert len(ts)==1;texts+=ts
  assert abs(g['startTime']/120000-words[span['startWord']]['start'])<1e-5
  assert abs((g['startTime']+g['duration'])/120000-words[span['endWord']-1]['end'])<1e-5
 assert ''.join(e['params']['content']for e in texts).replace(' ','')==''.join(w['text']for w in words).replace(' ','')
 p=next(p for p in item['previews']if p['fixture']==i);assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/f'{i}.mp4';shutil.copy2(p['path'],out);assert pcm(out)==pcm(Path('/Users/zhengwei/Downloads/note-paper-live-20260929')/f'{i}.mp4')
 sheet=Image.new('RGB',(1280,math.ceil(len(groups)/2)*390),'#17212a');draw=ImageDraw.Draw(sheet)
 for k,g in enumerate(groups):
  t=(g['startTime']+g['duration']*.5)/120000;im=frame(out,t);im.save(P/f'{i}-{k}-hold.png');im.thumbnail((640,360));sheet.paste(im,((k%2)*640,(k//2)*390+30));draw.text(((k%2)*640+5,(k//2)*390+5),f'{t:.2f}s',fill='white')
 sheet.save(P/f'{i}-captions.jpg',quality=95);reports.append({'fixture':i,'captionCount':len(groups),'wordCoverage':True,'cueTimingPreserved':True,'exportPcmUnchanged':True,'sha256':p['sha256']});sections.append(f'<h2>{html.escape(manifest["samples"][i]["title"])}</h2><video controls preload="metadata" src="{i}.mp4"></video><img src="{i}-captions.jpg">')
(P/'verification.json').write_text(json.dumps({'technicalChecksPassed':True,'reports':reports,'listened':False,'score':None},indent=2));(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>便签正文 · 实拍字幕</title><style>body{max-width:1280px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}video,img{width:100%}video{max-height:75vh}</style><h1>便签正文 · 实拍字幕</h1><p>同一左对齐便签字幕覆盖三段原文，去掉角落重复重点词。保留词时间和前版导出音频。未试听，未授予90分；底部遮挡仍需审查。</p>'+''.join(sections));print('PASS',reports)
