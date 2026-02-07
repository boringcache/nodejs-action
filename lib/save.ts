import * as core from '@actions/core';
import { execBoringCache } from './utils';
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
    const modulesTag = core.getState('modulesTag');
    const verbose = core.getState('verbose') === 'true';
    const exclude = core.getInput('exclude');

    if (!workspace) {
      core.info('No workspace state found, skipping save');
      return;
    }

    const homedir = os.homedir();
    const miseDataDir = `${homedir}/.local/share/mise`;

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

    core.info('Save complete');
  } catch (error) {
    if (error instanceof Error) {
      core.warning(`Save failed: ${error.message}`);
    }
  }
}

run();
