from pathlib import Path
import json,subprocess
P=Path('/Users/zhengwei/Downloads/checklist-live-reviewed-20260930');OLD=Path('/Users/zhengwei/Downloads/checklist-live-20260930');FF='/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
a=json.load(open(OLD/'manifest.json'));b=json.load(open(P/'manifest.json'));assert b['designs'][0]['template']==json.load(open(OLD/'saved.json'))
assert json.load(open(P/'inputs.json'))==json.load(open(OLD/'inputs.json'))
assert b['samples'][2]['layoutPhrases']==[{'wordSpan':{'startWord':11,'endWord':18}}]
for old,new in zip(a['samples'],b['samples']):
 for k in ['inputId','transcriptRevision','captionSpans']:assert old[k]==new[k]
 assert old['semanticUnits'][0]['keyword']==new['semanticUnits'][0]['keyword']
def pcm(p):return subprocess.check_output([FF,'-v','error','-i',str(p),'-vn','-f','s16le','-acodec','pcm_s16le','-'])
for i in range(3):assert pcm(P/f'{i}.mp4')==pcm(OLD/f'{i}.mp4')
(P/'reuse.json').write_text(json.dumps({'exactSavedTemplate':True,'sameInputAndKeywordTimes':True,'sameExportPcm':True,'reviewedPhraseReused':True},indent=2))
print('PASS same saved template, source and event timing; corrected content phrase reused')
