import json,pathlib,html,sys
from PIL import Image,ImageDraw
root=pathlib.Path(sys.argv[1])
m=json.loads((root/'matrix.json').read_text())
rows=[]
for i,c in enumerate(m['cases']):
 b=json.loads((root/f'{i}-before/manifest.json').read_text()); a=json.loads((root/f'{i}-after/manifest.json').read_text())
 assert sorted(r['id'] for r in a['results'])==sorted(m['styles'])
 assert [(r['id'],r['revision']) for r in b['results']]==[(r['id'],r['revision']) for r in a['results']]
 for r in a['results']:
  j=r['index']
  before=json.loads((root/f'{i}-before/{j}-preview.json').read_text());after=json.loads((root/f'{i}-after/{j}-preview.json').read_text())
  def clips(v):
   out=[]
   for track in v:
    for e in track['elements']:
     if e.get('renderGroup'):out+=clips(e['renderGroup']['tracks'])
     if e.get('params',{}).get('content'):out.append(e)
   return out
  def animation(e):
   return {name:{**track,'keys':[{k:v for k,v in key.items() if k!='id'} for key in track['keys']]} for name,track in e.get('animations',{}).items()}
  old,new=clips(before['tracks']['overlay']),clips(after['tracks']['overlay'])
  assert [(e['params']['content'],e['startTime'],e['duration'],animation(e))for e in old]==[(e['params']['content'],e['startTime'],e['duration'],animation(e)) for e in new]
  def visual_params(e):
   return {k:v for k,v in e['params'].items() if k not in ['text.layoutPhrases','template.requestHash','template.applicationKey']}
  assert [visual_params(e) for e in old]==[visual_params(e) for e in new]
  assert any(e['params'].get('text.layoutPhrases') for e in new)
  images=[f'{i}-{variant}/{j}-1.png' for variant in ['before','after']]
  rows.append(f'<section><h2>{html.escape(r["name"])} · r{r["revision"]}</h2><p>{html.escape(c["text"])} · 同排：{html.escape("、".join(c["phrases"]))}</p><div>'+''.join(f'<figure><img src="{p}"><figcaption>{label}</figcaption></figure>'for p,label in zip(images,['未标注','共享短语标注']))+'</div></section>')
 sheet=Image.new('RGB',(960,len(a['results'])*300),(28,28,30));draw=ImageDraw.Draw(sheet)
 for j in range(len(a['results'])):
  for k,variant in enumerate(['before','after']):
   im=Image.open(root/f'{i}-{variant}/{j}-1.png').convert('RGB');im.thumbnail((470,265));sheet.paste(im,(k*480,j*300+25));draw.text((k*480+8,j*300+5),f'{j} {variant}',fill='white')
 sheet.save(root/f'case-{i}.jpg')
(root/'review.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>跨样式短语排版</title><style>body{background:#18181b;color:#eee;font:16px system-ui;max-width:1200px;margin:auto;padding:24px}section{margin:30px 0}h2{font-size:19px}section div{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;background:#000}figcaption{color:#aaa}@media(max-width:600px){section div{grid-template-columns:1fr}}</style><h1>同一内容标注，跨样式复用</h1><p>多组文案 × 已保存样式。原文、字形设计和动效不改，只传入内容短语边界。合成时间的静帧对比，不是实测成片或自动语义分析验收。</p>'+''.join(rows))
(root/'verification.json').write_text(json.dumps({'comparisons':len(rows),'textTimingMotionUnchanged':True,'phraseMetadataPresent':True,'libraryUnchanged':m['libraryUnchanged']},indent=2))
