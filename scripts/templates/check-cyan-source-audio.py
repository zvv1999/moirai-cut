from pathlib import Path
import json,urllib.request,subprocess,hashlib,numpy as np
P=Path('/Users/zhengwei/Downloads/cyan-protected-placement-20260930');OLD=Path('/Users/zhengwei/Downloads/cyan-natural-real-2026-09-29');BASE='http://127.0.0.1:3000/api/footage/templates';FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def pcm(p):return np.frombuffer(subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-af','pan=mono|c0=c0','-ar','44100','-f','f32le','-']),dtype='<f4').astype(float)
reports=[]
for i,s in enumerate(json.load(open(OLD/'designs.json'))['samples']):
 inp=json.load(urllib.request.urlopen(BASE+'/inputs/'+s['inputId']));src=P/f'{i}-source';urllib.request.urlretrieve(BASE+'/inputs/'+s['inputId']+'/media/original',src);assert hashlib.sha256(src.read_bytes()).hexdigest()==inp['input']['sha256'];a=pcm(src);words=inp['transcript']['words'];times=[words[0]['start']+.3,(words[0]['start']+words[-1]['end'])/2,words[-1]['end']-.6];record={'fixture':i,'sourceHashVerified':True}
 for label,p in [('current',P/f'{i}.mp4'),('legacy',OLD/f'preview-{i}.mp4')]:
  b=pcm(p);windows=[]
  for t in times:
   at=round(t*44100);n=11025;x=a[at:at+n]
   def metrics(lag):
    y=b[at+lag:at+lag+n];return {'lagSamples':lag,'correlation':float(np.corrcoef(x,y)[0,1]),'normalizedError':float(np.linalg.norm(x-y)/np.linalg.norm(x))}
   best=max((metrics(lag)for lag in range(-128,129)),key=lambda d:d['correlation']);windows.append({'seconds':t,'zero':metrics(0),'best':best})
  record[label]=windows
 reports.append(record)
(P/'audio-source-verification.json').write_text(json.dumps(reports,indent=2));print([{ 'fixture':r['fixture'],'currentLags':[w['best']['lagSamples']for w in r['current']],'legacyLags':[w['best']['lagSamples']for w in r['legacy']],'minCurrentCorrelation':min(w['zero']['correlation']for w in r['current'])}for r in reports]);assert all(w['best']['lagSamples']==0 and w['zero']['correlation']>.99 for r in reports for w in r['current'])
