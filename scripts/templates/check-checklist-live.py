from pathlib import Path
import os,json,urllib.request,subprocess,hashlib,shutil,io,math,html
from PIL import Image,ImageDraw
P=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/checklist-live-20260930'));BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(p):return json.load(urllib.request.urlopen(BASE+p))
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def flat(ts):
 out=[]
 for t in ts:
  for e in t['elements']:out.append(e);out.extend(flat(e.get('renderGroup',{}).get('tracks',[])))
 return out
b=api('/production/'+json.load(open(P/'submission.json'))['id']);assert b['renderJob']['status']=='succeeded',b['renderJob'];inputs=json.load(open(P/'inputs.json'));manifest=json.load(open(P/'manifest.json'));definition=json.load(open(P/'definition.json'));assert api('/dynamic-assets/'+definition['id'])['definition']==definition;reports=[];sections=[]
item=api('/production/'+b['id']+'/items/0');assert item['status']=='published';(P/'item.json').write_text(json.dumps(item,indent=2))
for i,inp in enumerate(inputs):
 words=inp["transcript"]["words"];kw=manifest["samples"][i]["semanticUnits"][0]["keyword"];start=words[kw["startWord"]]["start"] if kw else 0;end=words[kw["endWord"]-1]["end"] if kw else min(1,inp["input"]["durationSeconds"])
 f=item['output']['fixtures'][i];assert f['request']['input']['words']==words;es=flat(f['compilation']['document']['scenes'][0]['tracks']['overlay']);groups=[e for e in es if e.get('renderGroup')];notes=[g for g in groups if any(e['type']=='graphic'for e in flat(g['renderGroup']['tracks']))];assert len(notes)==(1 if kw else 0)
 if kw:
  g=notes[0];assert len(flat(g['renderGroup']['tracks']))==20;assert abs(g['startTime']/120000-start)<1e-5 and abs((g['startTime']+g['duration'])/120000-end)<1e-5
 texts=[e for e in es if e['type']=='text'];caption=[e for e in texts if e.get('params',{}).get('template.elementId')=='headline'];assert len(caption)==len(manifest["samples"][i]["captionSpans"] or f["compilation"]["plan"]["captions"]),(len(caption),[e.get('params',{}).get('template.elementId')for e in texts]);assert ''.join(e['params']['content']for e in sorted(caption,key=lambda e:e['startTime'])).replace(' ','')==''.join(w['text']for w in words).replace(' ','')
 p=next(p for p in item['previews'] if p['fixture']==i);assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];out=P/f'{i}.mp4';shutil.copy2(p['path'],out);frame(out,(start+end)/2).save(P/f'{i}-hold.png');sheet=Image.new('RGB',(960,math.ceil(len(caption)/3)*300),'#17212a');d=ImageDraw.Draw(sheet)
 for k,e in enumerate(sorted(caption,key=lambda e:e['startTime'])):
  t=(e['startTime']+e['duration']*.5)/120000;im=frame(out,t);im.thumbnail((320,275));sheet.paste(im,((k%3)*320,(k//3)*300+25));d.text(((k%3)*320+5,(k//3)*300+5),f'{t:.2f}s',fill='white')
 sheet.save(P/f'{i}-captions.jpg',quality=95);times=[t/30 for t in range(max(0,math.floor(start*30)-1),math.ceil(end*30)+2)];sheet=Image.new('RGB',(1000,math.ceil(len(times)/5)*270),'#17212a');d=ImageDraw.Draw(sheet)
 for k,t in enumerate(times):
  im=frame(out,t);im.thumbnail((200,245));sheet.paste(im,((k%5)*200,(k//5)*270+25));d.text(((k%5)*200+5,(k//5)*270+5),f'{t:.3f}s',fill='white')
 sheet.save(P/f'{i}-sequence.jpg',quality=95);reports.append({'fixture':i,'fullCaptionCoverage':True,'checklistInstances':len(notes),'keywordStart':start if kw else None,'keywordEnd':end if kw else None,'sha256':p['sha256']});sections.append(f'<h2>{html.escape(manifest["samples"][i]["title"])}</h2><video controls preload="metadata" src="{i}.mp4"></video><img src="{i}-hold.png"><details><summary>字幕与动效检查帧</summary><img src="{i}-captions.jpg"><img src="{i}-sequence.jpg"></details>')
attached=any(r.get('relativeTo')=='headline' and r.get('referenceBounds')=='text_box' for r in manifest['designs'][0]['template'].get('composition',{}).get('spatialRelations',[]))
directions={r.get('placement') for r in manifest['designs'][0]['template'].get('composition',{}).get('spatialRelations',[]) if r.get('relativeTo')=='headline'}
placement=('清单依附字幕实测边界'+('上方' if directions=={'above'} else '左侧')+'；关键词由Agent依据原文标注，并非自动检测。') if attached else '关键词和右上位置由Agent根据原文及画面选择，并非自动检测。'
(P/'verification.json').write_text(json.dumps({'technicalChecksPassed':True,'reports':reports,'listened':False,'score':None},indent=2));(P/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>行动清单 · 实拍应用</title><style>body{max-width:1100px;margin:auto;padding:24px;background:#17212a;color:#eee;font:16px system-ui}video{width:100%;max-height:75vh}img{max-width:100%;max-height:80vh}</style><h1>行动清单 · 语义触发对照</h1><p>完整逐词字幕；仅在输入明确标注的关键词时段出现清单，无标注的片段不生成装饰。'+placement+'未试听，未授予90分。</p>'+''.join(sections));print('PASS',len(reports),'full-caption exports; checklist instances', [r['checklistInstances'] for r in reports])
