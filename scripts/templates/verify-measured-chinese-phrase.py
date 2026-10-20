import json,urllib.request,hashlib,subprocess,shutil
from pathlib import Path
from PIL import Image,ImageDraw
old=Path('/Users/zhengwei/Downloads/caption-measured-chinese-20260929');r=Path(str(old)+'-phrase');base='http://127.0.0.1:3000/api/footage/templates';ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';batch=json.load(urllib.request.urlopen(base+'/production/'+json.loads((r/'submission.json').read_text())['id']));assert batch['renderJob']['status']=='succeeded',batch['renderJob'];(r/'batch.json').write_text(json.dumps(batch,indent=2));records=[]
def pcm(p):return hashlib.sha256(subprocess.run([ff,'-v','error','-i',str(p),'-map','0:a:0','-f','s16le','-'],capture_output=True,check=True).stdout).hexdigest()
def clean(v):
 if isinstance(v,dict):return {k:clean(x)for k,x in v.items()if k not in ['id','name','template.applicationKey','template.requestHash','text.layoutPhrases']}
 if isinstance(v,list):return [clean(x)for x in v]
 return v
for d in range(2):
 item=json.load(urllib.request.urlopen(base+'/production/'+batch['id']+'/items/'+str(d)));(r/f'item-{d}.json').write_text(json.dumps(item,indent=2));before=json.loads((old/f'item-{d}.json').read_text())['output']['fixtures'][2];after=item['output']['fixtures'][0];assert before['compilation']['plan']['words']==after['compilation']['plan']['words'];assert before['compilation']['plan']['captions']==after['compilation']['plan']['captions']
 clips=lambda f:[e for t in f['compilation']['document']['scenes'][0]['tracks']['overlay']for e in t['elements']if e['type']=='text']
 a,b=clips(before),clips(after);assert clean(a)==clean(b)
 target=[e for e in b if e['params'].get('text.layoutPhrases')];assert len(target)==1;metadata=json.loads(target[0]['params']['text.layoutPhrases']);assert [metadata['content'][q['start']:q['end']]for q in metadata['ranges']]==['完成时间']
 p=batch['items'][d]['previews'][0];assert p['decodeVerified']and p['audioQuality']['validated'];assert hashlib.sha256(Path(p['path']).read_bytes()).hexdigest()==p['sha256'];video=r/f'preview-{d}.mp4';shutil.copy2(p['path'],video);assert pcm(video)==pcm(old/f'preview-{d}-2.mp4');t=(7.34+12.98)/2
 sheet=Image.new('RGB',(720,310),'#18232d');draw=ImageDraw.Draw(sheet)
 for col,v in enumerate([old/f'preview-{d}-2.mp4',video]):
  frame=r/f'phrase-{d}-{col}.png';subprocess.run([ff,'-v','error','-y','-ss',str(t),'-i',str(v),'-frames:v','1',str(frame)],check=True);draw.text((8,col*155+5),'BEFORE'if col==0 else 'WITH PHRASE HINT',fill='white');sheet.paste(Image.open(frame).crop((0,1060,720,1180)),(0,col*155+30))
 sheet.save(r/f'comparison-{d}.jpg',quality=95);records.append({'design':d,'sha256':p['sha256'],'phrase':'完成时间','onlyPhraseMetadataChanged':True,'sameWordsCuesAndMotion':True,'pcmPreserved':True})
(r/'verification.json').write_text(json.dumps({'passed':True,'records':records,'listened':False,'continuousPlayback':False,'score':None},ensure_ascii=False,indent=2));print('PASS two phrase-refined exports, only layout metadata changed, PCM identical')
