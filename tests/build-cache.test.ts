import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  BuildCacheEntry,
  detectBuildCaches,
  parseBuildCachePaths,
  mergeBuildCaches,
  getPnpmStoreDir,
} from '../lib/utils';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'build-cache-test-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('detectBuildCaches', () => {
  it('should detect turbo.json with default path', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'turbo.json'), '{}');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'turbo', path: path.resolve(tmpDir, '.turbo/cache') },
    ]);
  });

  it('should detect turbo.json with custom cacheDir', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'turbo.json'),
      JSON.stringify({ cacheDir: 'custom/turbo-cache' }),
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'turbo', path: path.resolve(tmpDir, 'custom/turbo-cache') },
    ]);
  });

  it('should detect turbo.json with absolute cacheDir', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'turbo.json'),
      JSON.stringify({ cacheDir: '/tmp/turbo-abs' }),
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([{ name: 'turbo', path: '/tmp/turbo-abs' }]);
  });

  it('should detect nx.json with default path', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'nx.json'), '{}');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'nx', path: path.resolve(tmpDir, '.nx/cache') },
    ]);
  });

  it('should detect nx.json with custom cacheDirectory', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'nx.json'),
      JSON.stringify({ cacheDirectory: 'custom/nx-cache' }),
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'nx', path: path.resolve(tmpDir, 'custom/nx-cache') },
    ]);
  });

  it('should detect nx.json with legacy tasksRunnerOptions path', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'nx.json'),
      JSON.stringify({
        tasksRunnerOptions: {
          default: { options: { cacheDirectory: 'legacy/nx-cache' } },
        },
      }),
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'nx', path: path.resolve(tmpDir, 'legacy/nx-cache') },
    ]);
  });

  it('should detect next.config.js', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'next.config.js'), 'module.exports = {}');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'nextjs', path: path.resolve(tmpDir, '.next/cache') },
    ]);
  });

  it('should detect next.config.mjs', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'next.config.mjs'), 'export default {}');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'nextjs', path: path.resolve(tmpDir, '.next/cache') },
    ]);
  });

  it('should detect next.config.ts', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'next.config.ts'), 'export default {}');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'nextjs', path: path.resolve(tmpDir, '.next/cache') },
    ]);
  });

  it('should detect multiple build systems simultaneously', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'turbo.json'), '{}');
    await fs.promises.writeFile(path.join(tmpDir, 'nx.json'), '{}');
    await fs.promises.writeFile(path.join(tmpDir, 'next.config.js'), '');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toHaveLength(3);
    expect(result.map(e => e.name)).toEqual(['turbo', 'nx', 'nextjs']);
  });

  it('should detect yarn berry cache with enableGlobalCache: false', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'enableGlobalCache: false\nnodeLinker: node-modules\n',
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'yarn-cache', path: path.resolve(tmpDir, '.yarn/cache') },
    ]);
  });

  it('should detect yarn berry cache with custom cacheFolder', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'enableGlobalCache: false\ncacheFolder: ".custom-yarn-cache"\n',
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'yarn-cache', path: path.resolve(tmpDir, '.custom-yarn-cache') },
    ]);
  });

  it('should skip yarn cache when enableGlobalCache is true', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'enableGlobalCache: true\nnodeLinker: node-modules\n',
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([]);
  });

  it('should skip yarn cache when enableGlobalCache is not set (defaults to true)', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'nodeLinker: node-modules\n',
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([]);
  });

  it('should skip yarn cache when no yarn.lock', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'enableGlobalCache: false\n',
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([]);
  });

  it('should detect yarn cache alongside other build systems', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'enableGlobalCache: false\n',
    );
    await fs.promises.writeFile(path.join(tmpDir, 'turbo.json'), '{}');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['turbo', 'yarn-cache']);
  });

  it('should detect pnpm store with default path', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('pnpm-store');
    expect(result[0].path).toContain('pnpm');
    expect(result[0].path).toContain('store');
  });

  it('should detect pnpm store with custom store-dir from .npmrc', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.npmrc'),
      'store-dir=/custom/pnpm-store\n',
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'pnpm-store', path: '/custom/pnpm-store' },
    ]);
  });

  it('should detect pnpm store with relative store-dir from .npmrc', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.npmrc'),
      'store-dir=.pnpm-store\n',
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'pnpm-store', path: path.resolve(tmpDir, '.pnpm-store') },
    ]);
  });

  it('should not detect pnpm store without pnpm-lock.yaml', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, '.npmrc'),
      'store-dir=/custom/store\n',
    );
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([]);
  });

  it('should return empty array when no build systems detected', async () => {
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([]);
  });

  it('should use default path for malformed turbo.json', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'turbo.json'), '{invalid json');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'turbo', path: path.resolve(tmpDir, '.turbo/cache') },
    ]);
  });

  it('should use default path for malformed nx.json', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'nx.json'), '{invalid json');
    const result = await detectBuildCaches(tmpDir);
    expect(result).toEqual([
      { name: 'nx', path: path.resolve(tmpDir, '.nx/cache') },
    ]);
  });
});

describe('parseBuildCachePaths', () => {
  it('should parse a single entry', () => {
    const result = parseBuildCachePaths('turbo:.turbo/cache', tmpDir);
    expect(result).toEqual([
      { name: 'turbo', path: path.resolve(tmpDir, '.turbo/cache') },
    ]);
  });

  it('should parse multiple entries', () => {
    const input = 'turbo:.turbo/cache\nnx:.nx/cache';
    const result = parseBuildCachePaths(input, tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('turbo');
    expect(result[1].name).toBe('nx');
  });

  it('should skip empty lines and whitespace', () => {
    const input = '  \nturbo:.turbo/cache\n\n  \nnx:.nx/cache\n';
    const result = parseBuildCachePaths(input, tmpDir);
    expect(result).toHaveLength(2);
  });

  it('should return empty array for empty input', () => {
    expect(parseBuildCachePaths('', tmpDir)).toEqual([]);
    expect(parseBuildCachePaths('  \n  ', tmpDir)).toEqual([]);
  });

  it('should handle absolute paths', () => {
    const result = parseBuildCachePaths('turbo:/tmp/turbo-cache', tmpDir);
    expect(result).toEqual([{ name: 'turbo', path: '/tmp/turbo-cache' }]);
  });

  it('should skip lines without a colon', () => {
    const input = 'no-colon-here\nturbo:.turbo/cache';
    const result = parseBuildCachePaths(input, tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('turbo');
  });
});

describe('mergeBuildCaches', () => {
  it('should preserve auto-detected when no overrides', () => {
    const auto: BuildCacheEntry[] = [
      { name: 'turbo', path: '/a' },
      { name: 'nx', path: '/b' },
    ];
    const result = mergeBuildCaches(auto, []);
    expect(result).toEqual(auto);
  });

  it('should allow user to override by name', () => {
    const auto: BuildCacheEntry[] = [{ name: 'turbo', path: '/default' }];
    const user: BuildCacheEntry[] = [{ name: 'turbo', path: '/custom' }];
    const result = mergeBuildCaches(auto, user);
    expect(result).toEqual([{ name: 'turbo', path: '/custom' }]);
  });

  it('should allow user to add new entries', () => {
    const auto: BuildCacheEntry[] = [{ name: 'turbo', path: '/a' }];
    const user: BuildCacheEntry[] = [{ name: 'custom', path: '/c' }];
    const result = mergeBuildCaches(auto, user);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['turbo', 'custom']);
  });

  it('should return empty when both are empty', () => {
    expect(mergeBuildCaches([], [])).toEqual([]);
  });
});
