import json,pathlib,urllib.request,os
root=pathlib.Path(os.environ.get('PILOT_OUTPUT','/Users/zhengwei/Downloads/caption-segmentation-20260929'))
a=json.load(open('/Users/zhengwei/Downloads/caption-saved-20260929/designs.json'));b=json.load(open(root/'designs.json'))
ta=a['designs'][0]['template'];tb=b['designs'][0]['template'];assert {k:v for k,v in ta.items() if k not in ['id','name']}=={k:v for k,v in tb.items() if k not in ['id','name']}
for sa,sb in zip(a['samples'],b['samples']):assert {k:v for k,v in sa.items() if k not in ['captionSpans','captionPolicy']}=={k:v for k,v in sb.items() if k not in ['captionSpans','captionPolicy']}
batch=json.load(open(root/'submission.json'))['id']
p=json.load(urllib.request.urlopen('http://127.0.0.1:3000/api/footage/templates/production/'+batch+'/items/0'))
old=json.load(open('/Users/zhengwei/Downloads/caption-saved-20260929/item.json'))
ignored={'id','name','template.applicationCount','template.applicationKey','template.requestHash','template.sourceElementId'}
def normalized(v):
 if isinstance(v,dict):return {k:normalized(x) for k,x in v.items() if k not in ignored}
 if isinstance(v,list):return [normalized(x) for x in v]
 return v
for f,g in zip(p['output']['fixtures'],old['output']['fixtures']):
 assert len(f['compilation']['document']['scenes'])==len(g['compilation']['document']['scenes'])
 for s,t in zip(f['compilation']['document']['scenes'],g['compilation']['document']['scenes']):
  assert normalized(s['tracks']['main'])==normalized(t['tracks']['main'])
  assert normalized(s['tracks']['audio'])==normalized(t['tracks']['audio'])
root.joinpath('isolation-verification.json').write_text(json.dumps({'passed':True,'savedStyleUnchanged':True,'samplesOnlyCaptionPolicyAndSpansChanged':True,'sourceAndAudioPlaybackParametersIdentical':True,'excludedMetadata':sorted(ignored)},indent=2))
print('PASS style definition, source framing, audio playback and timing isolation')
