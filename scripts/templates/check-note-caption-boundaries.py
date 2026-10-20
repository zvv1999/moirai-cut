from pathlib import Path
import json,subprocess,io,math
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/note-caption-balanced-20260929');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
manifest=json.load(open(P/'manifest.json'));inputs=json.load(open(P/'inputs.json'));item=json.load(open(P/'item.json'));reports=[]
def frame(p,t):return Image.open(io.BytesIO(subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB')
for i,inp in enumerate(inputs):
 words=inp['transcript']['words'];spans=manifest['samples'][i]['captionSpans'];events=[(words[s['startWord']]['start'],words[s['endWord']-1]['end']) for s in spans];boundaries=sorted(set(t for e in events for t in e));duration=inp['input']['durationSeconds'];p=P/f'{i}.mp4'
 groups=[e for tr in item['output']['fixtures'][i]['compilation']['document']['scenes'][0]['tracks']['overlay'] for e in tr['elements'] if e.get('renderGroup')];assert len(groups)==len(events)
 intervals=sorted((g['startTime']/120000,(g['startTime']+g['duration'])/120000)for g in groups)
 for a,b in zip(intervals,intervals[1:]):assert a[1]<=b[0]+1e-5
 for g in groups:
  text=next(e for tr in g['renderGroup']['tracks']for e in tr['elements']if e['type']=='text')
  assert 'transform.positionX' not in text.get('animations',{})
  ys=[k['value'] for k in text['animations']['transform.positionY']['keys']]
  assert abs((max(ys)-min(ys))-4.16)<1e-5
 sheet=Image.new('RGB',(1680,100*len(boundaries)),'#17212a');draw=ImageDraw.Draw(sheet);sampled=[]
 for row,t in enumerate(boundaries):
  for col in range(7):
   at=(round(t*30)+col-3)/30
   if at<0 or at>=duration:continue
   im=frame(p,at).crop((0,520,1280,720));im.thumbnail((240,65));sheet.paste(im,(col*240,row*100+30));draw.rectangle((col*240,row*100,col*240+239,row*100+99),outline='#607080');draw.text((col*240+4,row*100+6),f'{at:.3f}s / edge {t:.2f}',fill='white');sampled.append(at)
 sheet.save(P/f'{i}-boundaries.jpg',quality=96);reports.append({'fixture':i,'cueCount':len(events),'boundaryCount':len(boundaries),'sampledFrames':len(sampled),'nonoverlappingCueInstances':True,'shortestCueSeconds':min(e-s for s,e in events),'contiguousBoundaries':[b[0]for a,b in zip(intervals,intervals[1:])if abs(a[1]-b[0])<1e-5]})
(P/'boundary-verification.json').write_text(json.dumps({'reports':reports,'inspection':'Bottom 200-pixel crops at seven 30fps timestamps around every cue boundary; not realtime continuous playback or listening.'},indent=2))
print(json.dumps(reports))
