import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {ADAPTER_MARKER, generateIboms, injectAdapter, validateManifest} from './generate-ibom.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drpd-ibom-'));
  fs.mkdirSync(path.join(root, 'hardware', 'R1', 'virtual-bom'), {recursive: true});
  const source = '<html><body><p>fixture</p></body></html>';
  fs.writeFileSync(path.join(root, 'hardware', 'R1', 'virtual-bom', 'bom.html'), source);
  const manifest = {
    defaultRevision: 'R1',
    revisions: [{
      id: 'R1', label: 'Revision 1',
      ibom: {source: 'hardware/R1/virtual-bom/bom.html', destination: 'R1/bom.html'},
    }],
  };
  return {root, repoRoot: root, source, manifest, outputRoot: path.join(root, 'output')};
}

test('copies source content and injects adapter exactly once', () => {
  const data = fixture();
  generateIboms(data);
  const generated = fs.readFileSync(path.join(data.outputRoot, 'R1', 'bom.html'), 'utf8');
  assert.ok(generated.startsWith('<html><body><p>fixture</p>'));
  assert.equal(generated.match(new RegExp(ADAPTER_MARKER, 'g')).length, 1);
  assert.match(generated, /NARROW_LAYOUT_WIDTH = 1100/);
  assert.match(generated, /changeBomLayout\(nextLayout\)/);
  assert.ok(generated.endsWith('</body></html>'));
});

test('removes stale generated revisions', () => {
  const data = fixture();
  fs.mkdirSync(path.join(data.outputRoot, 'stale'), {recursive: true});
  fs.writeFileSync(path.join(data.outputRoot, 'stale', 'bom.html'), 'stale');
  generateIboms(data);
  assert.equal(fs.existsSync(path.join(data.outputRoot, 'stale')), false);
});

test('publishes another revision through a manifest entry only', () => {
  const data = fixture();
  fs.mkdirSync(path.join(data.root, 'hardware', 'R2', 'virtual-bom'), {recursive: true});
  fs.writeFileSync(
    path.join(data.root, 'hardware', 'R2', 'virtual-bom', 'ibom.html'),
    '<html><body><p>revision 2</p></body></html>',
  );
  data.manifest.revisions.push({
    id: 'R2', label: 'Revision 2',
    ibom: {source: 'hardware/R2/virtual-bom/ibom.html', destination: 'R2/index.html'},
  });
  generateIboms(data);
  const generated = fs.readFileSync(path.join(data.outputRoot, 'R2', 'index.html'), 'utf8');
  assert.match(generated, /revision 2/);
  assert.match(generated, new RegExp(ADAPTER_MARKER));
});

test('rejects duplicate revisions, missing sources, and unknown defaults', () => {
  const data = fixture();
  assert.throws(() => validateManifest({...data.manifest, defaultRevision: 'R2'}, data.root));
  assert.throws(() => validateManifest({
    ...data.manifest,
    revisions: [...data.manifest.revisions, {...data.manifest.revisions[0]}],
  }, data.root), /Duplicate/);
  assert.throws(() => validateManifest({
    ...data.manifest,
    revisions: [{...data.manifest.revisions[0], ibom: {source: 'hardware/missing.html', destination: 'R1/bom.html'}}],
  }, data.root), /Missing/);
});

test('rejects missing injection marker and double injection', () => {
  assert.throws(() => injectAdapter('<html></html>'), /<\/body>/);
  const generated = injectAdapter('<html><body></body></html>');
  assert.throws(() => injectAdapter(generated), /already contains/);
});
