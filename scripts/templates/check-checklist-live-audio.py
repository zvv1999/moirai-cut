from pathlib import Path
import os,json,subprocess,hashlib,numpy as np
P=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/checklist-live-20260930'));SOURCE=Path('/Users/zhengwei/Downloads/editorial-cross-input-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';reports=[]
def pcm(p):return np.frombuffer(subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-af','pan=mono|c0=c0','-ar','44100','-f','f32le','-']),dtype='<f4').astype(float)
for i,inp in enumerate(json.load(open(P/'inputs.json'))):
 source=[Path('/Users/zhengwei/Downloads/growth-headline-live-20260929/source.mp4'),SOURCE/'source-0.mp4',SOURCE/'source-2.mp4'][i];assert hashlib.sha256(source.read_bytes()).hexdigest()==inp['input']['sha256'];a,b=pcm(source),pcm(P/f'{i}.mp4');words=inp['transcript']['words'];start=words[0]['start'];end=words[-1]['end'];windows=[]
 for t in [start+.3,(start+end)/2,end-.6]:
  at=round(t*44100);n=11025;x=a[at:at+n]
  def metrics(lag):
   y=b[at+lag:at+lag+n];return {'lagSamples':lag,'correlation':float(np.corrcoef(x,y)[0,1]),'normalizedError':float(np.linalg.norm(x-y)/np.linalg.norm(x))}
  zero=metrics(0);best=max((metrics(lag)for lag in range(-128,129)),key=lambda d:d['correlation']);windows.append({'seconds':t,'zero':zero,'best':best})
 reports.append({'fixture':i,'windows':windows})
(P/'audio-alignment.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports,indent=2))
assert all(w['best']['lagSamples']==0 and w['zero']['correlation']>.99 for r in reports for w in r['windows'])
