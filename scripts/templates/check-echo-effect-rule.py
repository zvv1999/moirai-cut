from pathlib import Path
import json, hashlib, subprocess, urllib.request, shutil, io
from PIL import Image, ImageDraw
ROOT=Path('/Users/zhengwei/Downloads/echo-effect-rule-20260929')
BASE='http://127.0.0.1:3000/api/footage/templates'
FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
def api(path):
    with urllib.request.urlopen(BASE+path,timeout=60) as r:return json.load(r)
def frame(path,t):
    return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(path),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
def pcm(path):return subprocess.check_output([FF,'-v','error','-i',str(path),'-vn','-ac','2','-ar','16000','-f','s16le','-'])
def elts(f):return [e for s in f['compilation']['document']['scenes'] for t in s['tracks']['overlay'] for e in t['elements']]
def main(f):return [e for e in elts(f) if e['params']['template.elementId']=='headline']
def sig(e):return [e['params']['content'],e['startTime'],e['duration']]
def keys(v):return [{k:x for k,x in a.items() if k!='id'} for a in v]
batch_id=json.loads((ROOT/'submission.json').read_text())['id'];batch=api('/production/'+batch_id)
assert batch['renderJob']['status']=='succeeded'
items=[api('/production/'+batch_id+'/items/'+str(i)) for i in [0,1]]
for i,item in enumerate(items):(ROOT/f'item-{i}.json').write_text(json.dumps(item,indent=2))
reports=[]
for n in range(4):
    a,b=[i['output']['fixtures'][n] for i in items]
    assert {k:v for k,v in a['request']['input'].items() if k!='template'}=={k:v for k,v in b['request']['input'].items() if k!='template'}
    assert list(map(sig,main(a)))==list(map(sig,main(b)))
    all_new=elts(b);assert len(all_new)==len(main(b))*3
    for headline in main(b):
        companions=[e for e in all_new if e['startTime']==headline['startTime'] and e['duration']==headline['duration']]
        assert len(companions)==3
        for e in companions:
            assert sig(e)==sig(headline)
            for k in ['fontSize','fontFamily','fontWeight','text.maxLines','text.maxWidth','text.maxHeight']:
                assert e['params'][k]==headline['params'][k]
            for k in ['transform.scaleX','transform.scaleY']:
                assert keys(e['animations'][k]['keys'])==keys(headline['animations'][k]['keys'])
    paths=[]
    for i,item in enumerate(items):
        p=next(p for p in item['previews'] if p['fixture']==n);src=Path(p['path'])
        assert hashlib.sha256(src.read_bytes()).hexdigest()==p['sha256']
        assert p['decodeVerified'] and p['audioQuality']['validated']
        dst=ROOT/f'preview-{i}-{n}.mp4';shutil.copy2(src,dst);paths.append(dst)
    assert pcm(paths[0])==pcm(paths[1])
    for phase in ['entry','hold']:
        sheet=Image.new('RGB',(960,len(main(b))*295),'#182127');draw=ImageDraw.Draw(sheet)
        for j,e in enumerate(main(b)):
            t=e['startTime']/120000+(.04 if phase=='entry' else e['duration']/240000)
            for i,path in enumerate(paths):
                im=frame(path,t);im.save(ROOT/f'{phase}-{n}-{j}-{i}.png');im.thumbnail((480,270));sheet.paste(im,(i*480,j*295+25));draw.text((i*480+6,j*295+5),f'{["r3","r4"][i]} {t:.3f}s',fill='white')
        sheet.save(ROOT/f'{phase}-{n}.jpg')
    shortest=min(main(b),key=lambda e:e['duration']);first=max(0,int(shortest['startTime']/4000)-2);last=int((shortest['startTime']+shortest['duration'])/4000)+3
    subprocess.run([FF,'-v','error','-y','-i',str(paths[1]),'-vf',f"select=between(n\\,{first}\\,{last}),crop=660:300:0:0,scale=400:-1,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='%{{pts}}':fontsize=12:fontcolor=white:box=1:boxcolor=black:x=5:y=5,tile=6x{(last-first+6)//6}",'-frames:v','1',str(ROOT/f'shortest-{n}.jpg')],check=True)
    reports.append({'fixture':n,'eventCount':len(main(b)),'wordsAndTimingPreserved':True,'audioPcmPreserved':True,'allThreeLayersSameTypographyAndScale':True,'shortestText':shortest['params']['content'],'shortestSeconds':shortest['duration']/120000})
saved=json.loads((ROOT/'saved.json').read_text());assert api('/dynamic-assets/'+saved['id'])['definition']==saved
(ROOT/'export-verification.json').write_text(json.dumps({'passed':True,'batchId':batch_id,'revision':saved['revision'],'reports':reports,'listened':False},ensure_ascii=False,indent=2))
print(json.dumps(reports))
