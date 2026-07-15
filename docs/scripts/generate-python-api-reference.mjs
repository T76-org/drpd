#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(docsRoot, '..');
const pythonRoot = path.join(repoRoot, 'python');
const packageRoot = path.join(pythonRoot, 't76');
const outputDir = path.join(
  docsRoot,
  'docs',
  'programming-guide',
  'using-python-library',
  'reference',
);

const groups = [
  {
    key: 'device',
    title: 'Device API',
    slug: 'device',
    position: 10,
    description: 'Discovery, device connection, SCPI-backed controllers, events, and device data types.',
    prefixes: ['t76.drpd.device', 't76.drpd.device_reconciliation'],
  },
  {
    key: 'message',
    title: 'USB-PD Message API',
    slug: 'message',
    position: 20,
    description: 'USB-PD message models, headers, SOP identifiers, BMC capture records, and decoded data objects.',
    prefixes: ['t76.drpd.message'],
  },
  {
    key: 'transport',
    title: 'Transport API',
    slug: 'transport',
    position: 30,
    description: 'Lower-level USB and serial transport helpers used by the Dr. PD client.',
    prefixes: ['t76.transport'],
  },
  {
    key: 'app',
    title: 'Terminal App Internals',
    slug: 'app',
    position: 40,
    description: 'Textual terminal app entry points and UI classes. Most widget classes are internal UI surface.',
    prefixes: ['t76.drpd.app'],
    internal: true,
  },
  {
    key: 'root',
    title: 'Package Entry Points',
    slug: 'package',
    position: 50,
    description: 'Top-level package modules and command-line entry helpers.',
    prefixes: ['t76.drpd', 't76'],
  },
];

function escapeMdx(text) {
  return normalizeComparators(String(text ?? ''))
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('<', '&lt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function escapeCodeSpan(text) {
  return String(text ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('`', '\\`');
}

function md(text) {
  return normalizeComparators(String(text ?? ''))
    .trim()
    .replaceAll('<', '&lt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function normalizeComparators(text) {
  return text
    .replaceAll('>=', '≥')
    .replaceAll('<=', '≤')
    .replace(/<(\d)/g, 'less than $1');
}

function moduleNameForFile(file) {
  const relative = path.relative(pythonRoot, file).replaceAll(path.sep, '/');
  const withoutSuffix = relative.replace(/\.py$/, '');
  return withoutSuffix.endsWith('/__init__')
    ? withoutSuffix.slice(0, -'/__init__'.length).replaceAll('/', '.')
    : withoutSuffix.replaceAll('/', '.');
}

function collectPythonFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__' || entry.name === 'tests') {
        continue;
      }
      files.push(...collectPythonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.py')) {
      if (entry.name.startsWith('_') && entry.name !== '__init__.py' && entry.name !== '_base.py') {
        continue;
      }
      files.push(fullPath);
    }
  }
  return files.sort();
}

