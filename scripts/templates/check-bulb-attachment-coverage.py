"""Check cross-content reuse separately from subjective visual acceptance."""
from pathlib import Path
import json, subprocess, urllib.request
P=Path('/Users/zhengwei/Downloads/bulb-attachment-coverage-20260929')
OLD=Path('/Users/zhengwei/Downloads/bulb-caption-bound-20260929')
FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
manifest=json.load(open(P/'manifest.json'));previous=json.load(open(OLD/'manifest.json'))
saved=json.load(open(OLD/'saved.json'))
assert manifest['designs'][0]['template']==saved
library=json.load(urllib.request.urlopen('http://127.0.0.1:3000/api/footage/templates'))
assert next(t for t in library['templates'] if t['id']==saved['id'])==saved
assert json.load(open(P/'inputs.json'))==json.load(open(OLD/'inputs.json'))
for s,old in zip(manifest['samples'],previous['samples']):
 for key in ['inputId','transcriptRevision','captionSpans','layoutPhrases','focalPoint']:
  assert s[key]==old[key],key
report=json.load(open(P/'verification.json'))
assert report['technicalChecksPassed']
assert [r['bulbInstances'] for r in report['reports']]==[0,1,1]
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
for i in range(3):assert pcm(P/f'{i}.mp4')==pcm(OLD/f'{i}.mp4')
result={'sameSavedTemplate':True,'libraryUnchanged':True,'sameInputAndCaptionBoundaries':True,'sameExportPcm':True,'manualKeywordAnnotations':True,'bulbInstances':[0,1,1],'score':None,'listened':False}
(P/'coverage.json').write_text(json.dumps(result,indent=2))
p=P/'review.html';s=p.read_text().replace('<h1>灵感灯泡 · 语义触发对照</h1>','<h1>同一模板 · 字幕旁装饰复用检查</h1><p>保存模板完全不变。关键词改为“from space”和“because of the tilt of the earth”，检验更长字幕边界上的依附；第一段保留无关键词负例。原声、字幕分段和词时间不变。</p>');p.write_text(s)
print('PASS exact saved template, two positive inputs plus negative control, unchanged caption spans and export PCM')
