from pathlib import Path
import numpy as np,subprocess,json
P=Path('/Users/zhengwei/Downloads/source-audio-alignment-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';src='/Users/zhengwei/Desktop/lQbPJxxvcYaRvuMAALCYyhqserGknAp5bBXir10A.mp4'
a=np.frombuffer(subprocess.check_output([FF,'-v','error','-i',src,'-t','6','-vn','-af','pan=mono|c0=c0','-f','f32le','-']),dtype='<f4').astype(float)
reports=[]
for name in ['mediabunny','decodeAudioData']:
 b=np.fromfile(P/(name+'.f32'),dtype='<f4').astype(float);start=44100;n=44100*3
 def compare(lag):
  x=a[start:start+n];y=b[start+lag:start+lag+n]
  return {'lagSamples':lag,'correlation':float(np.corrcoef(x,y)[0,1]),'gain':float(x@y/(x@x)),'normalizedError':float(np.linalg.norm(x-y)/np.linalg.norm(x))}
 scans=[compare(l)for l in range(-200,201)];best=max(scans,key=lambda v:v['correlation']);reports.append({'decoder':name,'zero':compare(0),'best':best})
(P/'decoder-comparison.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports,indent=2))
