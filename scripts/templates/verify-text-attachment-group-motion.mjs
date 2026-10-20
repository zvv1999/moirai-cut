import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from '/Users/zhengwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

// Isolated geometry fixture: never edits a user's project or counts as style QA.
const source = process.env.ATTACHMENT_GROUP_SOURCE ?? '/Users/zhengwei/OpenCutProjects/tpl-preview-group-check-e4427600-26f8-4943-bd12-ac6e42f311c0/project.json';
const project = JSON.parse(await readFile(source, 'utf8'));
const id = 'tpl-preview-group-motion-' + randomUUID();
const directory = '/Users/zhengwei/OpenCutProjects/' + id;
await mkdir(directory);
Object.assign(project.metadata, { id, name: '跨组依附 · 动画导出验证' });
delete project.metadata.thumbnail;
project.revision = 0;
const scene = project.scenes[0];
scene.id = id + '-scene'; project.currentSceneId = scene.id;
const tracks = scene.tracks.overlay;
function animate(group, values) {
  group.animations = Object.fromEntries(Object.entries(values).map(([path, ends]) => [path, {
    keys: ends.map((value, i) => ({ id: randomUUID(), time: i * 240000, value, segmentToNext: 'linear', tangentMode: 'flat' })),
  }]));
}
animate(tracks.find(t => t.elements[0].id === 'parent-group').elements[0], {
  'transform.rotate': [-40, 40], 'transform.scaleX': [0.7, 1.3],
  'transform.scaleY': [1.2, 0.8], 'transform.positionX': [-40, 40],
});
animate(tracks.find(t => t.elements[0].id === 'child-group').elements[0], {
  'transform.rotate': [35, -35], 'transform.scaleX': [1.3, 0.7],
  'transform.scaleY': [0.8, 1.2], 'transform.positionY': [-30, 30],
});
await writeFile(directory + '/project.json', JSON.stringify(project));
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const results = [];
try {
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('hasSeenAgentOnboardingV2', 'true'));
  await page.goto('http://127.0.0.1:3000/editor/' + id);
  await page.waitForFunction(() => window.__opencutAgent?.getState().ok, {}, { timeout: 60000 });
  const times = [24, 27, 30, 33, 36, 39, 42, 45].map(frame => frame / 30);
  const preview = await page.evaluate(atSeconds => window.__opencutAgent.renderFrames({ atSeconds }), times);
  assert.equal(preview.ok, true, JSON.stringify(preview));
  const started = await page.evaluate(() => window.__opencutAgent.startExport({ options: { format: 'mp4', quality: 'high', includeAudio: false, fps: { numerator: 30, denominator: 1 }, range: { startSeconds: 0, endSeconds: 2 } }, name: 'group-motion' }));
  assert.equal(started.ok, true, JSON.stringify(started));
  console.log(JSON.stringify({ projectId: id, job: started.data }));
  await page.waitForFunction(jobId => window.__opencutAgent.getExport({ jobId }).data?.status !== 'running', started.data.jobId, { timeout: 180000 });
  const exported = await page.evaluate(jobId => window.__opencutAgent.getExport({ jobId }), started.data.jobId);
  assert.equal(exported.data.status, 'completed', JSON.stringify(exported));
  assert.equal(exported.data.stable, true);
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    const png = execFileSync('/Users/zhengwei/.local/share/moirai-cut/bin/ffmpeg', ['-v', 'error', '-ss', String(time), '-i', exported.data.path, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1']);
    for (const [kind, bytes] of [['preview', Buffer.from(preview.data.frames[i].pngBase64, 'base64')], ['export', png]]) {
      await writeFile(`${directory}/${kind}-${i}.png`, bytes);
      const measured = await page.evaluate(async ({ base64, time }) => {
        const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0); bitmap.close();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const f = time / 2, angle = (-40 + 80 * f) * Math.PI / 180;
        let greenRight = -Infinity, redLeft = Infinity, redRight = -Infinity, redTop = Infinity, redBottom = -Infinity, greenCount = 0, redCount = 0;
        for (let j = 0; j < pixels.length; j += 4) {
          const x = j / 4 % canvas.width + 0.5 - canvas.width / 2 - (-40 + 80 * f), y = Math.floor(j / 4 / canvas.width) + 0.5 - canvas.height / 2;
          const px = (x * Math.cos(angle) + y * Math.sin(angle)) / (0.7 + 0.6 * f), py = (-x * Math.sin(angle) + y * Math.cos(angle)) / (1.2 - 0.4 * f);
          if (pixels[j + 1] > 180 && pixels[j] < 50 && pixels[j + 2] < 50) { greenRight = Math.max(greenRight, px); greenCount++; }
          if (pixels[j] > 180 && pixels[j + 1] < 50 && pixels[j + 2] < 50) { redLeft = Math.min(redLeft, px); redRight = Math.max(redRight, px); redTop = Math.min(redTop, py); redBottom = Math.max(redBottom, py); redCount++; }
        }
        return { gap: redLeft - greenRight, width: redRight - redLeft, height: redBottom - redTop, greenCount, redCount };
      }, { base64: bytes.toString('base64'), time });
      results.push({ kind, time, ...measured });
    }
  }
  await writeFile(directory + '/review.json', JSON.stringify({ projectId: id, export: exported.data, results, scope: 'Silent geometry diagnostic, not aesthetic or audio acceptance' }, null, 2));
  for (const result of results) {
    assert.ok(result.greenCount > 100 && result.redCount > 100, JSON.stringify(result));
    assert.ok(Math.abs(result.gap - 14.4) <= 3 && Math.abs(result.width - 28.8) <= 3 && Math.abs(result.height - 28.8) <= 3, JSON.stringify(result));
  }
  console.log(JSON.stringify({ directory, frames: results.length, maxGapError: Math.max(...results.map(r => Math.abs(r.gap - 14.4))), passed: true }));
} finally { await browser.close(); }
