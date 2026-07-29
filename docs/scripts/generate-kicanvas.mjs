#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const REFERENCE_PATTERN = /^[A-Za-z]+[0-9]+$/;

function topLevelSymbolForms(source, filename) {
  const forms = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let formStart = -1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '(') {
      if (depth === 1 && /^\(symbol(?:\s|\))/.test(source.slice(index))) formStart = index;
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth < 0) throw new Error(`Malformed schematic ${filename}: unmatched closing parenthesis.`);
      if (formStart >= 0 && depth === 1) {
        forms.push(source.slice(formStart, index + 1));
        formStart = -1;
      }
    }
  }
  if (inString || depth !== 0) throw new Error(`Malformed schematic ${filename}: unterminated content.`);
  return forms;
}

export function extractPlacedReferences(source, filename = 'schematic') {
  const references = [];
  for (const form of topLevelSymbolForms(source, filename)) {
    const match = form.match(/\(property\s+"Reference"\s+"([^"]+)"/);
    if (match && REFERENCE_PATTERN.test(match[1])) references.push(match[1]);
  }
  return references;
}

export function buildReferenceIndex(files) {
  const index = {};
  for (const {name, source} of files) {
    for (const reference of extractPlacedReferences(source, name)) {
      if (index[reference] && index[reference] !== name) {
        throw new Error(`Ambiguous schematic reference ${reference}: ${index[reference]} and ${name}`);
      }
      index[reference] = name;
    }
  }
  return index;
}

