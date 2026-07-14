#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(docsRoot, '..');
const scpiCatalogPath = path.join(repoRoot, 'firmware', 'lib', 'app', 'scpi.yaml');
const appSourceDir = path.join(repoRoot, 'firmware', 'lib', 'app');
const outputDir = path.join(
  docsRoot,
  'docs',
  'programming-guide',
  'controlling-dr-pd-over-scpi',
  'reference',
);

const namespaceMetadata = new Map([
  ['*', {slug: 'common', title: 'Common SCPI Commands', sidebarPosition: 10}],
  ['SYSTem', {slug: 'system', title: 'SYSTem Commands', sidebarPosition: 20}],
  ['STATus', {slug: 'status', title: 'STATus Commands', sidebarPosition: 30}],
  ['MEASure', {slug: 'measure', title: 'MEASure Commands', sidebarPosition: 40}],
  ['BUS', {slug: 'bus', title: 'BUS Commands', sidebarPosition: 50}],
  ['SINK', {slug: 'sink', title: 'SINK Commands', sidebarPosition: 60}],
  ['TRIGger', {slug: 'trigger', title: 'TRIGger Commands', sidebarPosition: 70}],
  ['TEST', {slug: 'test', title: 'TEST Commands', sidebarPosition: 80}],
]);

const commonErrorNotes = [
  ['-100', 'Command error', 'Malformed command syntax or command not recognized by the SCPI interpreter.'],
  ['-102', 'Syntax error', 'Unexpected token or separator in command input.'],
  ['-104', 'Data type error', 'Parameter could not be parsed as required type.'],
  ['-109', 'Missing parameter', 'Required parameter was omitted.'],
  ['-222', 'Data out of range', 'Numeric parameter was outside supported range.'],
  ['-224', 'Illegal parameter value', 'Parameter parsed correctly but value was not accepted for this command.'],
];

const errorConstantNames = new Map([
  ['SCPIErrorDataTypeError', '-104'],
  ['SCPIErrorMissingParameter', '-109'],
  ['_scpiErrorCommandProtected', '-203'],
  ['_scpiErrorExecutionError', '-200'],
  ['_scpiErrorSettingsConflict', '-221'],
  ['_scpiErrorDataOutOfRange', '-222'],
  ['_scpiErrorIllegalParameterValue', '-224'],
  ['_triggerSCPIErrorInvalidParameter', '-224'],
]);

