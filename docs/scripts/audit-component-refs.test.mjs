import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {auditDocuments, maskNonProse} from './audit-component-refs.mjs';
import {buildHardwareViewerLink, buildHardwareViewerUrl} from '../src/components/hardwareViewerLinks.mjs';

const manifest = {revisions: [{id: 'R2605-A'}]};
const referencesByRevision = {'R2605-A': new Set(['U603', 'USB201'])};

function withDocument(source, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'component-ref-audit-'));
  fs.writeFileSync(path.join(root, 'page.mdx'), source);
  try {
    callback(root);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

test('builds encoded viewer links under local and production base paths', () => {
  assert.equal(
    buildHardwareViewerUrl('/', 'bom', 'R2605-A', 'USB 201'),
    '/internals/interactive-bom/?revision=R2605-A&ref=USB+201',
  );
  assert.equal(
    buildHardwareViewerUrl('/drpd/docs/', 'diagram', 'R2605-A', 'U603'),
    '/drpd/docs/internals/interactive-diagram/?revision=R2605-A&ref=U603',
  );
});

test('builds accessible links that reuse one named viewer tab', () => {
  assert.deepEqual(buildHardwareViewerLink('/', 'diagram', 'R2605-A', 'U603'), {
    href: '/internals/interactive-diagram/?revision=R2605-A&ref=U603',
    target: 'drpd-hardware-viewer',
    ariaLabel: 'Open U603 in the R2605-A interactive schematic',
  });
});

test('ignores code, revisions, and wrapped references', () => {
  const source = '`U603` R2605-A <ComponentRef revision="R2605-A" reference="U603" />';
  assert.deepEqual([...maskNonProse(source).matchAll(/\bU603\b/g)], []);
});

test('reports unwrapped, unknown, and handwritten references', () => {
  withDocument('U603\n<ComponentRef revision="R2605-A" reference="NOPE1" />\n/interactive-bom/?ref=U603', (docsRoot) => {
    const errors = auditDocuments({docsRoot, manifest, referencesByRevision});
    assert.equal(errors.length, 3);
    assert.match(errors.join('\n'), /unwrapped component candidate U603/);
    assert.match(errors.join('\n'), /NOPE1 is not a placed component/);
    assert.match(errors.join('\n'), /handwritten hardware-viewer deep link/);
  });
});

test('rejects unknown revisions and missing required properties regardless of property order', () => {
  withDocument('<ComponentRef reference="U603" revision="R9999-A" />\n<ComponentRef reference="U603" />', (docsRoot) => {
    const errors = auditDocuments({docsRoot, manifest, referencesByRevision});
    assert.equal(errors.length, 2);
    assert.match(errors[0], /unknown revision R9999-A/);
    assert.match(errors[1], /requires revision and reference properties/);
  });
});

test('supports explicit candidate exemptions', () => {
  withDocument('U603', (docsRoot) => {
    const errors = auditDocuments({
      docsRoot,
      manifest,
      referencesByRevision,
      exemptions: [{file: 'page.mdx', line: 1, reference: 'U603', reason: 'fixture'}],
    });
    assert.deepEqual(errors, []);
  });
});
