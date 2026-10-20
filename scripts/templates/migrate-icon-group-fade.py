"""Migrate the two inspected icon versions, with native timing evidence and CAS."""
import copy
import json
import os
from pathlib import Path
import urllib.request

BASE = 'http://127.0.0.1:3000/api/footage/templates'
ROOT = Path('/Users/zhengwei/Downloads/icon-group-fade-20260929')
ROOT.mkdir(exist_ok=True)


def api(path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body else None,
                                 headers={'content-type': 'application/json', 'x-requested-with': 'moirai-footage'})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)


def write(name, data):
    (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2))


def normalized(value):
    # Only generated animation-key IDs are excluded from animation comparison.
    if isinstance(value, list):
        return [normalized(v) for v in value]
    if isinstance(value, dict):
        return {k: normalized(v) for k, v in value.items() if k != 'id'}
    return value


def opacity(element, t):
    keys = element.get('animations', {}).get('opacity', {}).get('keys', [])
    if not keys:
        return 1
    assert all(k.get('segmentToNext') == 'linear' for k in keys)
    if t <= keys[0]['time']:
        return keys[0]['value']
    for left, right in zip(keys, keys[1:]):
        if t <= right['time']:
            return left['value'] + (right['value'] - left['value']) * (t-left['time']) / (right['time']-left['time'])
    return keys[-1]['value']


def leaves(tracks):
    return {e['params']['template.elementId']: e for track in tracks for e in track['elements']}


receipts = []
for name, revision, enter in [('clock', 1, .16), ('completion', 2, .18)]:
    asset_id = 'style-study-20260929-' + name
    current = api('/dynamic-assets/' + asset_id)['definition']
    before_path = ROOT / (name + '-before.json')
    if before_path.exists():
        before = json.loads(before_path.read_text())
    else:
        assert current['revision'] == revision, 'Unexpected source revision'
        before = copy.deepcopy(current)
        write(name + '-before.json', before)
    draft = copy.deepcopy(before)
    for layer in draft['layers']:
        element = layer['content'].get('element')
        if not element:
            continue
        assert element['motionTiming']['enterSeconds'] == enter
        assert element['motionTiming']['exitSeconds'] == .06
        motions = [m for m in element['motions'] if m['property'] == 'opacity']
        assert len(motions) == 1
        keys = motions[0]['keys']
        assert keys[-1]['value'] == 0 and keys[-2]['value'] == 1
        assert keys[-1]['time'] == 1 and keys[-2]['easing'] == 'linear'
        keys[-1]['value'] = 1
    for operation in [{'kind': 'group_compositing', 'layerId': 'root', 'composite': True},
                      {'kind': 'group_fade', 'layerId': 'root', 'exitSeconds': .06, 'enterSeconds': enter}]:
        draft = api('/dynamic-assets/layers', {'definition': draft, 'operation': operation})['definition']
    write(name + '-draft.json', draft)
    for duration in [.5, 2, 20]:
        previews = [api('/dynamic-assets/preview', {'definition': d, 'inputs': {}, 'durationSeconds': duration})
                    for d in [before, draft]]
        for label, preview in zip(['before', 'after'], previews):
            write(f'{name}-{duration}-{label}-preview.json', preview)
        old, new = previews
        assert old['example'] == new['example'] and old['captions'] == new['captions']
        originals = leaves(old['tracks']['overlay'])
        assert len(new['tracks']['overlay']) == 1
        group = new['tracks']['overlay'][0]['elements'][0]
        children = leaves(group['renderGroup']['tracks'])
        assert originals.keys() == children.keys()
        max_error = 0
        for element_id, previous in originals.items():
            child = children[element_id]
            for field in ['startTime', 'duration', 'type', 'definitionId', 'hidden', 'trimStart', 'trimEnd']:
                assert previous[field] == child[field], (element_id, field)
            assert previous['startTime'] == group['startTime']
            assert previous['duration'] == group['duration']
            for key in previous['params']:
                if key != 'template.requestHash':
                    assert previous['params'][key] == child['params'][key], (element_id, key)
            nonopacity = lambda e: normalized({k: v for k, v in e.get('animations', {}).items() if k != 'opacity'})
            assert nonopacity(previous) == nonopacity(child)
            times = {previous['duration'] * n / 1000 for n in range(1001)}
            for e in [previous, child, group]:
                times.update(k['time'] for k in e['animations']['opacity']['keys'])
            for t in times:
                error = abs(opacity(previous, t) - opacity(child, t) * opacity(group, t))
                max_error = max(max_error, error)
            assert max_error < .001, (name, duration, element_id, max_error)
        receipts.append({'asset': name, 'previewSeconds': duration, 'eventTicks': group['duration'],
                         'leafCount': len(children), 'maxOpacityEnvelopeError': max_error,
                         'contentTimesGeometryNonOpacityPreserved': True})
    if os.environ.get('SAVE') == '1':
        expected = copy.deepcopy(draft)
        expected['revision'] = revision + 1
        if current != expected:
            assert current == before, 'Source changed; refusing overwrite'
            current = api('/dynamic-assets', {'definition': draft, 'baseRevision': revision,
                          'idempotencyKey': 'icon-group-fade-20260929-' + name})['definition']
        assert current == expected
        assert api('/dynamic-assets/' + asset_id)['definition'] == expected
        write(name + '-saved.json', current)
write('timing-verification.json', {'passed': True, 'saved': os.environ.get('SAVE') == '1', 'cases': receipts,
                                  'scope': 'Native synthetic event projection; no visual or audio acceptance.'})
print(json.dumps(receipts, indent=2))