function loadApiJson() {
  const helper = String.raw`
import ast
import json
import pathlib

root = pathlib.Path(${JSON.stringify(packageRoot)})
python_root = pathlib.Path(${JSON.stringify(pythonRoot)})

def module_name(path):
    rel = path.relative_to(python_root).with_suffix("")
    parts = list(rel.parts)
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)

def unparse(node):
    if node is None:
        return ""
    try:
        return ast.unparse(node)
    except Exception:
        return ""

def annotation(node):
    return unparse(node) if node is not None else ""

def default_expr(args, index, positional_count):
    defaults = list(args.defaults)
    default_start = positional_count - len(defaults)
    if index >= default_start:
        return unparse(defaults[index - default_start])
    return None

def signature(fn):
    args = fn.args
    pieces = []
    positional = list(args.posonlyargs) + list(args.args)
    for i, arg in enumerate(positional):
        piece = arg.arg
        ann = annotation(arg.annotation)
        if ann:
            piece += f": {ann}"
        default = default_expr(args, i, len(positional))
        if default is not None:
            piece += f" = {default}"
        pieces.append(piece)
        if args.posonlyargs and i == len(args.posonlyargs) - 1:
            pieces.append("/")
    if args.vararg:
        piece = "*" + args.vararg.arg
        ann = annotation(args.vararg.annotation)
        if ann:
            piece += f": {ann}"
        pieces.append(piece)
    elif args.kwonlyargs:
        pieces.append("*")
    for arg, default in zip(args.kwonlyargs, args.kw_defaults):
        piece = arg.arg
        ann = annotation(arg.annotation)
        if ann:
            piece += f": {ann}"
        if default is not None:
            piece += f" = {unparse(default)}"
        pieces.append(piece)
    if args.kwarg:
        piece = "**" + args.kwarg.arg
        ann = annotation(args.kwarg.annotation)
        if ann:
            piece += f": {ann}"
        pieces.append(piece)
    sig = "(" + ", ".join(pieces) + ")"
    ret = annotation(fn.returns)
    if ret:
        sig += f" -> {ret}"
    return sig

def decorators(node):
    return [unparse(d) for d in getattr(node, "decorator_list", [])]

def bases(node):
    return [unparse(base) for base in node.bases]

def is_dataclass(node):
    return any("dataclass" in unparse(d) for d in node.decorator_list)

def is_enum(node):
    return any(base.endswith("Enum") or base == "Enum" or ".Enum" in base for base in bases(node))

def class_fields(node):
    fields = []
    for child in node.body:
        if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name) and not child.target.id.startswith("_"):
            fields.append({
                "name": child.target.id,
                "annotation": annotation(child.annotation),
                "default": unparse(child.value) if child.value is not None else "",
            })
        elif isinstance(child, ast.Assign):
            names = [t.id for t in child.targets if isinstance(t, ast.Name) and not t.id.startswith("_")]
            if names and not isinstance(child.value, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                for name in names:
                    fields.append({"name": name, "annotation": "", "default": unparse(child.value)})
    return fields

def public_methods(node):
    methods = []
    for child in node.body:
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and not child.name.startswith("_"):
            methods.append({
                "name": child.name,
                "kind": "async method" if isinstance(child, ast.AsyncFunctionDef) else "method",
                "signature": signature(child),
                "docstring": ast.get_docstring(child) or "",
                "decorators": decorators(child),
            })
    return methods

def public_symbols(tree):
    symbols = []
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and not node.name.startswith("_"):
            kind = "enum" if is_enum(node) else "dataclass" if is_dataclass(node) else "class"
            symbols.append({
                "name": node.name,
                "kind": kind,
                "docstring": ast.get_docstring(node) or "",
                "bases": bases(node),
                "decorators": decorators(node),
                "fields": class_fields(node),
                "methods": public_methods(node),
            })
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_"):
            symbols.append({
                "name": node.name,
                "kind": "async function" if isinstance(node, ast.AsyncFunctionDef) else "function",
                "signature": signature(node),
                "docstring": ast.get_docstring(node) or "",
                "decorators": decorators(node),
            })
    return symbols

def module_all(tree):
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "__all__":
                    try:
                        return list(ast.literal_eval(node.value))
                    except Exception:
                        return []
    return []

modules = []
for path in sorted(root.rglob("*.py")):
    if "tests" in path.parts or "__pycache__" in path.parts:
        continue
    if path.name.startswith("_") and path.name not in ("__init__.py", "_base.py"):
        continue
    tree = ast.parse(path.read_text())
    symbols = public_symbols(tree)
    all_names = module_all(tree)
    if not symbols and not all_names and not ast.get_docstring(tree):
        continue
    modules.append({
        "module": module_name(path),
        "source": str(path.relative_to(python_root)),
        "docstring": ast.get_docstring(tree) or "",
        "all": all_names,
        "symbols": symbols,
    })

print(json.dumps(modules, indent=2))
`;
  const output = execFileSync('python3', ['-c', helper], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function groupForModule(moduleName) {
  for (const group of groups) {
    if (group.key === 'root') {
      continue;
    }
    if (group.prefixes.some((prefix) => moduleName === prefix || moduleName.startsWith(`${prefix}.`))) {
      return group;
    }
  }
  return groups.find((group) => group.key === 'root');
}

function docLines(docstring) {
  const body = md(docstring);
  return body ? `${body}\n` : 'No docstring.\n';
}

function fieldsTable(fields = []) {
  if (!fields.length) {
    return '';
  }
  const rows = [
    '| Field | Type | Default |',
    '| --- | --- | --- |',
    ...fields.map((field) => `| \`${escapeMdx(field.name)}\` | ${escapeMdx(field.annotation) || '—'} | ${escapeMdx(field.default) || '—'} |`),
  ];
  return `\n#### Fields\n\n${rows.join('\n')}\n`;
}

function methodsTable(methods = []) {
  if (!methods.length) {
    return '';
  }
  const rows = [
    '| Method | Signature | Summary |',
    '| --- | --- | --- |',
    ...methods.map((method) => {
      const summary = String(method.docstring ?? '').trim().split('\n')[0] || '—';
      return `| \`${escapeCodeSpan(method.name)}\` | \`${escapeCodeSpan(method.signature)}\` | ${escapeMdx(summary)} |`;
    }),
  ];
  return `\n#### Public methods\n\n${rows.join('\n')}\n`;
}

function symbolSection(moduleName, symbol) {
  const fqName = `${moduleName}.${symbol.name}`;
  const lines = [];
  lines.push(`### \`${fqName}\``);
  lines.push('');
  lines.push(`**Kind:** ${symbol.kind}`);
  if (symbol.signature) {
    lines.push('');
    lines.push('```python');
    lines.push(`${symbol.name}${symbol.signature}`);
    lines.push('```');
  }
  if (symbol.bases?.length) {
    lines.push('');
    lines.push(`**Bases:** ${symbol.bases.map((base) => `\`${escapeCodeSpan(base)}\``).join(', ')}`);
  }
  if (symbol.decorators?.length) {
    lines.push('');
    lines.push(`**Decorators:** ${symbol.decorators.map((decorator) => `\`${escapeCodeSpan(decorator)}\``).join(', ')}`);
  }
  lines.push('');
  lines.push(docLines(symbol.docstring));
  lines.push(fieldsTable(symbol.fields));
  lines.push(methodsTable(symbol.methods));
  return lines.join('\n');
}

function moduleSection(module) {
  const lines = [];
  lines.push(`## \`${module.module}\``);
  lines.push('');
  lines.push(`**Source:** \`python/${module.source}\``);
  lines.push('');
  if (module.all?.length) {
    lines.push(`**Exports:** ${module.all.map((name) => `\`${escapeCodeSpan(name)}\``).join(', ')}`);
    lines.push('');
  }
  if (module.docstring) {
    lines.push(docLines(module.docstring));
  }
  if (!module.symbols.length) {
    lines.push('No public classes or functions defined directly in this module.');
    lines.push('');
    return lines.join('\n');
  }
  for (const symbol of module.symbols) {
    lines.push(symbolSection(module.module, symbol));
    lines.push('');
  }
  return lines.join('\n');
}

function generatedPage(group, modules) {
  const lines = [];
  lines.push('---');
  lines.push(`sidebar_position: ${group.position}`);
  lines.push(`sidebar_label: ${group.title}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${group.title}`);
  lines.push('');
  lines.push(':::info[Generated reference]');
  lines.push('This page is generated from the Python source under `python/t76`. Do not edit it by hand; update source docstrings or the generator instead.');
  lines.push(':::');
  lines.push('');
  if (group.internal) {
    lines.push(':::warning[Internal UI surface]');
    lines.push('These APIs back the Textual terminal app. Prefer `t76.drpd.device` for automation scripts unless you are extending the terminal UI.');
    lines.push(':::');
    lines.push('');
  }
  lines.push(group.description);
  lines.push('');
  for (const module of modules) {
    lines.push(moduleSection(module));
  }
  return `${lines.join('\n')}\n`;
}

function writeCategoryFile() {
  fs.mkdirSync(outputDir, {recursive: true});
  const category = {
    label: 'Python API Reference',
    position: 30,
    collapsible: true,
    collapsed: false,
    link: {
      type: 'generated-index',
      title: 'Python API Reference',
      description: 'Generated reference for the Dr. PD Python package.',
    },
  };
  fs.writeFileSync(path.join(outputDir, '_category_.json'), `${JSON.stringify(category, null, 2)}\n`);
}

function main() {
  const modules = loadApiJson();
  const grouped = new Map(groups.map((group) => [group.key, []]));
  for (const module of modules) {
    const group = groupForModule(module.module);
    grouped.get(group.key).push(module);
  }

  writeCategoryFile();
  let moduleCount = 0;
  let symbolCount = 0;
  for (const group of groups) {
    const groupModules = grouped.get(group.key) ?? [];
    if (!groupModules.length) {
      continue;
    }
    moduleCount += groupModules.length;
    symbolCount += groupModules.reduce((count, module) => count + module.symbols.length, 0);
    fs.writeFileSync(
      path.join(outputDir, `${group.slug}.mdx`),
      generatedPage(group, groupModules),
    );
  }

  console.log(`Generated Python API reference for ${moduleCount} modules and ${symbolCount} public symbols.`);
}

main();
