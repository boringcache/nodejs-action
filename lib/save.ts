import * as core from '@actions/core';
import { execBoringCache, pathExists } from './utils';
import * as path from 'path';
import * as os from 'os';

async function run(): Promise<void> {
  try {
    const workspace = core.getState('workspace');
    const cacheTagPrefix = core.getState('cacheTagPrefix');
    const nodeVersion = core.getState('nodeVersion');
    const workingDir = core.getState('workingDir') || process.cwd();
    const cacheNode = core.getState('cacheNode') === 'true';
    const cacheModules = core.getState('cacheModules') === 'true';
    const packageManager = core.getState('packageManager') || 'npm';
    const nodeRestored = core.getState('nodeRestored') === 'true';
    const modulesRestored = core.getState('modulesRestored') === 'true';
    const modulesTag = core.getState('modulesTag');
    const exclude = core.getInput('exclude');

    if (!workspace) {
      core.info('No workspace state found, skipping save');
      return;
    }

    const homedir = os.homedir();
    const miseDataDir = `${homedir}/.local/share/mise`;

    // Save Node.js cache if not restored from cache
    if (cacheNode && !nodeRestored && nodeVersion && cacheTagPrefix) {
      const nodeTag = `${cacheTagPrefix}-node-${nodeVersion}`;
      core.info(`Saving Node.js ${nodeVersion}...`);

      const args = ['save', workspace, `${nodeTag}:${miseDataDir}`];
      if (exclude) {
        args.push('--exclude', exclude);
      }

      await execBoringCache(args);
    }

    // Save node_modules cache if not restored from cache
    if (cacheModules && !modulesRestored && modulesTag) {
      const modulesDir = path.join(workingDir, 'node_modules');

      if (await pathExists(modulesDir)) {
        core.info(`Saving ${packageManager} modules...`);

        const args = ['save', workspace, `${modulesTag}:${modulesDir}`];
        if (exclude) {
          args.push('--exclude', exclude);
        }

        await execBoringCache(args);
      }
    }

    core.info('Save complete');
  } catch (error) {
    if (error instanceof Error) {
      core.warning(`Save failed: ${error.message}`);
    }
  }
}

run();
