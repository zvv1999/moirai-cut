from pathlib import Path
import json,subprocess,io,math,hashlib
from PIL import Image,ImageDraw
P=Path('/Users/zhengwei/Downloads/offset-equal-fit-20260930');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg';records=[]
def flat(ts):
 return [x for t in ts for e in t['elements'] for x in [e,*flat(e.get('renderGroup',{}).get('tracks',[]))]]
for i in range(4):
 item=json.load(open(P/str(i)/'item.json'));video=P/f'{i}.mp4';sha=hashlib.sha256(video.read_bytes()).hexdigest();assert sha==item['previews'][0]['sha256'];es=flat(item['output']['fixtures'][0]['compilation']['document']['scenes'][0]['tracks']['overlay']);groups=[e for e in es if e.get('renderGroup')];events=[]
 for j,g in enumerate(groups):
  children=flat(g['renderGroup']['tracks']);assert len(children)==2;assert all('opacity'not in e['animations']for e in children);assert len({(e['startTime'],e['duration'])for e in children})==1
  keys=g['animations']['opacity']['keys'];assert keys[0]['value']==1 and keys[-1]['value']==0;hold=next(k['time']for k in reversed(keys)if k['value']==1);assert g['duration']-hold==7200
  start=g['startTime']/120000;end=(g['startTime']+g['duration'])/120000
  # Full event at export frame cadence; ROI is a fixed candidate region, not a text bounding-box claim.
  first=max(0,math.floor(start*30)-2);last=math.ceil(end*30)+2;frames=list(range(first,last+1));sheet=Image.new('RGB',(1000,math.ceil(len(frames)/4)*170),'#17212a');draw=ImageDraw.Draw(sheet)
  for n,k in enumerate(frames):
   data=subprocess.check_output([FF,'-v','error','-ss',str(k/30),'-i',str(video),'-frames:v','1','-f','image2pipe','-vcodec','png','-']);im=Image.open(io.BytesIO(data));im=im.crop((800,0,1280,270)if i==1 else(0,0,480,270));im.thumbnail((250,145));x=n%4*250;y=n//4*170;sheet.paste(im,(x,y+20));draw.text((x+4,y+3),f'{k/30:.3f}s',fill='white')
  name=f'motion-{i}-{j}.jpg';sheet.save(P/name,quality=95);events.append({'text':children[0]['params']['content'],'start':start,'end':end,'fullOpacitySeconds':hold/120000,'frames':len(frames),'sheet':name,'videoSha256':sha})
 records.append({'fixture':i,'events':events})
(P/'motion-verification.json').write_text(json.dumps({'records':records,'listened':False,'continuousPlaybackReviewed':False},ensure_ascii=False,indent=2));print('PASS',sum(len(r['events'])for r in records),'events, grouped opacity and 60ms exit; sheets generated')
