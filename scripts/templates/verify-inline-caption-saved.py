import json,hashlib,subprocess,shutil,urllib.request
from pathlib import Path
r=Path('/Users/zhengwei/Downloads/inline-caption-saved-20260929');old=Path('/Users/zhengwei/Downloads/inline-keyword-caption-20260929');base='http://127.0.0.1:3000/api/footage/templates';ff='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
batch=json.load(urllib.request.urlopen(base+'/production/'+json.loads((r/'submission.json').read_text())['id']));assert batch['renderJob']['status']=='succeeded',batch['renderJob'];item=json.load(urllib.request.urlopen(base+'/production/'+batch['id']+'/items/0'));(r/'batch.json').write_text(json.dumps(batch,indent=2));(r/'item-0.json').write_text(json.dumps(item,indent=2));records=[]
def frames(path):
 result=subprocess.run([ff,'-v','error','-i',str(path),'-map','0:v:0','-f','framemd5','-'],capture_output=True,check=True).stdout.decode();return [line for line in result.splitlines()if line and not line.startswith('#')]
def pcm(path):return hashlib.sha256(subprocess.run([ff,'-v','error','-i',str(path),'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','-'],capture_output=True,check=True).stdout).hexdigest()
for p in batch['items'][0]['previews']:
 f=p['fixture'];video=Path(p['path']);assert p['decodeVerified'] and p['audioQuality']['validated'];assert hashlib.sha256(video.read_bytes()).hexdigest()==p['sha256'];shutil.copy2(video,r/f'preview-{f}.mp4')
 before=frames(old/f'preview-{f}.mp4');after=frames(video);assert before==after,f'Frame mismatch in fixture {f}'
 oldpcm=pcm(old/f'preview-{f}.mp4');newpcm=pcm(video);assert oldpcm==newpcm,f'Audio PCM mismatch in fixture {f}'
 records.append({'fixture':f,'sha256':p['sha256'],'decodedFrames':len(after),'everyDecodedFrameIdentical':True,'decodedPcmIdentical':True,'decodedPcmSha256':newpcm})
(r/'verification.json').write_text(json.dumps({'passed':True,'application':json.loads((r/'application.json').read_text()),'batchId':batch['id'],'records':records,'listened':False,'continuousPerceptualPlayback':False,'score':None},indent=2));print('PASS exact decoded video/audio equality for',len(records),'saved-style exports;',sum(v['decodedFrames']for v in records),'video frames')
