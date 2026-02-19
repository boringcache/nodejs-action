import * as core from '@actions/core';
import { execBoringCache, getMiseDataDir, stopCacheRegistryProxy } from './utils';
import * as path from 'path';

async function run(): Promise<void> {
  try {
    const workspace = core.getState('workspace');
    const cacheTagPrefix = core.getState('cacheTagPrefix');
    const nodeVersion = core.getState('nodeVersion');
    const workingDir = core.getState('workingDir') || process.cwd();
    const cacheNode = core.getState('cacheNode') === 'true';
    const cacheModules = core.getState('cacheModules') === 'true';
    const modulesTag = core.getState('modulesTag');
    const verbose = core.getState('verbose') === 'true';
    const exclude = core.getInput('exclude');

    if (!workspace) {
      core.info('No workspace state found, skipping save');
      return;
    }

    const miseDataDir = getMiseDataDir();

    core.info('Saving to BoringCache...');

    if (cacheNode && nodeVersion && cacheTagPrefix) {
      const nodeTag = `${cacheTagPrefix}-node-${nodeVersion}`;
      core.info(`Saving Node.js [${nodeTag}]...`);

      const args = ['save', workspace, `${nodeTag}:${miseDataDir}`];
      if (verbose) args.push('--verbose');
      if (exclude) args.push('--exclude', exclude);

      await execBoringCache(args);
    }

    if (cacheModules && modulesTag) {
      const modulesDir = path.join(workingDir, 'node_modules');
      core.info(`Saving modules [${modulesTag}]...`);

      const args = ['save', workspace, `${modulesTag}:${modulesDir}`];
      if (verbose) args.push('--verbose');
      if (exclude) args.push('--exclude', exclude);

      await execBoringCache(args);
    }

    // Save build system caches
    const cacheBuild = core.getState('cacheBuild') === 'true';
    if (cacheBuild) {
      const buildCachesJson = core.getState('buildCaches');
      if (buildCachesJson) {
        const buildCaches: { name: string; tag: string; path: string }[] = JSON.parse(buildCachesJson);
        for (const entry of buildCaches) {
          core.info(`Saving ${entry.name} build cache [${entry.tag}]...`);
          const args = ['save', workspace, `${entry.tag}:${entry.path}`];
          if (verbose) args.push('--verbose');
          if (exclude) args.push('--exclude', exclude);
          await execBoringCache(args);
        }
      }
    }

    const turboProxyPid = core.getState('turboProxyPid');
    if (turboProxyPid) {
      await stopCacheRegistryProxy(parseInt(turboProxyPid, 10));
    }

    core.info('Save complete');
  } catch (error) {
    if (error instanceof Error) {
      core.warning(`Save failed: ${error.message}`);
    }
  }
}

run();
