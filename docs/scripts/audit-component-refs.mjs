import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const COMPONENT_PATTERN = /\b(?:LED|USB|TP|SW|CN|RF|[RCDQUJ])\d{1,4}(?:[A-Z])?\b(?!-)/g;
const COMPONENT_TAG_PATTERN = /<ComponentRef\b([^>]*)\/>/g;
const GENERATED_DOC_PATHS = [
  'programming-guide/scpi-reference/',
  'programming-guide/using-python-library/reference/',
];

function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return /\.mdx?$/.test(entry.name) ? [target] : [];
  });
}

export function maskNonProse(source) {
  return source
    .replace(/^---\n[\s\S]*?\n---\n/, (match) => '\n'.repeat(match.split('\n').length - 1))
    .replace(/^```[\s\S]*?^```/gm, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]+`/g, (match) => ' '.repeat(match.length))
    .replace(/(?:https?:\/\/[^\s)"']+|\/(?:internals\/)?interactive-(?:bom|diagram)\/[^\s)"']*)/g, (match) => ' '.repeat(match.length))
    .replace(/^import\s+.*$/gm, (match) => ' '.repeat(match.length))
    .replace(/<ComponentRef\b[^>]*\/>/g, (match) => ' '.repeat(match.length));
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function auditDocuments({docsRoot, manifest, referencesByRevision, exemptions = []}) {
  const errors = [];
  const exemptionKeys = new Set(exemptions.map(({file, line, reference}) => `${file}:${line}:${reference}`));
  const revisionIds = new Set(manifest.revisions.map(({id}) => id));

  for (const filename of walk(docsRoot)) {
    const relative = path.relative(docsRoot, filename).replaceAll(path.sep, '/');
    const source = fs.readFileSync(filename, 'utf8');
    const isGenerated = GENERATED_DOC_PATHS.some((prefix) => relative.startsWith(prefix));

    if (!isGenerated) {
      for (const match of source.matchAll(COMPONENT_TAG_PATTERN)) {
        const attributes = Object.fromEntries([...match[1].matchAll(/(\w+)=["']([^"']+)["']/g)].map((item) => [item[1], item[2]]));
        const {revision, reference} = attributes;
        const line = lineNumberAt(source, match.index);
        if (!revision || !reference) {
          errors.push(`${relative}:${line}: ComponentRef requires revision and reference properties`);
        } else if (!revisionIds.has(revision)) {
          errors.push(`${relative}:${line}: ComponentRef uses unknown revision ${revision}`);
        } else if (!referencesByRevision[revision]?.has(reference)) {
          errors.push(`${relative}:${line}: ${reference} is not a placed component in ${revision}`);
        }
      }

      const masked = maskNonProse(source);
      for (const match of masked.matchAll(COMPONENT_PATTERN)) {
        const reference = match[0];
        const line = lineNumberAt(source, match.index);
        const key = `${relative}:${line}:${reference}`;
        if (!exemptionKeys.has(key)) {
          errors.push(`${relative}:${line}: unwrapped component candidate ${reference}`);
        }
      }

      for (const match of source.matchAll(/(?:interactive-bom|interactive-diagram)\/?\?[^\s)"']*\bref=/g)) {
        errors.push(`${relative}:${lineNumberAt(source, match.index)}: handwritten hardware-viewer deep link`);
      }
    }
  }

  return errors;
}

export function runAudit(docsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const manifest = JSON.parse(fs.readFileSync(path.join(docsDirectory, 'hardware-viewers.json'), 'utf8'));
  const exemptionConfig = JSON.parse(fs.readFileSync(path.join(docsDirectory, 'component-ref-audit-exemptions.json'), 'utf8'));
  const referencesByRevision = Object.fromEntries(manifest.revisions.map((revision) => {
    const indexPath = path.join(docsDirectory, 'static', 'internals', 'kicanvas', revision.diagram.destination, 'references.json');
    if (!fs.existsSync(indexPath)) throw new Error(`Missing generated reference index: ${indexPath}`);
    return [revision.id, new Set(Object.keys(JSON.parse(fs.readFileSync(indexPath, 'utf8'))))];
  }));

  const errors = auditDocuments({
    docsRoot: path.join(docsDirectory, 'docs'),
    manifest,
    referencesByRevision,
    exemptions: exemptionConfig.candidates,
  });
  if (errors.length) throw new Error(`Component reference audit failed:\n${errors.join('\n')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runAudit();
    console.log('Component reference audit passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
