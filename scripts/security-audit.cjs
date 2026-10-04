const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const result = spawnSync(
  isWindows ? 'pnpm audit --json' : 'pnpm',
  isWindows ? [] : ['audit', '--json'],
  {
    cwd: root,
    encoding: 'utf8',
    shell: isWindows,
  },
);

try {
  if (result.error) throw result.error;
  const audit = JSON.parse(result.stdout);
  if (audit.error || !audit.metadata || !audit.advisories) {
    throw new Error(
      audit.error?.message || 'Audit did not return a complete result',
    );
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const patchPath = pkg.pnpm?.patchedDependencies?.['braces@3.0.3'];
  const patch = patchPath
    ? fs.readFileSync(path.join(root, patchPath), 'utf8')
    : '';
  const patchHasGuards = ['parse', 'compile', 'expand', 'stringify'].every(
    (name) => {
      const section = patch
        .split(`diff --git a/lib/${name}.js b/lib/${name}.js`)[1]
        ?.split('diff --git')[0];
      return section?.includes(
        "+      throw new SyntaxError('Brace nesting exceeds maximum depth (128)');",
      );
    },
  );

  const remaining = [];
  for (const advisory of Object.values(audit.advisories)) {
    // This single advisory has no published fix. The exact locked version is
    // patched locally, and the regression tests exercise the installed package.
    const mitigated =
      advisory.github_advisory_id === 'GHSA-vfj7-8cjw-p6xm' &&
      advisory.module_name === 'braces' &&
      patchHasGuards &&
      advisory.findings?.length > 0 &&
      advisory.findings.every((finding) => finding.version === '3.0.3');
    if (mitigated) {
      console.log(
        'Locally mitigated: braces GHSA-vfj7-8cjw-p6xm; raw pnpm audit still reports version 3.0.3.',
      );
    } else {
      remaining.push(advisory);
    }
  }

  if (remaining.length) {
    for (const advisory of remaining) {
      console.error(
        `${advisory.severity}: ${advisory.module_name}: ${advisory.title}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log('No unmitigated dependency advisories.');
  }
} catch (error) {
  console.error(`Security audit failed: ${error.message}`);
  process.exitCode = 1;
}