export function validateDiagramManifest(manifest, repoRoot) {
  if (!manifest || !Array.isArray(manifest.revisions) || manifest.revisions.length === 0) {
    throw new Error('Hardware viewer manifest must contain at least one revision.');
  }
  const ids = new Set();
  const destinations = new Set();
  for (const revision of manifest.revisions) {
    if (ids.has(revision.id)) throw new Error(`Duplicate hardware revision id: ${revision.id}`);
    const diagram = revision.diagram;
    if (!revision.id || !revision.label || !diagram?.sourceDirectory || !diagram?.rootSchematic || !diagram?.destination) {
      throw new Error(`Diagram configuration is incomplete: ${revision.id || '<unknown>'}`);
    }
    if ([diagram.sourceDirectory, diagram.rootSchematic, diagram.destination].some(path.isAbsolute)) {
      throw new Error(`Diagram paths must be relative: ${revision.id}`);
    }
    if (destinations.has(diagram.destination)) throw new Error(`Duplicate diagram destination: ${diagram.destination}`);
    const sourceDirectory = path.resolve(repoRoot, diagram.sourceDirectory);
    if (!sourceDirectory.startsWith(`${repoRoot}${path.sep}`) || !fs.statSync(sourceDirectory, {throwIfNoEntry: false})?.isDirectory()) {
      throw new Error(`Missing schematic directory for ${revision.id}: ${diagram.sourceDirectory}`);
    }
    if (!fs.statSync(path.join(sourceDirectory, diagram.rootSchematic), {throwIfNoEntry: false})?.isFile()) {
      throw new Error(`Missing root schematic for ${revision.id}: ${diagram.rootSchematic}`);
    }
    ids.add(revision.id);
    destinations.add(diagram.destination);
  }
  if (!ids.has(manifest.defaultRevision)) {
    throw new Error(`Default hardware revision is not published: ${manifest.defaultRevision}`);
  }
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function createWrapper({revision, filenames, referenceIndex}) {
  const ordered = [revision.diagram.rootSchematic, ...filenames.filter((name) => name !== revision.diagram.rootSchematic)];
  const sources = ordered.map((name) => `    <kicanvas-source src="./schematics/${escapeHtml(encodeURIComponent(name))}"></kicanvas-source>`).join('\n');
  const indexJson = JSON.stringify(referenceIndex).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dr. PD ${escapeHtml(revision.label)} interactive diagram</title>
  <style>html,body,kicanvas-embed{width:100%;height:100%;margin:0}body{overflow:hidden}</style>
  <script type="module" src="../_vendor/kicanvas.js"></script>
</head>
<body>
  <kicanvas-embed id="diagram" controls="full" controlslist="nodownload nooverlay">
${sources}
  </kicanvas-embed>
  <script type="module">
    const referenceIndex = ${indexJson};
    const diagram = document.getElementById('diagram');
    const notify = (status, ref, file = null) => {
      document.body.dataset.deepLinkStatus = status;
      document.body.dataset.deepLinkRef = ref;
      const message = {type: 'drpd:kicanvas-deep-link', status, ref, file};
      for (const delay of [0, 250, 1000]) {
        setTimeout(() => window.parent.postMessage(message, window.location.origin), delay);
      }
    };

    const waitUntilLoaded = async () => {
      await customElements.whenDefined('kicanvas-embed');
      const deadline = Date.now() + 15000;
      while (!diagram.loaded && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
      if (!diagram.loaded) throw new Error('KiCanvas project did not load.');
    };

    const requestFromLocation = () => {
      const queryRef = new URLSearchParams(window.location.search).get('ref')?.trim();
      if (queryRef) return {ref: queryRef, file: referenceIndex[queryRef]};
      const match = window.location.hash.match(/^#diagram:([^:]+):([^:]+)$/);
      return match ? {file: decodeURIComponent(match[1]), ref: decodeURIComponent(match[2])} : {ref: '', file: null};
    };

    const applyDeepLink = async () => {
      const {ref, file} = requestFromLocation();
      if (!ref) return;
      if (!file) {
        notify('not-found', ref);
        return;
      }
      history.replaceState(null, '', window.location.pathname + window.location.search +
        '#diagram:' + encodeURIComponent(file) + ':' + encodeURIComponent(ref));
      try {
        await waitUntilLoaded();
        await diagram.deepLinkSelect(file, ref);
        notify('selected', ref, file);
      } catch (error) {
        console.error(error);
        notify('error', ref, file);
      }
    };

    window.addEventListener('hashchange', applyDeepLink);
    applyDeepLink();
  </script>
</body>
</html>
`;
}

export function generateKicanvas({manifest, repoRoot, outputRoot, vendorRoot}) {
  validateDiagramManifest(manifest, repoRoot);
  const bundlePath = path.join(vendorRoot, 'kicanvas.js');
  const licensePath = path.join(vendorRoot, 'LICENSE.md');
  if (!fs.existsSync(bundlePath) || !fs.existsSync(licensePath)) throw new Error('Pinned KiCanvas bundle or license is missing.');

  fs.rmSync(outputRoot, {recursive: true, force: true});
  fs.mkdirSync(path.join(outputRoot, '_vendor'), {recursive: true});
  fs.copyFileSync(bundlePath, path.join(outputRoot, '_vendor', 'kicanvas.js'));
  fs.copyFileSync(licensePath, path.join(outputRoot, '_vendor', 'LICENSE.md'));

  for (const revision of manifest.revisions) {
    const sourceDirectory = path.resolve(repoRoot, revision.diagram.sourceDirectory);
    const filenames = fs.readdirSync(sourceDirectory).filter((name) => name.endsWith('.kicad_sch')).sort();
    if (filenames.length === 0) throw new Error(`No schematic files found for ${revision.id}.`);
    const files = filenames.map((name) => ({name, source: fs.readFileSync(path.join(sourceDirectory, name), 'utf8')}));
    const referenceIndex = buildReferenceIndex(files);
    const destination = path.resolve(outputRoot, revision.diagram.destination);
    if (!destination.startsWith(`${outputRoot}${path.sep}`)) throw new Error(`Diagram destination escapes generated directory: ${revision.diagram.destination}`);
    const schematicOutput = path.join(destination, 'schematics');
    fs.mkdirSync(schematicOutput, {recursive: true});
    for (const file of files) fs.copyFileSync(path.join(sourceDirectory, file.name), path.join(schematicOutput, file.name));
    fs.writeFileSync(path.join(destination, 'references.json'), `${JSON.stringify(referenceIndex, null, 2)}\n`);
    fs.writeFileSync(path.join(destination, 'index.html'), createWrapper({revision, filenames, referenceIndex}));
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const docsRoot = path.resolve(path.dirname(scriptPath), '..');
  const repoRoot = path.resolve(docsRoot, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(docsRoot, 'hardware-viewers.json'), 'utf8'));
  generateKicanvas({manifest, repoRoot, outputRoot: path.join(docsRoot, 'static', 'internals', 'kicanvas'), vendorRoot: path.join(docsRoot, 'vendor', 'kicanvas')});
  console.log(`Generated ${manifest.revisions.length} interactive diagram(s).`);
}
