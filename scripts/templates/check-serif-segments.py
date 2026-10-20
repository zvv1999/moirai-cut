import hashlib
import io
import json
import shutil
import subprocess
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path('/Users/zhengwei/Downloads/serif-segments-20260929')
BASE='http://127.0.0.1:3000/api/footage/templates'
FFMPEG='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(path):
    with urllib.request.urlopen(BASE+path,timeout=60) as r:return json.load(r)
def pcm(path):
    return subprocess.check_output([FFMPEG,'-v','error','-i',str(path),'-vn','-ac','2','-ar','16000','-f','s16le','-'])
def frame(path,t):
    return Image.open(io.BytesIO(subprocess.check_output([FFMPEG,'-v','error','-ss',str(t),'-i',str(path),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
items=[]
for label in ['before','reviewed']:
    folder=ROOT/label;submission=json.loads((folder/'submission.json').read_text());batch=api('/production/'+submission['id'])
    assert batch['renderJob']['status']=='succeeded',batch['renderJob']
    item=api('/production/'+submission['id']+'/items/0');items.append(item)
    (folder/'item.json').write_text(json.dumps(item,indent=2));(folder/'batch.json').write_text(json.dumps(batch,indent=2))
folder=ROOT/'predicate'
submission=json.loads((folder/'submission.json').read_text())
batch=api('/production/'+submission['id'])
assert batch['renderJob']['status']=='succeeded',batch['renderJob']
predicate=api('/production/'+submission['id']+'/items/0')
(folder/'item.json').write_text(json.dumps(predicate,indent=2))
(folder/'batch.json').write_text(json.dumps(batch,indent=2))
(ROOT/'final').mkdir(exist_ok=True)
reports=[]
for fixture in range(4):
    final_item=predicate if fixture==0 else items[1]
    final_fixture=0 if fixture==0 else fixture
    outputs=[items[0]['output']['fixtures'][fixture],final_item['output']['fixtures'][final_fixture]]
    original, revised=[o['request']['input'] for o in outputs]
    allowed={'template','captionSpans','captionPolicy'}
    assert {k:v for k,v in original.items() if k not in allowed}=={k:v for k,v in revised.items() if k not in allowed}
    a,b=[o['compilation']['plan']['captions'] for o in outputs]
    words=revised['words'];cursor=0
    for cue in b:
        span=cue['wordSpan'];assert span['startWord']==cursor
        assert abs(cue['start']-words[cursor]['start'])<1e-8
        assert abs(cue['end']-words[span['endWord']-1]['end'])<1e-8
        cursor=span['endWord']
    assert cursor==len(words)
    assert all(c['end']-c['start']>=.6 for c in b)
    paths=[]
    for label,item,index in [('before',items[0],fixture),('final',final_item,final_fixture)]:
        p=next(p for p in item['previews'] if p['fixture']==index)
        path=Path(p['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==p['sha256']
        assert p['decodeVerified'] and p['audioQuality']['validated']
        shutil.copy2(path,ROOT/label/f'preview-{fixture}.mp4');paths.append(path)
    assert pcm(paths[0])==pcm(paths[1])
    sheet=Image.new('RGB',(960,len(b)*300),'#151a20');draw=ImageDraw.Draw(sheet)
    for row,cue in enumerate(b):
        t=(cue['start']+cue['end'])/2
        for col,path in enumerate(paths):
            im=frame(path,t);im.save(ROOT/f'{fixture}-{row}-{col}.png');im.thumbnail((480,270));sheet.paste(im,(col*480,row*300+25));draw.text((col*480+6,row*300+5),f'{["original","reviewed"][col]} {t:.3f}s',fill='white')
    sheet.save(ROOT/f'{fixture}-captions.jpg')
    reports.append({'fixture':fixture,'beforeCount':len(a),'afterCount':len(b),'beforeMaxCharacters':max(len(c['text']) for c in a),'afterMaxCharacters':max(len(c['text']) for c in b),'minCueSeconds':min(c['end']-c['start'] for c in b),'allWordsCoveredOnce':True,'originalWordTimesAndPcmPreserved':True,'captions':[{'text':c['text'],'start':c['start'],'end':c['end'],'warnings':c['warnings']}for c in b]})
asset=json.loads((ROOT/'before/asset.json').read_text());assert api('/dynamic-assets/'+asset['id'])['definition']==asset
(ROOT/'verification.json').write_text(json.dumps({'passed':True,'reports':reports,'savedStyleUnchanged':True,'listened':False},ensure_ascii=False,indent=2))
print(json.dumps([{k:v for k,v in r.items() if k!='captions'}for r in reports]))
