// The CV page is built from one data file: <content>/cv.yaml. Kept free of astro imports for tests.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'astro/zod';
import { slugify } from './content.js';

const period = { start: z.coerce.string(), end: z.coerce.string().optional() }; // "2024", "2024-09", or end: present
const schema = z.object({
  name: z.string(),
  headline: z.string().optional(),
  location: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  links: z.array(z.object({ label: z.string(), href: z.string().url(), icon: z.string().optional() })).default([]),
  summary: z.string().optional(),
  experience: z.array(z.object({ role: z.string(), org: z.string(), location: z.string().optional(), ...period, points: z.array(z.string()).default([]) })).default([]),
  education: z.array(z.object({ degree: z.string(), school: z.string(), location: z.string().optional(), ...period, points: z.array(z.string()).default([]) })).default([]),
  projects: z.array(z.object({ name: z.string(), href: z.string().optional(), description: z.string().optional() })).default([]),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })).default([]),
  languages: z.array(z.object({ name: z.string(), level: z.string().optional() })).default([]),
  awards: z.array(z.object({ name: z.string(), year: z.coerce.string().optional(), description: z.string().optional() })).default([]),
}).strict();

/** Parses and checks cv.yaml text; errors name the field that is wrong. */
export function parseCv(text, file = 'cv.yaml') {
  const result = schema.safeParse(parse(text) ?? {});
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.') || '(top level)'}: ${i.message}`);
    throw new Error(`${file} has problems:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}

export function loadCv(contentDir) {
  const file = join(contentDir, 'cv.yaml');
  return existsSync(file) ? parseCv(readFileSync(file, 'utf8'), file) : null;
}

/** "2023-09" -> "Sep 2023", "2024" -> "2024", "present" -> "Present". */
export function formatMonth(value) {
  if (!value) return '';
  if (/^present$/i.test(value)) return 'Present';
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const formatPeriod = ({ start, end }) => (end ? `${formatMonth(start)} – ${formatMonth(end)}` : formatMonth(start));

/** File name of the CV's PDF: "Frederik Example" -> "frederik-example-cv.pdf". */
export const cvPdfName = (name) => (slugify(name) ? `${slugify(name)}-cv.pdf` : 'cv.pdf');
