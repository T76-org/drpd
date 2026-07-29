#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const upstreamCommit = 'b031159eb74aaa7eef2b026fd85d35bc05ff2095';
const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorRoot = path.join(docsRoot, 'vendor', 'kicanvas');
const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'drpd-kicanvas-refresh-'));

function run(command, args, cwd = checkout) {
  execFileSync(command, args, {cwd, stdio: 'inherit', env: {...process.env, npm_config_cache: process.env.npm_config_cache || '/tmp/.npm-codex'}});
}

run('git', ['clone', 'https://github.com/theacodes/kicanvas.git', '.']);
run('git', ['checkout', upstreamCommit]);
run('git', ['apply', path.join(vendorRoot, 'deep-linking.patch')]);
run('npm', ['ci']);
run('npm', ['run', 'build']);

const bundle = fs.readFileSync(path.join(checkout, 'build', 'kicanvas.js'));
fs.copyFileSync(path.join(checkout, 'build', 'kicanvas.js'), path.join(vendorRoot, 'kicanvas.js'));
console.log(`KiCanvas bundle SHA-256: ${createHash('sha256').update(bundle).digest('hex')}`);
console.log(`KiCanvas bundle size: ${bundle.length} bytes`);
console.log('Verify these values against docs/vendor/kicanvas/PROVENANCE.md.');
