#!/usr/bin/env node
// Checks the byte budgets in lighthouse-budget.json against the results of `lhci collect`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import site from '../site.config.js';
import { checkBudgets } from '../src/lib/lighthouse-budget.js';

const dir = '.lighthouseci';
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^lhr-.*\.json$/.test(f)) : [];
if (!files.length) {
  console.error('No Lighthouse results in .lighthouseci/. Run npx lhci collect first.');
  process.exit(2);
}
const budget = JSON.parse(readFileSync('lighthouse-budget.json', 'utf8'));
const { lines, failures } = checkBudgets(files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))), budget, process.env.BASE_PATH || site.base);
lines.forEach((l) => console.log(l));
failures.forEach((f) => console.error(`over budget: ${f}`));
process.exit(failures.length ? 1 : 0);
