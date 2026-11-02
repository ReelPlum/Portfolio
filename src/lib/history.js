// Version history of a post or project from git: every commit that changed its file.
// The deploy needs the full history (actions/checkout with fetch-depth: 0); in a shallow clone the
// list is just shorter, and without git it is empty.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SEP = '\u001f';

/** Parses `git log --format=%H%x1f%aI%x1f%an%x1f%s` output. */
export function parseLog(out) {
  return String(out).split('\n').filter(Boolean).map((line) => {
    const [hash, date, author, ...subject] = line.split(SEP);
    return { hash, date, author, subject: subject.join(SEP) };
  });
}

const cache = new Map();
/** Commits that changed `file` (following renames), newest first. */
export function fileHistory(file, { cwd = process.cwd() } = {}) {
  if (!file) return [];
  if (!cache.has(file)) {
    let commits = [];
    try {
      const out = execFileSync('git', ['log', '--follow', `--format=%H${SEP}%aI${SEP}%an${SEP}%s`, '--', file], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      commits = parseLog(out);
    } catch {
      commits = [];
    }
    cache.set(file, commits);
  }
  return cache.get(file);
}

/** Link to the commit on GitHub, opened at this file's part of the diff. */
export function commitUrl(source, hash, file) {
  if (!source) return null;
  const anchor = file ? `#diff-${createHash('sha256').update(file).digest('hex')}` : '';
  return `${source.replace(/\/$/, '')}/commit/${hash}${anchor}`;
}

/** Link to the file as it was at that commit. */
export function fileAtCommitUrl(source, hash, file) {
  return source && file ? `${source.replace(/\/$/, '')}/blob/${hash}/${file}` : null;
}
