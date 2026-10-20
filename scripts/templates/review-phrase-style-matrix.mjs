// Reuse one content annotation across saved styles, without modifying the library.
// Usage: node scripts/templates/review-phrase-style-matrix.mjs cases.json output-directory
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const [inputFile, outputDirectory] = process.argv.slice(2);
assert.ok(inputFile && outputDirectory, 'Expected cases JSON and output directory');
const config = JSON.parse(await fs.readFile(inputFile, 'utf8'));
const root = path.resolve(outputDirectory);
assert.ok(config.styles?.length && config.cases?.length);
const base = 'http://127.0.0.1:3000/api/footage/templates';
async function api(endpoint, body) {
  const response = await fetch(base + endpoint, body ? {
    method: 'POST', headers: {'content-type': 'application/json', 'x-requested-with': 'moirai-footage'},
    body: JSON.stringify(body),
  } : undefined);
  const value = await response.text();
  assert.ok(response.ok, value);
  return JSON.parse(value);
}
await fs.mkdir(root, {recursive: true});
const library = await api('/dynamic-assets');
const {definition} = await api('/dynamic-assets/' + encodeURIComponent(config.styles[0]));
const reports = [];
for (const [index, example] of config.cases.entries()) {
  // Read native preview tokens; never assume a Chinese character or JS word is an ASR token.
  const preview = await api('/dynamic-assets/preview', {definition, inputs: {}, durationSeconds: 3,
    example: {text: example.text, keyword: example.text}});
  const words = preview.example.words;
  assert.equal(words.map(w => w.text).join(''), example.text,
    'This fixture mapper requires contiguous native tokens; supply a separate mapper for spaced text');
  const boundaries = [0];
  for (const word of words) boundaries.push(boundaries.at(-1) + word.text.length);
  const layoutPhrases = example.phrases.map(phrase => {
    const start = example.text.indexOf(phrase);
    assert.ok(start >= 0 && example.text.indexOf(phrase, start + 1) === -1,
      'Fixture phrases must occur exactly once');
    const startWord = boundaries.indexOf(start), endWord = boundaries.indexOf(start + phrase.length);
    assert.ok(startWord >= 0 && endWord > startWord, 'Phrase must respect native token boundaries');
    return {wordSpan: {startWord, endWord}};
  }).sort((a, b) => a.wordSpan.startWord - b.wordSpan.startWord);
  for (const [variant, phrases] of [['before', []], ['after', layoutPhrases]]) {
    const directory = path.join(root, `${index}-${variant}`);
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/templates/review-active-style-gallery.mjs'], {
        stdio: 'inherit', env: {...process.env, PILOT_OUTPUT: directory,
          STYLE_ID: config.styles.join(','), EXAMPLE_TEXT: example.text, EXAMPLE_KEYWORD: example.text,
          EXAMPLE_LAYOUT_PHRASES: JSON.stringify(phrases), PREVIEW_TIMES: '[1]'},
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Gallery exited ${code}`)));
    });
  }
  reports.push({...example, layoutPhrases});
}
assert.deepEqual(await api('/dynamic-assets'), library);
await fs.writeFile(path.join(root, 'matrix.json'), JSON.stringify({styles: config.styles,
  cases: reports, libraryUnchanged: true, timingSource: 'synthetic_example',
  limitations: 'Agent-authored phrase annotations; not automatic semantic analysis or real-video acceptance.'}, null, 2));
console.log('Phrase/style matrix complete:', root);
