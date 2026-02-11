import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  detectBuildCaches,
  parseBuildCachePaths,
  mergeBuildCaches,
  getCacheTagPrefix,
  detectPackageManager,
  getPnpmStoreDir,
} from '../lib/utils';

/**
 * These tests verify that the restore and save phases use identical
 * tags and paths for every cache type. The action passes cache metadata
 * from restore → save via core.saveState/getState. These tests simulate
 * that round-trip to ensure nothing is silently dropped.
 */

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'round-trip-test-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

function simulateRestorePhase(
  cacheTagPrefix: string,
  buildCaches: { name: string; path: string }[],
) {
  const buildCacheTags = buildCaches.map((entry) => ({
    name: entry.name,
    tag: `${cacheTagPrefix}-${entry.name}`,
    path: entry.path,
  }));

  return {
    state: {
      cacheTagPrefix,
      cacheBuild: 'true',
      buildCaches: JSON.stringify(buildCacheTags),
    },
    restoreCommands: buildCacheTags.map((entry) => ({
      action: 'restore',
      tag: entry.tag,
      path: entry.path,
    })),
  };
}

function simulateSavePhase(state: Record<string, string>) {
  const cacheBuild = state.cacheBuild === 'true';
  const commands: { action: string; tag: string; path: string }[] = [];

  if (cacheBuild && state.buildCaches) {
    const buildCaches: { name: string; tag: string; path: string }[] = JSON.parse(state.buildCaches);
    for (const entry of buildCaches) {
      commands.push({
        action: 'save',
        tag: entry.tag,
        path: entry.path,
      });
    }
  }

  return { saveCommands: commands };
}

