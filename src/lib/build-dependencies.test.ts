/** @jest-environment node */
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from 'path';

const jestRequire = createRequire(require.resolve('jest'));
const coreRequire = createRequire(jestRequire.resolve('@jest/core'));
const transformRequire = createRequire(coreRequire.resolve('@jest/transform'));
const istanbulRequire = createRequire(
  transformRequire.resolve('babel-plugin-istanbul'),
);
const { loadNycConfig } = istanbulRequire('@istanbuljs/load-nyc-config');

it('loads YAML coverage config after upgrading the legacy YAML dependency', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'luma-nyc-compat-'));
  const packagePath = join(directory, 'package.json');
  const configPath = join(directory, '.nycrc.yaml');
  try {
    writeFileSync(packagePath, '{"name":"luma-nyc-compat-check"}');
    writeFileSync(
      configPath,
      'all: true\ninclude:\n  - "src/**/*.ts"\nexclude:\n  - "**/*.test.ts"\n',
    );
    const config = await loadNycConfig({ cwd: directory });
    expect(config).toMatchObject({
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
    });
  } finally {
    unlinkSync(configPath);
    unlinkSync(packagePath);
    rmdirSync(directory);
  }
});
