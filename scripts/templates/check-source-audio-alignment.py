from pathlib import Path
import json,subprocess,numpy as np
P=Path('/Users/zhengwei/Downloads/chinese-growth-audio-aligned-20260929');OLD=Path('/Users/zhengwei/Downloads/chinese-growth-original-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';src=Path('/Users/zhengwei/Desktop/lQbPJxxvcYaRvuMAALCYyhqserGknAp5bBXir10A.mp4')
def pcm(p):return np.frombuffer(subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-af','pan=mono|c0=c0','-ar','44100','-f','f32le','-']),dtype='<f4').astype(float)
a,b=pcm(src),pcm(P/'preview.mp4');reports=[]
for seconds in [1,20,50,70]:
 start=seconds*44100;n=22050;x=a[start:start+n]
 def metrics(lag):
  y=b[start+lag:start+lag+n];return {'lagSamples':lag,'correlation':float(np.corrcoef(x,y)[0,1]),'gain':float(x@y/(x@x)),'normalizedError':float(np.linalg.norm(x-y)/np.linalg.norm(x))}
 best=max((metrics(lag)for lag in range(-256,257)),key=lambda v:v['correlation']);zero=metrics(0);reports.append({'seconds':seconds,'zero':zero,'best':best});assert best['lagSamples']==0,reports[-1];assert zero['correlation']>.99 and zero['normalizedError']<.03,reports[-1]
old=json.load(open(OLD/'manifest.json'));new=json.load(open(P/'manifest.json'));old.pop('idempotencyKey');new.pop('idempotencyKey');assert old==new
result={'passed':True,'reports':reports,'unchangedProductionDefinition':True,'sourceLengthSamples':len(a),'exportLengthSamples':len(b),'listened':False,'note':'AAC is reencoded; exact PCM equality is not required. No corrective shift is applied to passing comparisons. Video-duration tail padding is reported separately.'};(P/'alignment-windows.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