function escapeMdx(text) {
  return String(text ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function md(text) {
  return String(text ?? '')
    .trimEnd()
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function topLevelNamespace(commandSyntax) {
  if (commandSyntax.startsWith('*')) {
    return '*';
  }
  return commandSyntax.split(':', 1)[0];
}

function commandKind(commandSyntax) {
  return commandSyntax.endsWith('?') ? 'Query' : 'Command';
}

function shortScpiForm(commandSyntax) {
  return commandSyntax.replace(/[a-z]/g, '');
}

function loadHandlerSources() {
  const files = fs.readdirSync(appSourceDir)
    .filter((name) => /^app_scpi_.*\.cpp$/.test(name))
    .map((name) => path.join(appSourceDir, name));
  return files.map((file) => ({file, text: fs.readFileSync(file, 'utf8')}));
}

function findFunctionBody(sourceText, handlerName) {
  const signature = new RegExp(`void\\s+App::${handlerName.replaceAll('$', '\\$')}\\s*\\(`, 'm');
  const match = signature.exec(sourceText);
  if (!match) {
    return null;
  }
  const openBrace = sourceText.indexOf('{', match.index);
  if (openBrace < 0) {
    return null;
  }
  let depth = 0;
  for (let i = openBrace; i < sourceText.length; i += 1) {
    const char = sourceText[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(openBrace, i + 1);
      }
    }
  }
  return null;
}

function cleanCppStringLiteral(raw) {
  if (!raw) {
    return '';
  }
  return raw
    .replace(/"([^"]*)"/g, '$1')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHandlerErrors(handlerName, handlerSources) {
  for (const {file, text} of handlerSources) {
    const body = findFunctionBody(text, handlerName);
    if (!body) {
      continue;
    }
    const errors = [];
    const addErrorRegex = /addError\s*\(\s*([^,]+?)\s*(?:,\s*((?:"(?:\\.|[^"])*"\s*(?:\+\s*)?)+))?\s*\)/gs;
    let match;
    while ((match = addErrorRegex.exec(body)) !== null) {
      const token = match[1].trim().split('::').pop();
      const code = errorConstantNames.get(token) ?? token;
      const message = cleanCppStringLiteral(match[2]) || 'See handler source for details.';
      if (!errors.some((error) => error.code === code && error.message === message)) {
        errors.push({code, message, description: 'Extracted from handler implementation.'});
      }
    }
    return {
      file: path.relative(repoRoot, file),
      errors,
    };
  }
  return {file: null, errors: []};
}

function normalizeCatalogErrors(commandErrors) {
  if (!commandErrors) {
    return [];
  }
  return Object.entries(commandErrors).map(([code, data]) => ({
    code,
    message: data?.message ?? '',
    description: data?.description ?? '',
  }));
}

function mergeErrors(catalogErrors, handlerErrors) {
  const merged = [...catalogErrors];
  for (const error of handlerErrors) {
    const hasSameCode = merged.some((existing) => String(existing.code) === String(error.code));
    if (!hasSameCode) {
      merged.push(error);
    }
  }
  return merged.sort((a, b) => Number(a.code) - Number(b.code));
}

function parameterTable(parameters = []) {
  if (!parameters.length) {
    return 'No parameters.\n';
  }
  const rows = [
    '| Name | Type | Values/default | Description |',
    '| --- | --- | --- | --- |',
  ];
  for (const parameter of parameters) {
    const values = [
      Array.isArray(parameter.choices) ? parameter.choices.map((choice) => `\`${choice}\``).join(', ') : '',
      parameter.default !== undefined ? `Default: \`${parameter.default}\`` : '',
    ].filter(Boolean).join('<br/>') || '—';
    rows.push(`| \`${escapeMdx(parameter.name)}\` | ${escapeMdx(parameter.type)} | ${values} | ${escapeMdx(parameter.description)} |`);
  }
  return `${rows.join('\n')}\n`;
}

function errorTable(errors) {
  if (!errors.length) {
    return 'No command-specific errors documented. Common SCPI parser errors may still apply.\n';
  }
  const rows = [
    '| Code | Message | Meaning |',
    '| --- | --- | --- |',
  ];
  for (const error of errors) {
    rows.push(`| \`${escapeMdx(error.code)}\` | ${escapeMdx(error.message)} | ${escapeMdx(error.description)} |`);
  }
  return `${rows.join('\n')}\n`;
}

function responseNotes(command) {
  if (commandKind(command.syntax) !== 'Query') {
    return 'No SCPI data response. Successful command execution completes without a payload.\n';
  }

  const lines = String(command.description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const returnLines = lines.filter((line) => /^returns?\b/i.test(line));
  if (returnLines.length) {
    return `${returnLines.map((line) => `- ${escapeMdx(line)}`).join('\n')}\n`;
  }

  return 'Returns query-specific data described above.\n';
}

function commonErrorTable() {
  return [
    '| Code | Message | Meaning |',
    '| --- | --- | --- |',
    ...commonErrorNotes.map(([code, message, meaning]) => `| \`${code}\` | ${message} | ${meaning} |`),
  ].join('\n');
}

function commandSection(command, handlerInfo) {
  const catalogErrors = normalizeCatalogErrors(command.errors);
  const errors = mergeErrors(catalogErrors, handlerInfo.errors);
  const lines = [];
  lines.push(`## \`${command.syntax}\``);
  lines.push('');
  lines.push(`**Type:** ${commandKind(command.syntax)}`);
  lines.push('');
  lines.push('**Syntax:**');
  lines.push('');
  lines.push('```scpi');
  lines.push(command.syntax);
  lines.push('```');
  lines.push('');
  lines.push('### Accepted forms');
  lines.push('');
  lines.push('| Form | Syntax |');
  lines.push('| --- | --- |');
  lines.push(`| Long form | \`${escapeMdx(command.syntax)}\` |`);
  lines.push(`| Short form | \`${escapeMdx(shortScpiForm(command.syntax))}\` |`);
  lines.push('');
  lines.push(md(command.description));
  lines.push('');
  lines.push('### Parameters');
  lines.push('');
  lines.push(parameterTable(command.parameters));
  lines.push('### Response');
  lines.push('');
  lines.push(responseNotes(command));
  lines.push('### Command-specific errors');
  lines.push('');
  lines.push(errorTable(errors));
  lines.push('### Source');
  lines.push('');
  lines.push(`- Catalog handler: \`${command.handler}\``);
  if (handlerInfo.file) {
    lines.push(`- Handler source: \`${handlerInfo.file}\``);
  }
  lines.push('');
  return lines.join('\n');
}

function generatedPage(namespace, commands, handlerSources) {
  const metadata = namespaceMetadata.get(namespace);
  const lines = [];
  lines.push('---');
  lines.push(`sidebar_position: ${metadata.sidebarPosition}`);
  lines.push(`sidebar_label: ${metadata.title.replace(' Commands', '')}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${metadata.title}`);
  lines.push('');
  lines.push(':::info[Generated reference]');
  lines.push(`This page is generated from \`firmware/lib/app/scpi.yaml\`. Do not edit it by hand; update the catalog or generator instead.`);
  lines.push(':::');
  lines.push('');
  if (namespace === 'TEST') {
    lines.push(':::warning[Test-only commands]');
    lines.push('These commands are protected unless firmware is built with `DRPD_ENABLE_TEST_SCPI_COMMANDS` enabled. Standard firmware reports `-203, "Command protected"` for these commands.');
    lines.push(':::');
    lines.push('');
  }
  lines.push('## Common parser errors');
  lines.push('');
  lines.push('These parser-level errors can apply before a command handler runs.');
  lines.push('');
  lines.push(commonErrorTable());
  lines.push('');
  for (const command of commands) {
    lines.push(commandSection(command, extractHandlerErrors(command.handler, handlerSources)));
  }
  return `${lines.join('\n')}\n`;
}

function writeCategoryFiles() {
  const category = {
    label: 'SCPI Command Reference',
    position: 20,
    collapsible: true,
    collapsed: false,
    link: {
      type: 'generated-index',
      title: 'SCPI Command Reference',
      description: 'Command namespace reference generated from the Dr. PD firmware SCPI catalog.',
    },
  };
  fs.mkdirSync(outputDir, {recursive: true});
  fs.writeFileSync(path.join(outputDir, '_category_.json'), `${JSON.stringify(category, null, 2)}\n`);
}

function main() {
  const catalog = yaml.load(fs.readFileSync(scpiCatalogPath, 'utf8'));
  const commands = catalog.commands ?? [];
  const groups = new Map();
  for (const command of commands) {
    const namespace = topLevelNamespace(command.syntax);
    if (!groups.has(namespace)) {
      groups.set(namespace, []);
    }
    groups.get(namespace).push(command);
  }

  fs.mkdirSync(outputDir, {recursive: true});
  writeCategoryFiles();
  const handlerSources = loadHandlerSources();
  const seen = [];
  for (const [namespace, metadata] of namespaceMetadata.entries()) {
    const namespaceCommands = groups.get(namespace) ?? [];
    if (!namespaceCommands.length) {
      continue;
    }
    fs.writeFileSync(
      path.join(outputDir, `${metadata.slug}.mdx`),
      generatedPage(namespace, namespaceCommands, handlerSources),
    );
    seen.push(...namespaceCommands);
  }

  const unknownNamespaces = [...groups.keys()].filter((namespace) => !namespaceMetadata.has(namespace));
  if (unknownNamespaces.length) {
    throw new Error(`Unhandled SCPI namespaces: ${unknownNamespaces.join(', ')}`);
  }

  console.log(`Generated ${seen.length} SCPI commands across ${namespaceMetadata.size} namespace pages.`);
}

main();
