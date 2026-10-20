import sys,json,pathlib,html
from PIL import Image,ImageDraw
root=pathlib.Path(sys.argv[1]);data=json.loads((root/'verification.json').read_text());parts=[]
for row in data['reports']:
    app=json.loads((pathlib.Path(row['root'])/'application.json').read_text());asset=json.loads((pathlib.Path(row['root'])/'asset.json').read_text());tr=app['transform']
    link=f'http://127.0.0.1:3000/templates/effects/{app["assetId"]}/try?revision={app["assetRevision"]}&format=landscape&placement=full&scale={tr["scale"]}&centerX={tr["centerX"]}&centerY={tr["centerY"]}'
    for p in row['previews']:
        old_index=p.get('sourceFixture',p['fixture']);canvas=Image.new('RGB',(1280,len(p['events'])*390),'#f6f6f3');draw=ImageDraw.Draw(canvas)
        for j,event in enumerate(p['events']):
            y=j*390;draw.text((8,y+4),f'{event["time"]:.2f}s  BEFORE / AFTER',fill='black')
            paths=[pathlib.Path(row['source'])/f'frame-{old_index}-{j}.png',pathlib.Path(row['root'])/event['image']]
            for c,path in enumerate(paths):
                im=Image.open(path).convert('RGB');im.thumbnail((640,360));canvas.paste(im,(c*640,y+25))
        image=f'{row["key"]}-{p["fixture"]}-compare.jpg';canvas.save(root/image,quality=92)
        new=f'{row["key"]}/preview-{p["fixture"]}.mp4';old=(pathlib.Path(row['source'])/f'preview-{old_index}.mp4').as_uri()
        parts.append(f'<section><h2>{html.escape(asset["name"])} v{asset["revision"]} · 样例 {p["fixture"]+1}</h2><button data-src="{new}" aria-pressed="true">当前方案</button> <button data-src="{old}" aria-pressed="false">调整前</button><video controls preload="metadata" src="{new}"></video><p><a href="{link}">按此次位置在工作台试用</a></p><details><summary>全部重点词对照 · 左旧右新</summary><img src="{image}" alt="各重点词的调整前后全幅对照"></details></section>')
notes=json.loads((root/'visual-inspection.json').read_text());text=''.join('<p>'+html.escape(s)+'</p>' for s in notes['summary'])
(root/'review.html').write_text('''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>阅读样式 · 留白布局</title><style>body{font:16px system-ui;background:#f6f6f3;color:#202830;max-width:1050px;margin:24px auto;padding:0 16px}h1{font-size:26px}h2{font-size:19px}section{background:white;padding:16px;margin:24px 0;border-radius:12px}video,img{width:100%;display:block;margin:12px 0}button{padding:10px;border:1px solid #aab4bb;border-radius:6px;cursor:pointer;background:white}button[aria-pressed=true]{background:#194f42;color:white}details{margin-top:16px}</style><h1>把批注放到画面留白处</h1>'''+text+''.join(parts)+'''<script>for(const section of document.querySelectorAll('section')){let serial=0;for(const button of section.querySelectorAll('button'))button.onclick=()=>{const n=++serial,v=section.querySelector('video'),time=v.currentTime;v.pause();for(const b of section.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));v.src=button.dataset.src;v.addEventListener('loadedmetadata',()=>{if(n===serial)v.currentTime=Math.min(time,Math.max(0,v.duration-.001))},{once:true});v.load()}}</script></html>''')
print(root/'review.html')
