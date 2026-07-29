import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {buildReferenceIndex, extractPlacedReferences, generateKicanvas} from './generate-kicanvas.mjs';

const schematic = (reference) => `(kicad_sch (version 20231120)
  (lib_symbols (symbol "ignored" (property "Reference" "LIB1")))
  (symbol (lib_id "Device:R") (property "Reference" "${reference}"))
)`;

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'drpd-kicanvas-'));
  const sourceDirectory = path.join(repoRoot, 'hardware', 'R1', 'kicad-schematics');
  const vendorRoot = path.join(repoRoot, 'vendor');
  fs.mkdirSync(sourceDirectory, {recursive: true});
  fs.mkdirSync(vendorRoot, {recursive: true});
  fs.writeFileSync(path.join(sourceDirectory, 'Root.kicad_sch'), schematic('U1'));
  fs.writeFileSync(path.join(sourceDirectory, 'Power Stage.kicad_sch'), schematic('Q1'));
  fs.writeFileSync(path.join(vendorRoot, 'kicanvas.js'), 'bundle');
  fs.writeFileSync(path.join(vendorRoot, 'LICENSE.md'), 'license');
  const manifest = {defaultRevision: 'R1', revisions: [{id: 'R1', label: 'Revision 1', diagram: {
    sourceDirectory: 'hardware/R1/kicad-schematics', rootSchematic: 'Root.kicad_sch', destination: 'R1',
  }}]};
  return {manifest, repoRoot, vendorRoot, outputRoot: path.join(repoRoot, 'output')};
}

test('extracts placed references and excludes library definitions', () => {
  assert.deepEqual(extractPlacedReferences(schematic('U1')), ['U1']);
});

test('rejects malformed and ambiguous schematics', () => {
  assert.throws(() => extractPlacedReferences('(kicad_sch (symbol', 'broken.kicad_sch'), /Malformed/);
  assert.throws(() => buildReferenceIndex([
    {name: 'a.kicad_sch', source: schematic('U1')},
    {name: 'b.kicad_sch', source: schematic('U1')},
  ]), /Ambiguous/);
});

test('copies schematics, creates reference index and wrapper, and removes stale output', () => {
  const data = fixture();
  fs.mkdirSync(path.join(data.outputRoot, 'stale'), {recursive: true});
  generateKicanvas(data);
  assert.equal(fs.existsSync(path.join(data.outputRoot, 'stale')), false);
  assert.equal(fs.readFileSync(path.join(data.outputRoot, 'R1', 'schematics', 'Root.kicad_sch'), 'utf8'), schematic('U1'));
  const index = JSON.parse(fs.readFileSync(path.join(data.outputRoot, 'R1', 'references.json'), 'utf8'));
  assert.deepEqual(index, {Q1: 'Power Stage.kicad_sch', U1: 'Root.kicad_sch'});
  const wrapper = fs.readFileSync(path.join(data.outputRoot, 'R1', 'index.html'), 'utf8');
  assert.match(wrapper, /#diagram:/);
  assert.match(wrapper, /deepLinkSelect/);
});

test('publishes another revision through manifest configuration only', () => {
  const data = fixture();
  const second = path.join(data.repoRoot, 'hardware', 'R2', 'kicad-schematics');
  fs.mkdirSync(second, {recursive: true});
  fs.writeFileSync(path.join(second, 'Main.kicad_sch'), schematic('D2'));
  data.manifest.revisions.push({id: 'R2', label: 'Revision 2', diagram: {
    sourceDirectory: 'hardware/R2/kicad-schematics', rootSchematic: 'Main.kicad_sch', destination: 'R2',
  }});
  generateKicanvas(data);
  assert.equal(fs.existsSync(path.join(data.outputRoot, 'R2', 'index.html')), true);
});
