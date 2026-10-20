from pathlib import Path
import json, hashlib, subprocess, shutil, math
from PIL import Image, ImageDraw
import numpy as np

R=Path('/Users/zhengwei/Downloads/clock-lifecycle-20261007')
FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
FP='/Users/zhengwei/.local/share/moirai-cut/bin/ffprobe'
batch=json.load(open(R/'main-batch.json'));item=json.load(open(R/'main-item.json'));saved=json.load(open(R/'saved.json'));samples=json.load(open(R/'main-samples.json'))
assert batch['renderJob']['status']=='succeeded' and item['status']=='published' and item['fixtureCount']==7
assert saved['revision']==6 and saved['minDisplaySeconds']==.65
def frame(path,n):
    out=subprocess.check_output([FF,'-hide_banner','-loglevel','error','-i',str(path),'-vf',f'select=eq(n\\,{n})','-frames:v','1','-f','image2pipe','-vcodec','png','-threads','1','-'])
    import io
    return Image.open(io.BytesIO(out)).convert('RGB')
def pcm(path): return subprocess.check_output([FF,'-hide_banner','-loglevel','error','-i',str(path),'-map','0:a:0','-ar','48000','-ac','2','-f','s16le','-'])
report={'styleId':saved['id'],'revision':saved['revision'],'batchId':batch['id'],'fixtures':[],'listened':False,'continuousPlaybackViewed':False,'score':None}
cols=5
for idx,f in enumerate(item['output']['fixtures']):
    preview=item['previews'][idx]; src=Path(preview['path']); dst=R/f'r6-main-fixture-{idx}.mp4';shutil.copyfile(src,dst)
    assert hashlib.sha256(dst.read_bytes()).hexdigest()==preview['sha256']
    doc=f['compilation']['document']; overlays=doc['scenes'][0]['tracks']['overlay'];groups=[e for t in overlays for e in t['elements'] if e.get('renderGroup')]
    plan=f['compilation']['plan']; req=f['request']; payload=req['input']; expected=samples[idx]['semanticUnits']
    def canon(units):
        return [{**u,'keyword':u.get('keyword')} for u in units]
    assert canon(payload['semanticUnits'])==canon(expected)
    row={'fixture':idx,'inputId':samples[idx]['inputId'],'sha256':preview['sha256'],'durationSeconds':preview['durationSeconds'],'overlayGroups':len(groups),'warnings':f['compilation']['warnings']}
    if idx==3:
        assert not groups and not overlays;row['negative']='No selected time semantic; zero overlay groups.'
    else:
        assert len(groups)==1; g=groups[0]; start=g['startTime']/120000; dur=g['duration']/120000
        row.update(start=start,duration=dur,stableBudget=max(0,dur-.135-.045),groupLeafCount=sum(len(t['elements']) for t in g['renderGroup']['tracks']))
        assert row['groupLeafCount']==28
        expected_event=next(u for u in expected if u.get('keyword'))
        words=payload['words']; kw=words[expected_event['keyword']['startWord']:expected_event['keyword']['endWord']]
        event_start,event_end=kw[0]['start'],kw[-1]['end']; row['keywordText']=''.join(w['text'] for w in kw);row['eventStart']=event_start;row['eventEnd']=event_end
        assert abs(start-event_start)<1e-6
        assert dur >= min(.65, event_end-event_start)-1e-6
        next_kw=min((u['keyword'] for u in expected if u.get('keyword') and u is not expected_event),default=None)
        # No group may outlive the next selected cue.  This is the key boundary guarantee.
        if next_kw: assert start+dur <= words[next_kw['startWord']]['start']+1e-6
        # Check every encoded frame around this event and make a compact review strip.
        a=max(0,math.floor(start*30)-2); b=math.ceil((start+dur)*30)+2; indices=list(range(a,b+1)); sheet=Image.new('RGB',(cols*260,math.ceil(len(indices)/cols)*220),'#141a20'); draw=ImageDraw.Draw(sheet)
        for j,n in enumerate(indices):
            im=frame(dst,n); x=j%cols*260; y=j//cols*220; sheet.paste(im.resize((250,188)),(x+5,y+25)); draw.text((x+8,y+4),f'{n/30:.3f}s',fill='white')
        sheet.save(R/f'fixture-{idx}-motion-strip.jpg',quality=95); row['inspectedFrames']=indices
    same_audio=pcm(dst);row['pcmSha256']=hashlib.sha256(same_audio).hexdigest();row['audioDecodedBytes']=len(same_audio)
    # Native output retains one source stream; this check only records it, not listening.
    probe=subprocess.check_output([FP,'-hide_banner','-loglevel','error','-show_entries','stream=index,codec_type,channels,sample_rate','-of','json',str(dst)])
    row['streams']=json.loads(probe)['streams']; assert any(s['codec_type']=='audio' for s in row['streams'])
    report['fixtures'].append(row)
# frame contact sheet for the full set of actual outputs
contact=Image.new('RGB',(4*320,2*210),'#161b20'); draw=ImageDraw.Draw(contact)
for i,row in enumerate(report['fixtures']):
    p=R/f'r6-main-fixture-{i}.mp4'; n=int(max(0,row.get('start',0))*30+min(row.get('duration',1)*.55,1)*30) if row['overlayGroups'] else 180
    im=frame(p,n).resize((310,175));x=i%4*320;y=i//4*210;contact.paste(im,(x+5,y+30));draw.text((x+8,y+5),f"fixture {i}: {row['keywordText'] if row.get('keywordText') else 'negative'}",fill='white')
contact.save(R/'main-contact.jpg',quality=95)
json.dump(report,open(R/'main-verification.json','w'),ensure_ascii=False,indent=2)
print(json.dumps({'batch':batch['id'],'revision':saved['revision'],'fixtures':len(report['fixtures']),'positive':sum(x['overlayGroups'] for x in report['fixtures']),'negative':report['fixtures'][3]['overlayGroups'],'report':str(R/'main-verification.json')},ensure_ascii=False))
