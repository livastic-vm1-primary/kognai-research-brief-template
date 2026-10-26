# Kognai Source-first Research Brief Template

A reusable product template for `@kognai/build` 0.7.10 that turns a written brief into a folder of research deliverables. It requests a concise executive summary, claims with traceable source URLs, methodology, unresolved uncertainties and limitations. The template is designed for market landscapes, technical comparisons and research briefs where provenance matters.

## Install

Requires Node 20 or later.

```bash
npm ci
```

## Run on the cloud

Requires a legitimate `ANTHROPIC_API_KEY` already configured in your environment. The key is consumed only by the upstream engine; this template never prints or writes it.

```bash
npx kognai-research-brief "Compare Base USDC x402 payment facilitators using primary sources" --out-dir ./out/cloud
```

The engine prints a `Total: ... $N.NNNN` footer. `runTemplate` parses and reports this actual engine cost. If the footer is absent, it fails instead of inventing a cost. Model usage may incur an upstream charge.

## Run in sovereign mode

Requires a local Ollama service with a compatible model. No cloud inference key is needed.

```bash
npx kognai-research-brief "Prepare a source-first brief from the supplied local notes" --sovereign --out-dir ./out/sovereign
```

The engine is called with `--goal`, `--out-dir` and `--sovereign` as appropriate. In sovereign mode the engine's model inference cost is reported as $0. Hosting, electricity and labor are not $0.

## Programmatic interface

```js
import { planRun, runTemplate } from 'kognai-research-brief-template-livastic-vm1';
const plan = planRun({ brief: 'Compare three public x402 facilitators', sovereign: true }, './out');
const result = await runTemplate({ brief: 'Compare three public x402 facilitators', sovereign: true }, { outDir: './out' });
```

Tests inject an `exec(args)` function, so the acceptance suite needs no network, API key or payment. `runTemplate` rejects an engine error, missing cost report in cloud mode, or a successful run with no files. `PRODUCT.md` lists every produced file with a cost label and limitations. The checked-in `examples/sample-product/` is the clearly labeled synthetic sample output, explicitly marked a deterministic fixture and contains no claimed execution or price measurement.

## Cost per run

No real engine run has succeeded on this machine yet: an Ollama server is not installed, and no real cloud run was performed. Therefore `cost_per_run.cloud_usd` is `null` rather than an invented measurement. `cost_per_run.sovereign_usd` is 0 for inference when the upstream engine uses local Ollama. Run the template on a compatible runtime and update the measured metadata only with actual engine output.

## Acceptance status

- A1 Template registry fields and explicit measured-cost status are present. Real cost measurement remains pending.
- A2 `planRun` produces the required `@kognai/build` CLI args and does not accept or serialize secrets.
- A3 `runTemplate` uses an injected runner, packages output files and reports measured cost.
- A4 Engine failure and empty-output paths reject with plain reasons.
- A5 Node lockfile and tests are offline; no `prepare`, `install`, or `postinstall` script is defined.
- A6 This README documents cloud/sovereign use, costs and a sample product.

This is an AI-assisted implementation, not a claim of selection, independent review, or a paid Kognai contract.
