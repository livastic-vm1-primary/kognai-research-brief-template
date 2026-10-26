import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const TEMPLATE = Object.freeze({
  id: 'research-brief-source-first-livastic',
  name: 'Source-first Research Brief',
  intent: ['research brief', 'research synthesis', 'market landscape', 'technical comparison', 'citation backed report'],
  default_profile: { primary: 'quality', secondary: ['maintainability', 'compliance'] },
  composition: { roles: [{ role: 'researcher', count: 2 }, { role: 'synthesizer', count: 1 }, { role: 'reviewer', count: 1 }] },
  workflow: 'Clarify scope -> compile source-grounded evidence -> extract claims with references -> reconcile conflicts and unknowns -> synthesize a brief -> review factual support and limitations -> ship only reproducible files',
  skills: ['citation-validation', 'source-credibility', 'claim-extraction', 'uncertainty-reporting'],
  tools: ['web-search', 'markdown-editor', 'citation-manager'],
});

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export function planRun(input, outDir) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be an object');
  if (!nonEmpty(input.brief)) throw new TypeError('brief must be a non-empty string');
  if (!nonEmpty(outDir)) throw new TypeError('outDir must be a non-empty path');
  const brief = input.brief.trim();
  const sovereign = input.sovereign === true;
  const goal = [
    'Create a source-first research brief product from the following user brief.',
    'Requirements: produce README.md and research-brief.md, include a concise executive summary, numbered claims with traceable source URLs where available, methodology, uncertainties, and a limitations section.',
    'Never invent sources, URLs, measurements, quotations, or completed checks. Clearly mark missing evidence and estimates. Cite each factual claim. Separate fact, inference, and recommendation. Do not include credentials or secrets.',
    `User brief:\n${brief}`,
  ].join('\n\n');
  const args = ['--goal', goal, '--out-dir', path.resolve(outDir)];
  if (sovereign) args.push('--sovereign');
  return { args, goal, sovereign };
}

function parseCost(stdout, sovereign) {
  if (sovereign) return 0;
  // @kognai/build prints an explicit `Total: ... $0.0123` footer.
  const matches = [...String(stdout).matchAll(/Total:\s*[^\n$]{1,80}\$([0-9]+(?:\.[0-9]+)?)/g)];
  if (!matches.length) throw new Error('Engine did not report a measurable cloud cost (expected the @kognai/build Total: ... $N footer).');
  const cost = Number(matches.at(-1)[1]);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('Engine reported an invalid cloud cost.');
  return cost;
}

async function defaultExec(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', '@kognai/build@0.7.10', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: process.env,
    });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function collectFiles(dir, relative = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = path.posix.join(relative, entry.name);
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) result.push(...await collectFiles(abs, rel));
    else if (entry.isFile()) result.push(rel);
  }
  return result;
}

function cleanDisplayBrief(brief) {
  return brief.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 2000);
}

/**
 * Execute @kognai/build via an injected runner (safe and deterministic in tests),
 * then copy engine artifacts into a self-contained product directory.
 * @param {object} input
 * @param {object} options {outDir, exec}
 * @returns {Promise<{outDir:string,files:string[],cost_usd:number}>}
 */
export async function runTemplate(input, options = {}) {
  if (!options || typeof options !== 'object') throw new TypeError('options must be an object');
  if (!nonEmpty(options.outDir)) throw new TypeError('options.outDir must be a non-empty path');
  const dest = path.resolve(options.outDir);
  const parent = path.dirname(dest);
  if (dest === path.parse(dest).root || dest === parent) throw new Error('Refusing unsafe output directory.');
  const plan = planRun(input, dest);
  const exec = options.exec ?? defaultExec;
  if (typeof exec !== 'function') throw new TypeError('exec must be a function');
  const engineOut = path.join(dest, '.kognai-engine-output');
  await mkdir(engineOut, { recursive: true });
  const args = plan.args.map((arg, i) => i === plan.args.indexOf(path.resolve(dest)) ? engineOut : arg);
  let result;
  try { result = await exec(args); }
  catch (error) { throw new Error(`@kognai/build execution failed: ${error instanceof Error ? error.message : String(error)}`); }
  if (!result || result.code !== 0) {
    const reason = String(result?.stderr || result?.stdout || `exit code ${result?.code ?? 'unknown'}`).trim().slice(-1200);
    throw new Error(`@kognai/build failed (${result?.code ?? 'unknown'}): ${reason || 'no diagnostic output'}`);
  }
  const cost = parseCost(result.stdout, plan.sovereign);
  let engineFiles;
  try { engineFiles = await collectFiles(engineOut); }
  catch (error) { throw new Error(`Could not read @kognai/build output: ${error instanceof Error ? error.message : String(error)}`); }
  if (!engineFiles.length) throw new Error('@kognai/build completed successfully but wrote no deliverable files.');

  const files = [];
  for (const rel of engineFiles) {
    const from = path.resolve(engineOut, rel);
    if (!from.startsWith(engineOut + path.sep)) throw new Error('Engine output path escaped the assigned output directory.');
    const info = await stat(from);
    if (!info.isFile()) continue;
    // The engine output folder is already within the product root; flatten its files into product/.
    const destRel = path.posix.join('product', rel.split(path.sep).join('/'));
    const to = path.resolve(dest, destRel);
    if (!to.startsWith(dest + path.sep)) throw new Error('Output path escaped the assigned output directory.');
    await mkdir(path.dirname(to), { recursive: true });
    const { copyFile } = await import('node:fs/promises');
    await copyFile(from, to);
    files.push(destRel);
  }
  if (!files.length) throw new Error('@kognai/build produced no regular files to package.');
  const brief = cleanDisplayBrief(input.brief);
  const indexPath = path.join(dest, 'PRODUCT.md');
  const index = [
    '# Source-first research brief', '',
    `**Brief:** ${brief.replace(/\n/g, ' ')}`, '',
    `**Execution mode:** ${plan.sovereign ? 'sovereign/local' : 'cloud'}`, '',
    `**Reported engine cost:** $${cost.toFixed(4)}`, '',
    '## Files', '',
    ...files.map(file => `- [${file}](./${file.split('/').map(encodeURIComponent).join('/')})`), '',
    '## Reproducibility and limitations', '',
    '- The product files are copied from the @kognai/build output; the index does not claim independent fact-checking.',
    '- Check each claim against its cited source. Missing sources or unsupported claims must remain clearly marked.',
    '- The cost is the engine-reported cost; hosting, taxes, labor and any external tools are not included.',
  ].join('\n') + '\n';
  await writeFile(indexPath, index, 'utf8');
  files.push('PRODUCT.md');
  // The internal engine output is temporary working data, not part of the product deliverable.
  const { rm } = await import('node:fs/promises');
  await rm(engineOut, { recursive: true, force: true });
  return { outDir: dest, files, cost_usd: cost };
}
