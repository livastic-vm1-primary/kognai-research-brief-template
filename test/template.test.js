import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE, planRun, runTemplate } from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = async () => mkdtemp(path.join(os.tmpdir(), 'kognai-brief-test-'));
const outputArg = args => args[args.indexOf('--out-dir') + 1];

// A1: the template registry shape is engine-compatible and does not invent measurements.
test('A1: registry shape and cost measurement metadata are explicit', async () => {
  const d = JSON.parse(await readFile(path.join(root, 'kognai-template.json'), 'utf8'));
  for (const k of ['id','name','intent','default_profile','composition','workflow','skills','tools','cost_per_run']) assert.ok(k in d, `missing ${k}`);
  assert.ok(d.intent.length > 0);
  assert.ok(d.composition.roles.length > 0);
  assert.equal(d.cost_per_run.cloud_usd, null, 'cloud cost must not be fabricated');
  assert.equal(d.cost_per_run.sovereign_usd, 0);
  assert.match(d.cost_per_run.measured_on, /Not yet measured/);
  assert.deepEqual(TEMPLATE.id, d.id);
});

// A2: a brief turns into engine goal arguments, correct destination, and sovereign flag without a key.
test('A2: planRun maps brief to @kognai/build goal args without credentials', () => {
  const p = planRun({ brief: 'Compare publicly documented Base x402 payment APIs', sovereign: true, apiKey: 'MUST-NOT-LEAK' }, './out');
  assert.ok(p.args.includes('--goal'));
  assert.ok(p.args.includes('--out-dir'));
  assert.ok(p.args.includes('--sovereign'));
  assert.equal(p.args[p.args.indexOf('--out-dir') + 1], path.resolve('./out'));
  assert.match(p.args[p.args.indexOf('--goal') + 1], /cite|source/i);
  assert.ok(!p.args.join(' ').includes('MUST-NOT-LEAK'));
  assert.throws(() => planRun({ brief: ' ' }, './out'), /brief/);
  assert.throws(() => planRun({ brief: 'Hello' }, ' '), /outDir/);
});

// A3: a successful injected runner produces a packaged product and measured cloud cost.
test('A3: runTemplate packages source files and reports engine cost', async () => {
  const d = await temp();
  try {
    const result = await runTemplate({ brief: 'Provide a citation backed comparison of three public facilitators.' }, {
      outDir: path.join(d, 'out'),
      exec: async args => {
        const out = outputArg(args);
        await mkdir(out, { recursive: true });
        await writeFile(path.join(out, 'research-brief.md'), '# Actual output\n\nSource [1].\n');
        return { code: 0, stdout: 'Total: 12s · 2 model calls · $0.0123\n', stderr: '' };
      },
    });
    assert.equal(result.cost_usd, 0.0123);
    assert.ok(result.files.includes('product/research-brief.md'));
    assert.ok(result.files.includes('PRODUCT.md'));
    assert.match(await readFile(path.join(result.outDir, 'PRODUCT.md'), 'utf8'), /Reported engine cost.*\$0.0123/);
    assert.equal((await readdir(path.join(result.outDir))).includes('.kognai-engine-output'), false);
  } finally { await rm(d, { recursive: true, force: true }); }
});

// A4: nonzero engine exit and successful-but-empty output fail clearly; cloud costs cannot be guessed.
test('A4: engine failures, empty output, and missing cost are rejected', async () => {
  const d = await temp();
  try {
    await assert.rejects(runTemplate({ brief: 'A brief' }, { outDir: path.join(d, 'fail'), exec: async () => ({ code: 2, stdout: '', stderr: 'engine rejected input' }) }), /engine rejected input/);
    await assert.rejects(runTemplate({ brief: 'A brief' }, { outDir: path.join(d, 'empty'), exec: async args => { await mkdir(outputArg(args), { recursive: true }); return { code: 0, stdout: 'Total: $0.0000', stderr: '' }; } }), /wrote no deliverable files/);
    await assert.rejects(runTemplate({ brief: 'A brief' }, { outDir: path.join(d, 'uncosted'), exec: async args => { const out=outputArg(args); await mkdir(out,{recursive:true}); await writeFile(path.join(out,'x.md'),'ok'); return { code: 0, stdout:'complete successfully', stderr:'' }; } }), /measurable cloud cost/);
    const sovereign = await runTemplate({ brief: 'A brief', sovereign: true }, { outDir: path.join(d,'sovereign'), exec: async args => { const out=outputArg(args); await mkdir(out,{recursive:true}); await writeFile(path.join(out,'x.md'),'local'); return { code:0, stdout:'Local run no cloud cost footer', stderr:'' }; } });
    assert.equal(sovereign.cost_usd, 0);
  } finally { await rm(d, { recursive: true, force: true }); }
});

// A5: npm lockfile is present; lifecycle scripts cannot execute arbitrary install code.
test('A5: clean install metadata is locked and has no lifecycle scripts', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.ok(lock.lockfileVersion >= 3);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(pkg.dependencies['@kognai/build'], '0.7.10');
  for (const [k,v] of Object.entries(pkg.scripts || {})) assert.ok(!/^(preinstall|install|postinstall|prepare)$/.test(k), `${k} must not run on install`);
  assert.ok((pkg.dependencies['@kognai/build'] || '').includes('0.7.10'));
});

// A6: docs and a clearly synthetic sample are available in the package.
test('A6: README documents cloud, sovereign mode, costs, and explicit sample limitations', async () => {
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /Run on the cloud/i);
  assert.match(readme, /Run in sovereign mode/i);
  assert.match(readme, /Cost per run/i);
  assert.match(readme, /sample output/i);
  assert.match(await readFile(path.join(root, 'examples/sample-product/README.md'), 'utf8'), /synthetic/i);
  assert.ok(JSON.parse(await readFile(path.join(root, 'kognai-template.json'), 'utf8')).cost_per_run.cloud_usd === null);
});

// CLI usage behavior.
test('CLI rejects empty invocation with usage exit code 2', () => {
  const cli = path.join(root,'bin/kognai-research-brief.js');
  const r = spawnSync(process.execPath, [cli], { encoding:'utf8' });
  assert.equal(r.status,2);
  assert.match(r.stderr,/Usage:/);
});
