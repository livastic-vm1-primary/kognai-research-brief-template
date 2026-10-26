#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { runTemplate } from '../src/index.js';

function usage() {
  process.stderr.write('Usage: kognai-research-brief <brief> [--sovereign] [--out-dir <directory>]\n');
  process.exit(2);
}
const args = process.argv.slice(2);
let brief = ''; let sovereign = false; let outDir = path.resolve('research-brief-output');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sovereign') { sovereign = true; continue; }
  if (args[i] === '--out-dir') { if (!args[i+1]) usage(); outDir = args[++i]; continue; }
  if (args[i].startsWith('-')) usage();
  brief += (brief ? ' ' : '') + args[i];
}
if (!brief.trim()) usage();
try {
  const result = await runTemplate({ brief, sovereign }, { outDir });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (e) {
  process.stderr.write(`Research-brief build failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
}
