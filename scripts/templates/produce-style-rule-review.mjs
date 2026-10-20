// Review harness only: selection, projection and compilation remain in Rust.
// Usage: node scripts/templates/produce-style-rule-review.mjs /absolute/config.json
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const config = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const { output, name, policy, fixtures } = config;
assert.ok(path.isAbsolute(output));
assert.ok(fixtures.length > 0);
const base = process.env.TEMPLATE_API ?? 'http://127.0.0.1:3000/api/footage/templates';
async function api(route, body) {
  const response = await fetch(base + route, body ? {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'moirai-footage' },
    body: JSON.stringify(body),
  } : undefined);
  const value = await response.json();
  assert.ok(response.ok, JSON.stringify(value));
  return value;
}
async function write(file, value) { await fs.writeFile(file, JSON.stringify(value, null, 2)); }
const definition = (await api('/dynamic-assets/' + policy.application.assetId)).definition;
assert.equal(definition.revision, policy.application.assetRevision);
await fs.mkdir(output, { recursive: true });
await write(output + '/definition.json', definition);
await write(output + '/config.json', config);
// Preflight every input before submitting any render job.
const prepared = [];
for (const [index, fixture] of fixtures.entries()) {
  const { sample, protectedRegions } = fixture;
  assert.equal((await api('/inputs/' + sample.inputId)).transcript.revision, sample.transcriptRevision);
  const request = { ...policy, protectedRegions };
  const advice = await api('/dynamic-assets/placement-advice', request);
  assert.ok(advice.template, JSON.stringify(advice));
  const template = advice.template;
  const digest = createHash('sha256').update(JSON.stringify({ template, sample })).digest('hex');
  template.id = 'rule-review-' + digest.slice(0, 24);
  prepared.push({ index, request, advice, manifest: {
    name, brief: 'Same saved style and shared placement policy across inputs. Protection annotations belong to inputs. Visual review required; geometric success is not an aesthetic score.',
    previewOnly: true, designs: [{ template, baseRevision: 0 }], samples: [sample],
    idempotencyKey: 'rule-review-' + digest,
  } });
}
const submissions = [];
for (const { index, request, advice, manifest } of prepared) {
  const folder = output + '/' + index;
  await fs.mkdir(folder, { recursive: true });
  await write(folder + '/manifest.json', manifest);
  await write(folder + '/placement.json', { request, advice });
  await write(folder + '/application.json', advice.application);
  const batch = await api('/production/author', manifest);
  await write(folder + '/submission.json', batch);
  submissions.push({ fixture: index, id: batch.id, selected: advice.selectedId });
  await write(output + '/submissions.json', submissions);
  console.log(index, batch.id, advice.selectedId);
}
assert.deepEqual((await api('/dynamic-assets/' + definition.id)).definition, definition);
