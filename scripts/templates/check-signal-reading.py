import hashlib
import io
import json
import shutil
import subprocess
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path('/Users/zhengwei/Downloads/signal-reading-20260929/production')
BASE='http://127.0.0.1:3000/api/footage/templates'
FFMPEG='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(path):
    with urllib.request.urlopen(BASE+path,timeout=60) as r:return json.load(r)
def pcm(path):
    return subprocess.check_output([FFMPEG,'-v','error','-i',str(path),'-vn','-ac','2','-ar','16000','-f','s16le','-'])
def frame(path,t):
    return Image.open(io.BytesIO(subprocess.check_output([FFMPEG,'-v','error','-ss',str(t),'-i',str(path),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
submission=json.loads((ROOT/'submission.json').read_text());batch=api('/production/'+submission['id'])
assert batch['renderJob']['status']=='succeeded',batch['renderJob']
(ROOT/'batch.json').write_text(json.dumps(batch,indent=2))
items=[api('/production/'+submission['id']+'/items/'+str(i)) for i in range(2)]
for i,item in enumerate(items):(ROOT/f'item-{i}.json').write_text(json.dumps(item,indent=2))
results=[]
for fixture in range(3):
    outputs=[item['output']['fixtures'][fixture] for item in items]
    inputs=[o['request']['input'] for o in outputs]
    assert {k:v for k,v in inputs[0].items() if k!='template'}=={k:v for k,v in inputs[1].items() if k!='template'}
    elements=[[e for scene in o['compilation']['document']['scenes'] for track in scene['tracks']['overlay'] for e in track['elements']] for o in outputs]
    def identity(es):return sorted([(e['params']['template.elementId'],e.get('content'),e['startTime'],e['duration']) for e in es])
    assert identity(elements[0])==identity(elements[1])
    headlines=sorted([e for e in elements[1] if e['params']['template.elementId']=='headline'],key=lambda e:e['startTime'])
    paths=[]
    for index,item in enumerate(items):
        preview=next(p for p in item['previews'] if p['fixture']==fixture)
        path=Path(preview['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==preview['sha256']
        assert preview['decodeVerified'] and preview['audioQuality']['validated']
        paths.append(path);shutil.copy2(path,ROOT/f'preview-{index}-{fixture}.mp4')
    assert pcm(paths[0])==pcm(paths[1])
    sheet=Image.new('RGB',(960,300*len(headlines)),'#161a20');draw=ImageDraw.Draw(sheet)
    for row,e in enumerate(headlines):
        t=(e['startTime']+e['duration']/2)/120000
        for col,path in enumerate(paths):
            im=frame(path,t);im.save(ROOT/f'{fixture}-{row}-{col}.png');im.thumbnail((480,270));sheet.paste(im,(col*480,row*300+25));draw.text((col*480+8,row*300+5),f'r{col+2} {t:.3f}s',fill='white')
    sheet.save(ROOT/f'{fixture}-midpoints.jpg')
    shortest=min(headlines,key=lambda e:e['duration']);start=shortest['startTime']/120000;end=(shortest['startTime']+shortest['duration'])/120000
    times=[start-.02,start+.033,start+.1,start+.18,(start+end)/2,end-.08,end-.033,end+.02]
    sheet=Image.new('RGB',(4*320,4*205),'#161a20');draw=ImageDraw.Draw(sheet)
    for index,path in enumerate(paths):
        for n,t in enumerate(times):
            im=frame(path,t);im.thumbnail((320,180));x=n%4*320;y=(index*2+n//4)*205;sheet.paste(im,(x,y+25));draw.text((x+7,y+5),f'r{index+2} {t:.3f}s',fill='white')
    sheet.save(ROOT/f'{fixture}-short-motion.jpg')
    results.append({'fixture':fixture,'events':len(headlines),'originalInputsAndTimesPreserved':True,'decodedPcmIdentical':True,'shortestSeconds':end-start})
(ROOT/'verification.json').write_text(json.dumps({'passed':True,'results':results,'listened':False},indent=2))
print(json.dumps(results))
