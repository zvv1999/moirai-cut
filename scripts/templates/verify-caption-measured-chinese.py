import json,subprocess,hashlib,shutil,urllib.request
from pathlib import Path
from PIL import Image,ImageDraw
r=Path('/Users/zhengwei/Downloads/caption-measured-chinese-20260929');base='http://127.0.0.1:3000/api/footage/templates';ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
inputs=json.loads((r/'inputs.json').read_text());manifest=json.loads((r/'designs.json').read_text());batch=json.load(urllib.request.urlopen(base+'/production/'+json.loads((r/'submission.json').read_text())['id']));assert batch['renderJob']['status']=='succeeded',batch['renderJob'];(r/'batch.json').write_text(json.dumps(batch,indent=2));items=[];records=[];frames=[]
def pcm(path):return hashlib.sha256(subprocess.run([ff,'-v','error','-i',str(path),'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','-'],capture_output=True,check=True).stdout).hexdigest()
for design in range(2):
 item=json.load(urllib.request.urlopen(base+'/production/'+batch['id']+'/items/'+str(design)));items.append(item);(r/f'item-{design}.json').write_text(json.dumps(item,indent=2))
 for p in batch['items'][design]['previews']:
  i=p['fixture'];source=Path(p['path']);assert p['decodeVerified'] and p['audioQuality']['validated'];assert hashlib.sha256(source.read_bytes()).hexdigest()==p['sha256'];v=r/f'preview-{design}-{i}.mp4';shutil.copy2(source,v)
  compilation=item['output']['fixtures'][i]['compilation'];plan=compilation['plan'];words=inputs[i]['transcript']['words'];assert [{k:w[k]for k in ['text','start','end']}for w in plan['words']]==[{k:w[k]for k in ['text','start','end']}for w in words]
  tracks=compilation['document']['scenes'][0]['tracks'];texts=[e for t in tracks['overlay']for e in t['elements']if e['type']=='text'];assert len(texts)==len(plan['captions']);assert len([e for t in tracks['audio']for e in t['elements']])==1
  for cue,span in zip(plan['captions'],manifest['samples'][i]['captionSpans']):
   assert cue['start']==words[span['startWord']]['start'];assert cue['end']==words[span['endWord']-1]['end'];assert cue['wordSpan']==span
  for e in texts:
   keys=e['animations']['transform.positionY']['keys'];assert keys[0]['time']==0 and keys[1]['time']==16800;assert keys[-1]['time']==e['duration']
  if design:assert pcm(v)==pcm(r/f'preview-0-{i}.mp4');assert plan['words']==items[0]['output']['fixtures'][i]['compilation']['plan']['words'];assert plan['captions']==items[0]['output']['fixtures'][i]['compilation']['plan']['captions']
  for j,cue in enumerate(plan['captions']):
   t=(cue['start']+cue['end'])/2;name=f'frame-{design}-{i}-{j}.png';subprocess.run([ff,'-v','error','-y','-ss',str(t),'-i',str(v),'-frames:v','1',str(r/name)],check=True);assert Image.open(r/name).size==(720,1280);frames.append({'design':design,'fixture':i,'cue':j,'time':t,'image':name,'text':cue['text']})
  records.append({'design':design,'fixture':i,'sha256':p['sha256'],'captionCount':len(texts),'measuredWordTimesPreserved':True,'cueBoundariesMatchWordSpans':True,'entranceSeconds':.14,'audioTracks':1,'pcmMatchesOtherStyle':True if design else None})
sheets=[]
for i in range(3):
 cues=items[0]['output']['fixtures'][i]['compilation']['plan']['captions']
 for start in range(0,len(cues),3):
  subset=cues[start:start+3];sheet=Image.new('RGB',(720,300*len(subset)),'#18232d');draw=ImageDraw.Draw(sheet)
  for j,c in enumerate(subset):
   for d in range(2):
    y=j*300+d*150;draw.text((6,y+3),f'{c["start"]:.2f}-{c["end"]:.2f}s / '+('FINE'if d==0 else 'BACKED'),fill='white');sheet.paste(Image.open(r/f'frame-{d}-{i}-{start+j}.png').crop((0,1060,720,1180)),(0,y+25))
  name=f'sheet-{i}-{start//3}.jpg';sheet.save(r/name,quality=95);sheets.append(name)
fast=items[0]['output']['fixtures'][0]['compilation']['plan']['captions'];slow=items[0]['output']['fixtures'][1]['compilation']['plan']['captions'];assert [c['text']for c in fast]==[c['text']for c in slow];assert [c['end']-c['start']for c in fast]!=[c['end']-c['start']for c in slow]
(r/'verification.json').write_text(json.dumps({'passed':True,'batchId':batch['id'],'records':records,'frames':frames,'sheets':sheets,'sameScriptDifferentMeasuredCueTimes':True,'allEntrancesFixedAt014Seconds':True,'realTtsAudio':True,'liveActionVideo':False,'listened':False,'continuousPlayback':False,'score':None},ensure_ascii=False,indent=2));print('PASS six exports, measured Chinese times, fixed entrance and identical audio between styles')
