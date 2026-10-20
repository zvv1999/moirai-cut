from pathlib import Path
import os,json,urllib.request,subprocess,hashlib,shutil,io,math
from array import array
from PIL import Image,ImageDraw
full=os.environ.get('SOURCE_FULL')=='1';P=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/chinese-growth-original-20260929'if full else'/Users/zhengwei/Downloads/chinese-growth-cue-20260929'));BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(p):
 values=array('f');values.frombytes(subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-af','pan=mono|c0=c0','-ar','44100','-f','f32le','-']));return values
source=Path('/Users/zhengwei/Desktop/lQbPJxxvcYaRvuMAALCYyhqserGknAp5bBXir10A.mp4')if full else P/'source.mp4';original=json.load(open(P/'input.json'));assert hashlib.sha256(source.read_bytes()).hexdigest()==original['input']['sha256']
batch=api('/production/'+json.load(open(P/'submission.json'))['id']);assert batch['renderJob']['status']=='succeeded',batch['renderJob'];item=api('/production/'+batch['id']+'/items/0');assert item['status']=='published';(P/'item.json').write_text(json.dumps(item,indent=2));fixture=item['output']['fixtures'][0];req=fixture['request']['input'];assert req['words']==original['transcript']['words'];es=[e for t in fixture['compilation']['document']['scenes'][0]['tracks']['overlay']for e in t['elements']];groups=[e for e in es if e.get('renderGroup')];assert len(groups)==1;g=groups[0];children=[e for t in g['renderGroup']['tracks']for e in t['elements']];assert children and all(e['type']=='graphic'for e in children);assert len(es)==1
start=original['transcript']['words'][28]['start'];end=original['transcript']['words'][34]['end'];assert abs(g['startTime']/120000-start)<1e-5;assert abs((g['startTime']+g['duration'])/120000-end)<1e-5
p=item['previews'][0];assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/'preview.mp4';shutil.copy2(p['path'],out)
# Compare the same channel at the native rate: FFmpeg stereo-to-mono downmix
# otherwise introduces sqrt(2) gain relative to a mono source.
a,b=pcm(source),pcm(out)
def compare(lag):
 n=min(len(a),len(b)-lag);x=a[:n];y=b[lag:lag+n]
 aa=sum(v*v for v in x);bb=sum(v*v for v in y);ab=sum(u*v for u,v in zip(x,y));sa=sum(x);sb=sum(y)
 return {'lagSamples':lag,'lagMilliseconds':lag/44.1,'correlation':(ab-sa*sb/n)/math.sqrt((aa-sa*sa/n)*(bb-sb*sb/n)),'gain':ab/aa,'normalizedError':math.sqrt(sum((u-v)**2 for u,v in zip(x,y))/aa)}
zero=compare(0)
# Diagnostic only. A shifted comparison must not silently pass source alignment.
aligned=compare(64)
correlation=zero['correlation'];normalized_error=zero['normalizedError']
audio_exact_alignment=correlation>.99
print('audio diagnostics',zero,aligned)

mid=(start+end)/2
for label,src in [('before',source),('after',out)]:frame(src,mid).save(P/f'{label}.png')
times=[t/30 for t in range(math.floor(start*30)-1,math.ceil(end*30)+2)];sheet=Image.new('RGB',(960,math.ceil(len(times)/6)*225),'#17212a');d=ImageDraw.Draw(sheet)
for i,t in enumerate(times):
 im=frame(out,t).crop((0,0,250,310));im.thumbnail((160,200));sheet.paste(im,((i%6)*160,(i//6)*225+25));d.text(((i%6)*160+4,(i//6)*225+5),f'{t:.3f}s',fill='white')
sheet.save(P/'sequence.jpg',quality=95)
(P/'verification.json').write_text(json.dumps({'passed':audio_exact_alignment,'visualStructurePassed':True,'sourceAudioAlignmentPassed':audio_exact_alignment,'audioZeroLag':zero,'audioAt64SampleLag':aligned,'originalFileHashMatched':True,'oneGraphicGroup':True,'noNewText':True,'start':start,'end':end,'audioCorrelation':correlation,'audioNormalizedError':normalized_error,'sampleCountDelta':len(b)-len(a),'audioReencoded':True,'listened':False,'score':None},indent=2));print('STRUCTURE PASS; audio alignment:',audio_exact_alignment,start,end,'audio correlation',correlation,'error',normalized_error)
project=item['fixtureProjects'][0]['projectId'];(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>中文口播 · 增长提示</title><style>body{max-width:1000px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}video{max-height:75vh;width:100%}img{max-width:100%}.pair{display:flex;gap:12px}.pair img{width:48%}</style><h1>中文口播 · 增长提示</h1><p>'+('与桌面原文件哈希一致的75秒原片。'if full else'之前制作的12秒字幕试作片段。')+'保留视频已有字幕，在“小达人突然崛起”词段叠加增长动图。语义与保护框由Agent标注，非自动识别；未试听，未评分。'+('本次导出零偏移波形检查通过；未试听。' if audio_exact_alignment else '原片版音频发现约1.45毫秒固定偏移，尚未通过严格原声对齐验收。')+'</p><video controls preload="metadata" src="preview.mp4"></video><p><a href="http://127.0.0.1:3000/editor/'+project+'">打开独立可编辑样例</a></p><div class="pair"><img src="before.png"><img src="after.png"></div><details><summary>完整事件连续帧</summary><img src="sequence.jpg"></details>')
