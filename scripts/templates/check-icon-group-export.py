import hashlib
import io
import json
import shutil
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path('/Users/zhengwei/Downloads/icon-group-fade-20260929/production')
FFMPEG = '/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg'
before, after = [json.loads((ROOT / name).read_text()) for name in ['current-baseline-item.json', 'item.json']]
expected = json.loads((ROOT / 'expectations.json').read_text())
results = []


def pcm(path):
    return subprocess.check_output([FFMPEG, '-v', 'error', '-i', str(path), '-vn', '-ac', '2', '-ar', '16000', '-f', 's16le', '-'])


def frame(path, t):
    return Image.open(io.BytesIO(subprocess.check_output([FFMPEG, '-v', 'error', '-ss', str(t), '-i', str(path),
                    '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']))).convert('RGB')


for index, (old, new) in enumerate(zip(before['previews'], after['previews'])):
    assert new['decodeVerified'] and new['audioQuality']['validated']
    paths = [Path(p['path']) for p in [old, new]]
    for p, metadata in zip(paths, [old, new]):
        assert hashlib.sha256(p.read_bytes()).hexdigest() == metadata['sha256']
    assert pcm(paths[0]) == pcm(paths[1])
    old_input = before['output']['fixtures'][index]['request']['input']
    new_input = after['output']['fixtures'][index]['request']['input']
    assert {k:v for k,v in old_input.items() if k!='template'} == {k:v for k,v in new_input.items() if k!='template'}
    shutil.copy2(paths[1], ROOT / f'preview-{index}.mp4')
    events = expected[index*2:index*2+2]
    for event in events:
        # Actual encoded 30fps samples: stable, five fade-boundary frames, after.
        end_frame = round(event['end']*30)
        times = [(event['start']+event['end'])/2] + [n/30 for n in range(end_frame-3,end_frame+3)]
        sheet = Image.new('RGB', (7*220, 2*260), '#14171c')
        draw = ImageDraw.Draw(sheet)
        for row, (label, path) in enumerate(zip(['before', 'after'], paths)):
            for col, t in enumerate(times):
                im = frame(path, t)
                im.save(ROOT / f'{index}-{event["instanceId"]}-{label}-{col}.png')
                im.thumbnail((220,220))
                sheet.paste(im,(col*220,row*260+30))
                draw.text((col*220+6,row*260+7),f'{label} {t:.3f}s',fill='white')
        sheet.save(ROOT / f'{index}-{event["instanceId"]}-comparison.jpg')
    results.append({'fixture':index,'sha256':new['sha256'],'decodedPcmIdentical':True,'inputExceptTemplateIdentical':True,'baseline':'old template re-exported with current renderer','events':events})
(ROOT/'export-verification.json').write_text(json.dumps({'passed':True,'results':results,'listened':False},ensure_ascii=False,indent=2))
print('PASS 3 export hashes, original inputs and PCM; six event comparison sheets generated')