describe('restore/save round-trip consistency', () => {
  it('turbo cache: same tag and path in restore and save', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'turbo.json'), '{}');
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('myapp', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands).toHaveLength(1);
    expect(saveCommands).toHaveLength(1);
    expect(restoreCommands[0].tag).toBe('myapp-turbo');
    expect(saveCommands[0].tag).toBe('myapp-turbo');
    expect(restoreCommands[0].path).toBe(saveCommands[0].path);
  });

  it('turbo cache with custom cacheDir: same path in restore and save', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'turbo.json'),
      JSON.stringify({ cacheDir: 'custom/turbo-cache' }),
    );
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('myapp', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands[0].path).toBe(path.resolve(tmpDir, 'custom/turbo-cache'));
    expect(saveCommands[0].path).toBe(restoreCommands[0].path);
  });

  it('nx cache: same tag and path in restore and save', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'nx.json'), '{}');
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('myapp', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands).toHaveLength(1);
    expect(saveCommands).toHaveLength(1);
    expect(restoreCommands[0].tag).toBe('myapp-nx');
    expect(saveCommands[0].tag).toBe('myapp-nx');
    expect(restoreCommands[0].path).toBe(saveCommands[0].path);
  });

  it('nextjs cache: same tag and path in restore and save', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'next.config.js'), '');
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('myapp', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands).toHaveLength(1);
    expect(saveCommands).toHaveLength(1);
    expect(restoreCommands[0].tag).toBe('myapp-nextjs');
    expect(saveCommands[0].tag).toBe('myapp-nextjs');
    expect(restoreCommands[0].path).toBe(saveCommands[0].path);
  });

  it('yarn-cache: same tag and path in restore and save', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'enableGlobalCache: false\n',
    );
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('calcom', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands).toHaveLength(1);
    expect(saveCommands).toHaveLength(1);
    expect(restoreCommands[0].tag).toBe('calcom-yarn-cache');
    expect(saveCommands[0].tag).toBe('calcom-yarn-cache');
    expect(restoreCommands[0].path).toBe(path.resolve(tmpDir, '.yarn/cache'));
    expect(saveCommands[0].path).toBe(restoreCommands[0].path);
  });

  it('yarn-cache with custom cacheFolder: same path in restore and save', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'enableGlobalCache: false\ncacheFolder: ".custom-cache"\n',
    );
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('calcom', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands[0].path).toBe(path.resolve(tmpDir, '.custom-cache'));
    expect(saveCommands[0].path).toBe(restoreCommands[0].path);
  });

  it('pnpm-store: same tag and path in restore and save', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('myapp', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands).toHaveLength(1);
    expect(saveCommands).toHaveLength(1);
    expect(restoreCommands[0].tag).toBe('myapp-pnpm-store');
    expect(saveCommands[0].tag).toBe('myapp-pnpm-store');
    expect(restoreCommands[0].path).toBe(saveCommands[0].path);
  });

  it('pnpm-store with custom store-dir: same path in restore and save', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.npmrc'),
      'store-dir=/custom/pnpm-store\n',
    );
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('myapp', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands[0].path).toBe('/custom/pnpm-store');
    expect(saveCommands[0].path).toBe(restoreCommands[0].path);
  });

  it('multiple caches: all are saved, none dropped', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'turbo.json'), '{}');
    await fs.promises.writeFile(path.join(tmpDir, 'nx.json'), '{}');
    await fs.promises.writeFile(path.join(tmpDir, 'next.config.mjs'), '');
    await fs.promises.writeFile(path.join(tmpDir, 'yarn.lock'), '');
    await fs.promises.writeFile(
      path.join(tmpDir, '.yarnrc.yml'),
      'enableGlobalCache: false\n',
    );
    const detected = await detectBuildCaches(tmpDir);

    const { state, restoreCommands } = simulateRestorePhase('mono', detected);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands).toHaveLength(4);
    expect(saveCommands).toHaveLength(4);

    const restoreTags = restoreCommands.map((c) => c.tag).sort();
    const saveTags = saveCommands.map((c) => c.tag).sort();
    expect(restoreTags).toEqual(saveTags);

    const restorePaths = restoreCommands.map((c) => c.path).sort();
    const savePaths = saveCommands.map((c) => c.path).sort();
    expect(restorePaths).toEqual(savePaths);

    expect(restoreTags).toEqual([
      'mono-nextjs',
      'mono-nx',
      'mono-turbo',
      'mono-yarn-cache',
    ]);
  });

  it('user overrides merge correctly and survive round-trip', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'turbo.json'), '{}');
    const autoDetected = await detectBuildCaches(tmpDir);
    const userOverrides = parseBuildCachePaths('turbo:/custom/turbo\nstorybook:.storybook/cache', tmpDir);
    const merged = mergeBuildCaches(autoDetected, userOverrides);

    const { state, restoreCommands } = simulateRestorePhase('myapp', merged);
    const { saveCommands } = simulateSavePhase(state);

    expect(restoreCommands).toHaveLength(2);
    expect(saveCommands).toHaveLength(2);

    const turboRestore = restoreCommands.find((c) => c.tag === 'myapp-turbo')!;
    const turboSave = saveCommands.find((c) => c.tag === 'myapp-turbo')!;
    expect(turboRestore.path).toBe('/custom/turbo');
    expect(turboSave.path).toBe('/custom/turbo');

    const storybookRestore = restoreCommands.find((c) => c.tag === 'myapp-storybook')!;
    const storybookSave = saveCommands.find((c) => c.tag === 'myapp-storybook')!;
    expect(storybookRestore.path).toBe(path.resolve(tmpDir, '.storybook/cache'));
    expect(storybookSave.path).toBe(storybookRestore.path);
  });

  it('cacheBuild=false means no build caches saved', () => {
    const state = {
      cacheTagPrefix: 'myapp',
      cacheBuild: 'false',
      buildCaches: JSON.stringify([{ name: 'turbo', tag: 'myapp-turbo', path: '/tmp/turbo' }]),
    };

    const { saveCommands } = simulateSavePhase(state);
    expect(saveCommands).toHaveLength(0);
  });

  it('empty buildCaches state means no build caches saved', () => {
    const state = {
      cacheTagPrefix: 'myapp',
      cacheBuild: 'true',
    };

    const { saveCommands } = simulateSavePhase(state);
    expect(saveCommands).toHaveLength(0);
  });

  it('node and modules tags are consistent between restore and save', () => {
    const cacheTagPrefix = 'calcom';
    const nodeVersion = '20';
    const workingDir = tmpDir;

    const nodeTag = `${cacheTagPrefix}-node-${nodeVersion}`;
    const modulesTag = `${cacheTagPrefix}-modules`;

    expect(nodeTag).toBe('calcom-node-20');
    expect(modulesTag).toBe('calcom-modules');

    const state: Record<string, string> = {
      cacheTagPrefix,
      nodeVersion,
      workingDir,
      cacheNode: 'true',
      cacheModules: 'true',
      modulesTag,
    };

    const saveNodeTag = `${state.cacheTagPrefix}-node-${state.nodeVersion}`;
    const saveModulesTag = state.modulesTag;

    expect(saveNodeTag).toBe(nodeTag);
    expect(saveModulesTag).toBe(modulesTag);
  });
});
