import json,pathlib,urllib.request
r=pathlib.Path('/Users/zhengwei/Downloads/clock-hold-20260929');m=json.loads((r/'designs.json').read_text());item=json.loads((r/'item.json').read_text());base='http://127.0.0.1:3000/api/footage/templates';records=[]
for f,s in zip(item['output']['fixtures'],m['samples'],strict=True):
 inp=json.load(urllib.request.urlopen(base+'/inputs/'+s['inputId']));words=inp['transcript']['words'];els=[e for scene in f['compilation']['document']['scenes'] for t in scene['tracks']['overlay'] for e in t['elements']];rims=[e for e in els if e.get('params',{}).get('template.elementId')=='rim'];units=[u for u in s['semanticUnits'] if u['intent']=='emphasis'];assert len(rims)==len(units)
 lastEnd=0
 for e,u in zip(rims,units,strict=True):
  span=u['keyword'];start=words[span['startWord']]['start'];wordEnd=words[span['endWord']-1]['end'];end=min(max(wordEnd,start+.75),inp['input']['durationSeconds']);assert abs(e['startTime']/120000-start)<1/120000;assert abs((e['startTime']+e['duration'])/120000-end)<1/120000;assert start>=lastEnd;lastEnd=end
  parts=[part for part in els if part['startTime']==e['startTime'] and part.get('params',{}).get('template.elementId')];assert len(parts)==21;assert all(part['duration']==e['duration'] for part in parts)
  records.append({'fixture':f['index'],'text':' '.join(w['text'] for w in words[span['startWord']:span['endWord']]),'start':start,'wordEnd':wordEnd,'displayEnd':end,'editableParts':len(parts)})
(r/'timing-verification.json').write_text(json.dumps({'passed':True,'records':records,'minDisplaySeconds':.75,'noOverlap':True,'listened':False},ensure_ascii=False,indent=2));print(json.dumps(records,ensure_ascii=False))
