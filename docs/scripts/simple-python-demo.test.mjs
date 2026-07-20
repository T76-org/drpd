import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const demoPath = path.join(
  scriptDir,
  '..',
  'docs',
  'programming-guide',
  'using-python-library',
  'simple-demo.mdx',
);

test('uses current AnalogMonitorChannels fields', () => {
  const demo = fs.readFileSync(demoPath, 'utf8');

  assert.match(demo, /analog\.vbus:\.3f/);
  assert.match(demo, /analog\.ibus:\.3f/);
  assert.doesNotMatch(demo, /analog\.vbus\.(?:voltage|current)/);
});

test('handles devices without a configured name', () => {
  const demo = fs.readFileSync(demoPath, 'utf8');

  assert.match(demo, /device\.name or f"\{info\.model\} \{info\.serial_number\}"/);
});
