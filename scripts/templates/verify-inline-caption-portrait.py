import json,subprocess,hashlib,shutil,urllib.request,os
from pathlib import Path
from PIL import Image,ImageDraw
blurred=os.environ.get('BLURRED_BACKGROUND')=='1'
r=Path('/Users/zhengwei/Downloads/inline-caption-portrait-blur-20260929' if blurred else '/Users/zhengwei/Downloads/inline-caption-portrait-20260929');old=Path('/Users/zhengwei/Downloads/inline-caption-saved-20260929');base='http://127.0.0.1:3000/api/footage/templates';ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
batch_id=json.loads((r/'submission.json').read_text())['id'];batch=json.load(urllib.request.urlopen(base+'/production/'+batch_id));assert batch['renderJob']['status']=='succeeded',batch['renderJob'];item=json.load(urllib.request.urlopen(base+'/production/'+batch_id+'/items/0'));(r/'batch.json').write_text(json.dumps(batch,indent=2));(r/'item-0.json').write_text(json.dumps(item,indent=2));before=json.loads((old/'item-0.json').read_text());records=[];cue_records=[]
def pcm(path):return hashlib.sha256(subprocess.run([ff,'-v','error','-i',str(path),'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','-'],capture_output=True,check=True).stdout).hexdigest()
for preview in batch['items'][0]['previews']:
 i=preview['fixture'];source=Path(preview['path']);assert preview['decodeVerified'] and preview['audioQuality']['validated'];assert hashlib.sha256(source.read_bytes()).hexdigest()==preview['sha256'];video=r/f'preview-{i}.mp4';shutil.copy2(source,video)
 f=item['output']['fixtures'][i];old_f=before['output']['fixtures'][i];plan=f['compilation']['plan'];old_plan=old_f['compilation']['plan'];assert plan['words']==old_plan['words']
 cues=plan['captions'];assert [{k:c[k]for k in ['text','start','end','wordSpan']}for c in cues]==[{k:c[k]for k in ['text','start','end','wordSpan']}for c in old_plan['captions']]
 tracks=f['compilation']['document']['scenes'][0]['tracks']
 foreground=[e for t in tracks['overlay'] for e in t['elements'] if e['type']=='video'] if blurred else tracks['main']['elements']
 if blurred:
  assert len(foreground)==1
  assert tracks['main']['elements'][0]['effects'][0]['type']=='blur'
  assert len([e for t in tracks['audio'] for e in t['elements']])==1
 for e in foreground:
  for edge in ['top','left','bottom','right']:assert e['params']['crop.'+edge]==0
  assert e['params']['transform.scaleX']==1 and e['params']['transform.scaleY']==1
 assert pcm(video)==pcm(old/f'preview-{i}.mp4')
 sheet=Image.new('RGB',(720,180*len(cues)),'#182027');draw=ImageDraw.Draw(sheet)
 for j,cue in enumerate(cues):
  t=(cue['start']+cue['end'])/2;frame=r/f'fixture-{i}-cue-{j}.png';subprocess.run([ff,'-v','error','-y','-ss',str(t),'-i',str(video),'-frames:v','1',str(frame)],check=True);im=Image.open(frame);assert im.size==(720,1280)
  draw.text((8,j*180+4),f'{cue["start"]:.2f}-{cue["end"]:.2f}s | {cue["text"]}',fill='white');sheet.paste(im.crop((0,725,720,875)),(0,j*180+30));cue_records.append({'fixture':i,'cue':j,'time':t,'image':frame.name,'text':cue['text']})
 sheet.save(r/f'fixture-{i}-sheet.jpg',quality=95);records.append({'fixture':i,'sha256':preview['sha256'],'pcmMatchesLandscape':True,'wordsAndCaptionIntervalsPreserved':True,'sourceCropZero':True,'captionCount':len(cues)})
(r/'verification.json').write_text(json.dumps({'passed':True,'batchId':batch_id,'canvas':[720,1280],'sourceRegionPixels':[0,320,720,405],'records':records,'frames':cue_records,'portraitSource':False,'blurredBackground':blurred,'listened':False,'continuousPlayback':False,'score':None},indent=2));print('PASS three portrait outputs, source framing, words/cues and PCM preservation;',len(cue_records),'cue frames')
