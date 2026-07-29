#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ADAPTER_MARKER = 'DRPD_IBOM_DEEP_LINK_ADAPTER_V1';
const HTML_END_MARKER = '</body>';

const adapter = `
<script data-drpd-ibom-adapter="v1">
// ${ADAPTER_MARKER}
(() => {
  const NARROW_LAYOUT_WIDTH = 1100;
  let responsiveLayout = null;
  let resizeFrame = null;

  const sendStatus = (status, ref) => {
    window.parent.postMessage({type: 'drpd:ibom-deep-link', status, ref}, window.location.origin);
  };

  const applyResponsiveLayout = () => {
    if (typeof window.changeBomLayout !== 'function') return;
    const nextLayout = window.innerWidth < NARROW_LAYOUT_WIDTH ? 'top-bottom' : 'left-right';
    if (nextLayout === responsiveLayout) return;
    responsiveLayout = nextLayout;
    window.changeBomLayout(nextLayout);
  };

  const scheduleResponsiveLayout = () => {
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      applyResponsiveLayout();
    });
  };

  const applyDeepLink = () => {
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (!ref) return;

    const input = document.getElementById('reflookup');
    if (!input || typeof window.updateRefLookup !== 'function') {
      sendStatus('error', ref);
      return;
    }

    input.value = ref;
    window.updateRefLookup(ref);
    const row = document.querySelector('#bombody tr');
    if (!row) {
      sendStatus('not-found', ref);
      return;
    }

    if (typeof row.onmousedown === 'function') row.onmousedown();
    else if (typeof row.onmousemove === 'function') row.onmousemove();
    if (typeof window.smoothScrollToRow === 'function' && window.currentHighlightedRowId) {
      window.smoothScrollToRow(window.currentHighlightedRowId);
    } else {
      row.scrollIntoView({block: 'center'});
    }
    sendStatus('selected', ref);
  };

  window.addEventListener('load', () => window.setTimeout(() => {
    applyResponsiveLayout();
    applyDeepLink();
  }, 0));
  window.addEventListener('resize', scheduleResponsiveLayout);
})();
</script>
`;

export function validateManifest(manifest, repoRoot) {
  if (!manifest || !Array.isArray(manifest.revisions) || manifest.revisions.length === 0) {
    throw new Error('iBOM manifest must contain at least one revision.');
  }

  const ids = new Set();
  const destinations = new Set();
  for (const revision of manifest.revisions) {
    for (const field of ['id', 'label', 'source', 'destination']) {
      if (typeof revision[field] !== 'string' || revision[field].trim() === '') {
        throw new Error(`iBOM revision is missing ${field}.`);
      }
    }
    if (ids.has(revision.id)) throw new Error(`Duplicate iBOM revision id: ${revision.id}`);
    if (destinations.has(revision.destination)) {
      throw new Error(`Duplicate iBOM destination: ${revision.destination}`);
    }
    if (path.isAbsolute(revision.source) || path.isAbsolute(revision.destination)) {
      throw new Error(`iBOM paths must be relative: ${revision.id}`);
    }
    const sourcePath = path.resolve(repoRoot, revision.source);
    if (!sourcePath.startsWith(`${repoRoot}${path.sep}`) || !fs.existsSync(sourcePath)) {
      throw new Error(`Missing iBOM source for ${revision.id}: ${revision.source}`);
    }
    ids.add(revision.id);
    destinations.add(revision.destination);
  }
  if (!ids.has(manifest.defaultRevision)) {
    throw new Error(`Default iBOM revision is not published: ${manifest.defaultRevision}`);
  }
}

export function injectAdapter(source) {
  if (source.includes(ADAPTER_MARKER)) {
    throw new Error('iBOM source already contains the Dr. PD deep-link adapter.');
  }
  const markerIndex = source.lastIndexOf(HTML_END_MARKER);
  if (markerIndex < 0) {
    throw new Error('Could not inject iBOM deep-link adapter: </body> not found.');
  }
  return `${source.slice(0, markerIndex)}${adapter}${source.slice(markerIndex)}`;
}

export function generateIboms({manifest, repoRoot, outputRoot}) {
  validateManifest(manifest, repoRoot);
  fs.rmSync(outputRoot, {recursive: true, force: true});
  fs.mkdirSync(outputRoot, {recursive: true});

  for (const revision of manifest.revisions) {
    const sourcePath = path.resolve(repoRoot, revision.source);
    const destinationPath = path.resolve(outputRoot, revision.destination);
    if (!destinationPath.startsWith(`${outputRoot}${path.sep}`)) {
      throw new Error(`iBOM destination escapes generated directory: ${revision.destination}`);
    }
    const source = fs.readFileSync(sourcePath, 'utf8');
    const generated = injectAdapter(source);
    fs.mkdirSync(path.dirname(destinationPath), {recursive: true});
    fs.writeFileSync(destinationPath, generated);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const docsRoot = path.resolve(path.dirname(scriptPath), '..');
  const repoRoot = path.resolve(docsRoot, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(docsRoot, 'ibom-manifest.json'), 'utf8'));
  generateIboms({
    manifest,
    repoRoot,
    outputRoot: path.join(docsRoot, 'static', 'internals', 'ibom'),
  });
  console.log(`Generated ${manifest.revisions.length} interactive BOM(s).`);
}

export {ADAPTER_MARKER};
