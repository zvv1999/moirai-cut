import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = process.argv[2];
const previous = process.argv[3];
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const flat = tracks => tracks.flatMap(t => t.elements.flatMap(e => [e, ...flat(e.renderGroup?.tracks ?? [])]));
const stripIds = track => track?.keys.map(({ id, ...key }) => key);
const reports = [];
for (const { fixture } of await read(root + '/submissions.json')) {
  const current = await read(`${root}/${fixture}/item.json`);
  const before = await read(`${previous}/${fixture}/item.json`);
  const elements = flat(current.output.fixtures[0].compilation.document.scenes[0].tracks.overlay);
  const old = flat(before.output.fixtures[0].compilation.document.scenes[0].tracks.overlay);
  const groups = elements.filter(e => e.renderGroup);
  assert.equal(groups.length, old.filter(e => e.params['template.elementId'] === 'headline').length);
  for (const group of groups) {
    const leaves = flat(group.renderGroup.tracks);
    assert.equal(leaves.length, 3);
    assert.equal(new Set(leaves.map(e => `${e.startTime}/${e.duration}`)).size, 1);
    const keys = group.animations.opacity.keys;
    assert.equal(keys[0].value, 1);
    assert.equal(keys.at(-1).value, 0);
    const exitSeconds = (group.duration - keys.findLast(k => k.value === 1).time) / 120000;
    assert.ok(Math.abs(exitSeconds - .03) < .00002);
    for (const leaf of leaves) {
      const id = leaf.params['template.elementId'];
      const prior = old.find(e => e.params['template.elementId'] === id && e.startTime === leaf.startTime);
      assert.ok(prior);
      assert.equal(leaf.duration, prior.duration);
      assert.equal(leaf.params.content, prior.params.content);
      for (const property of new Set([...Object.keys(leaf.animations), ...Object.keys(prior.animations)])) {
        if (property !== 'opacity') assert.deepEqual(stripIds(leaf.animations[property]), stripIds(prior.animations[property]));
      }
      if (id === 'paper-tape') assert.ok(leaf.animations.opacity.keys.every(k => k.value === .9));
      else assert.ok(!leaf.animations.opacity);
    }
  }
  reports.push({ fixture, independentGroups: groups.length, preservedLeafMotionAndTiming: true, exitSeconds: .03 });
}
await fs.writeFile(root + '/group-motion-verification.json', JSON.stringify({ reports }, null, 2));
console.log('PASS', reports);
