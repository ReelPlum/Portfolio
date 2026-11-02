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

describe('deploy builds', () => {
  const deploySteps = workflow.jobs.deploy.steps;
  it('check out the full history, so each post lists every commit that changed it', () => {
    for (const job of ['test', 'deploy']) {
      const checkout = workflow.jobs[job].steps.find((s) => s.uses?.startsWith('actions/checkout@'));
      expect(checkout.with?.['fetch-depth'], job).toBe(0);
    }
  });
  it('install Chromium before building, and fail if the CV PDF or preview images cannot be made', () => {
    const install = deploySteps.findIndex((s) => /playwright install .*chromium/.test(s.run || ''));
    const build = deploySteps.findIndex((s) => s.run === 'npm run build');
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(build);
    expect(deploySteps[build].env.RENDERS).toBe('required');
  });
});

describe('link checks', () => {
  const links = parse(readFileSync(new URL('../../.github/workflows/links.yml', import.meta.url), 'utf8'));
  const linkSteps = links.jobs.links.steps;
  it('the deploy checks internal links, images and embeds after building and before uploading', () => {
    const deploySteps = workflow.jobs.deploy.steps;
    const build = deploySteps.findIndex((s) => s.run === 'npm run build');
    const check = deploySteps.findIndex((s) => s.run === 'npm run check:links');
    const upload = deploySteps.findIndex((s) => s.uses?.startsWith('actions/upload-pages-artifact@'));
    expect(build).toBeLessThan(check);
    expect(check).toBeLessThan(upload);
    expect(deploySteps[check].env.BASE_PATH).toBe(deploySteps[build].env.BASE_PATH);
  });
  it('links to other sites are checked on pull requests, on main and every week', () => {
    expect(Object.keys(links.on)).toEqual(expect.arrayContaining(['push', 'pull_request', 'schedule', 'workflow_dispatch']));
    expect(links.on.schedule[0].cron).toMatch(/^\d+ \d+ \* \* \d$/);
    expect(linkSteps.at(-1).run).toBe('npm run check:links -- --external');
  });
  it('builds the real site with its preview images, so links to them are checked too', () => {
    const install = linkSteps.findIndex((s) => /playwright install .*chromium/.test(s.run || ''));
    const build = linkSteps.findIndex((s) => s.run === 'npm run build');
    expect(install).toBeLessThan(build);
    expect(linkSteps[build].env.RENDERS).toBe('required');
  });
  it('uses action versions that run on Node 24', () => {
    for (const ref of linkSteps.map((s) => s.uses).filter(Boolean)) {
      const [name, version] = ref.split('@');
      if (name in MIN_MAJOR) expect(Number(version.replace(/^v/, '')), ref).toBeGreaterThanOrEqual(MIN_MAJOR[name]);
    }
  });
});

describe('visual regression tests', () => {
  const visual = parse(readFileSync(new URL('../../.github/workflows/visual.yml', import.meta.url), 'utf8'));
  const job = visual.jobs.visual;
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

  it('run in the Playwright image that matches the pinned Playwright version, so screenshots are stable', () => {
    const version = pkg.devDependencies['@playwright/test'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/); // pinned exactly
    expect(pkg.devDependencies.playwright).toBe(version);
    expect(job.container.image).toBe(`mcr.microsoft.com/playwright:v${version}-noble`);
  });

  it('add missing screenshots on every run, and replace them all when run with "update"', () => {
    expect(visual.on.workflow_dispatch.inputs.update.type).toBe('boolean');
    const compare = job.steps.find((s) => s.name === 'Compare screenshots');
    expect(compare.run).toBe("npm run test:visual -- --update-snapshots=${{ inputs.update && 'all' || 'missing' }}");
    const commit = job.steps.find((s) => s.name === 'Commit new or updated screenshots');
    expect(commit.run).toContain('git add tests/visual/baselines');
    expect(commit.if).toContain('head.repo.full_name == github.repository');
    expect(job.steps.find((s) => s.uses?.startsWith('actions/checkout@')).with.ref).toBe('${{ github.head_ref || github.ref_name }}');
    expect(visual.permissions.contents).toBe('write');
  });

  it('cover light and dark mode at phone, 1080p and 4K sizes', async () => {
    const { default: config } = await import('../../playwright.visual.config.js');
    const projects = Object.fromEntries(config.projects.map((p) => [p.name, p.use]));
    expect(Object.keys(projects).sort()).toEqual(['1080p-dark', '1080p-light', '4k-dark', '4k-light', 'phone-dark', 'phone-light']);
    expect(projects['4k-light'].viewport).toEqual({ width: 3840, height: 2160 });
    expect(projects['1080p-dark'].viewport).toEqual({ width: 1920, height: 1080 });
    expect(projects['phone-dark'].isMobile).toBe(true);
    expect(projects['phone-dark'].colorScheme).toBe('dark');
    expect(config.retries).toBe(0);
    expect(config.snapshotPathTemplate).toBe('tests/visual/baselines/{arg}-{projectName}{ext}');
  });
});
