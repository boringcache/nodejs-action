import * as core from '@actions/core';
import {
  ensureBoringCache,
  execBoringCache,
  getWorkspace,
  getCacheTagPrefix,
  getNodeVersion,
  detectPackageManager,
  installMise,
  installNode,
  activateNode,
  pathExists
} from './utils';
import * as path from 'path';
import * as os from 'os';

async function run(): Promise<void> {
  try {
    const workspace = getWorkspace(core.getInput('workspace'));
    const cacheTagPrefix = getCacheTagPrefix(core.getInput('cache-tag'));
    const inputVersion = core.getInput('node-version');
    const workingDir = core.getInput('working-directory') || process.cwd();
    const cacheNode = core.getInput('cache-node') !== 'false';
    const cacheModules = core.getInput('cache-modules') !== 'false';
    const verbose = core.getInput('verbose') === 'true';
    const cliVersion = core.getInput('cli-version') || 'v1.0.0';

    const nodeVersion = await getNodeVersion(inputVersion, workingDir);
    const packageManager = await detectPackageManager(workingDir);
    core.info(`Detected package manager: ${packageManager}`);

    // BoringCache is content-addressed, so simple tags work - no hash needed
    const modulesTag = `${cacheTagPrefix}-modules`;

    // Save state for post-job save
    core.saveState('workspace', workspace);
    core.saveState('cacheTagPrefix', cacheTagPrefix);
    core.saveState('nodeVersion', nodeVersion);
    core.saveState('workingDir', workingDir);
    core.saveState('cacheNode', cacheNode.toString());
    core.saveState('cacheModules', cacheModules.toString());
    core.saveState('packageManager', packageManager);
    core.saveState('modulesTag', modulesTag);
    core.saveState('verbose', verbose.toString());

    if (cliVersion.toLowerCase() !== 'skip') {
      await ensureBoringCache({ version: cliVersion });
    }

    const homedir = os.homedir();
    const miseDataDir = `${homedir}/.local/share/mise`;

    // Restore Node.js cache
    // BoringCache is content-addressed, so simple tags work - no hash needed
    if (cacheNode) {
      const nodeTag = `${cacheTagPrefix}-node-${nodeVersion}`;
      core.info(`Restoring Node.js ${nodeVersion}...`);
      const nodeArgs = ['restore', workspace, `${nodeTag}:${miseDataDir}`];
      if (verbose) nodeArgs.push('--verbose');
      const nodeResult = await execBoringCache(nodeArgs);

      if (nodeResult === 0) {
        core.info('Node.js cache restored');
        core.saveState('nodeRestored', 'true');
        // Mise binary is not cached, only the data dir - need to install mise first
        await installMise();
        await activateNode(nodeVersion);
      } else {
        core.info('Node.js cache not found, will install');
        await installMise();
        await installNode(nodeVersion);
      }
    } else {
      await installMise();
      await installNode(nodeVersion);
    }

    // Restore node_modules cache
    if (cacheModules) {
      const modulesDir = path.join(workingDir, 'node_modules');

      core.info(`Restoring ${packageManager} modules...`);
      const modulesArgs = ['restore', workspace, `${modulesTag}:${modulesDir}`];
      if (verbose) modulesArgs.push('--verbose');
      const modulesResult = await execBoringCache(modulesArgs);

      if (modulesResult === 0) {
        core.info('Modules cache restored');
        core.saveState('modulesRestored', 'true');
      } else {
        core.info('Modules cache not found');
      }
    }

    core.info('Node.js setup complete');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
