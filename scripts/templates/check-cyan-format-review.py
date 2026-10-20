"""Inspect exact exported cyan-style samples; does not assign aesthetic scores."""
from pathlib import Path
import json, urllib.request, hashlib, shutil, subprocess, os
from PIL import Image, ImageDraw
root=Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/cyan-formats-20260929'))
base='http://127.0.0.1:3000/api/footage/templates'
def get(path):
 return json.load(urllib.request.urlopen(base+path))
sub=json.loads((root/'submission.json').read_text());batch=get('/production/'+sub['id'])
(root/'batch.json').write_text(json.dumps(batch,ensure_ascii=False,indent=2))
if batch['renderJob']['status']!='succeeded':
 print(batch['renderJob']);raise SystemExit(2)
results=[];cells=[]
for index,summary in enumerate(batch['items']):
 item=get('/production/'+sub['id']+'/items/'+str(index));(root/f'item-{index}.json').write_text(json.dumps(item,ensure_ascii=False,indent=2))
 for preview in summary['previews']:
  assert preview['decodeVerified'] and preview['audioQuality']['validated']
  fixture=item['output']['fixtures'][preview['fixture']];inp=fixture['request']['input']
  elements=[e for scene in fixture['compilation']['document']['scenes'] for track in scene['tracks']['overlay'] for e in track['elements'] if e.get('params',{}).get('template.elementId')=='headline']
  spans=[u['keyword'] for u in inp['semanticUnits'] if u.get('keyword')]
  assert len(spans)==len(elements)
  for e,span in zip(elements,spans):
   words=inp['words'][span['startWord']:span['endWord']];assert abs(e['startTime']/120000-words[0]['start'])<=1/120000
   assert abs(e['duration']/120000-(words[-1]['end']-words[0]['start']))<=1/120000
  vid=root/f'preview-{index}-{preview["fixture"]}.mp4';shutil.copyfile(preview['path'],vid);assert hashlib.sha256(vid.read_bytes()).hexdigest()==preview['sha256']
  chosen=max(elements,key=lambda e:len(e['params']['content']));t=(chosen['startTime']+chosen['duration']/2)/120000
  frame=root/f'longest-{index}-{preview["fixture"]}.png'
  subprocess.run(['/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg','-v','error','-y','-ss',str(t),'-i',str(vid),'-frames:v','1',str(frame)],check=True)
  im=Image.open(frame).convert('RGB');im.thumbnail((426,426));cell=Image.new('RGB',(450,465),'#20242c');cell.paste(im,((450-im.width)//2,30));ImageDraw.Draw(cell).text((8,8),f'Format {index} / input {preview["fixture"]} / {t:.2f}s',fill='white');cells.append(cell)
  results.append({'item':index,'fixture':preview['fixture'],'keywordCount':len(elements),'longestText':chosen['params']['content'],'frameTime':t,'sha256':preview['sha256']})
rows=max(len(item['previews']) for item in batch['items'])
atlas=Image.new('RGB',(450*len(batch['items']),465*rows),'#20242c')
for cell,result in zip(cells,results):atlas.paste(cell,(result['item']*450,result['fixture']*465))
atlas.save(root/'longest-atlas.jpg')
(root/'verification.json').write_text(json.dumps({'results':results,'listened':False,'score':None},ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
