import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const workflow = parse(readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8'));
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
const uses = steps.map((s) => s.uses).filter(Boolean);

// The first major version of each action that runs on Node 24 (Node 20 actions are deprecated).
const MIN_MAJOR = {
  'actions/checkout': 5,
  'actions/setup-node': 5,
  'actions/upload-artifact': 5,
  'actions/configure-pages': 6,
  'actions/upload-pages-artifact': 5,
  'actions/deploy-pages': 5,
};

describe('deploy workflow', () => {
  it('uses only action versions that run on Node 24', () => {
    for (const ref of uses) {
      const [name, version] = ref.split('@');
      if (!(name in MIN_MAJOR)) continue;
      const major = Number(version.replace(/^v/, '').split('.')[0]);
      expect(major, ref).toBeGreaterThanOrEqual(MIN_MAJOR[name]);
    }
  });

  // Regression: re-running the deploy job left two "github-pages" artifacts in the run,
  // and deploy-pages failed with "Multiple artifacts named github-pages".
  it('names the Pages artifact per attempt and deploys that same artifact', () => {
    const upload = steps.find((s) => s.uses?.startsWith('actions/upload-pages-artifact@'));
    const deploy = steps.find((s) => s.uses?.startsWith('actions/deploy-pages@'));
    expect(upload.with.name).toContain('${{ github.run_attempt }}');
    expect(deploy.with.artifact_name).toBe(upload.with.name);
  });

  // Regression: re-running an old run on main cancelled the newest run through the shared
  // concurrency group, so the latest commit never deployed.
  it('never cancels runs on main, and deploys one at a time without cancelling', () => {
    const { group, 'cancel-in-progress': cancel } = workflow.concurrency;
    expect(cancel).toBe("${{ github.event_name == 'pull_request' }}");
    expect(group).toContain('github.run_id');
    expect(workflow.jobs.deploy.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false });
  });

  it('uploads exactly one Pages artifact', () => {
    expect(uses.filter((u) => u.startsWith('actions/upload-pages-artifact@'))).toHaveLength(1);
  });
});
