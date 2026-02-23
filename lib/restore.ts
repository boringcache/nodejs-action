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
  pathExists,
  detectBuildCaches,
  parseBuildCachePaths,
  mergeBuildCaches,
  getMiseDataDir,
  findAvailablePort,
  startCacheRegistryProxy,
  configureTurboRemoteEnv,
  filterTurboFromBuildCaches,
} from './utils';
import * as path from 'path';

async function run(): Promise<void> {
  try {
    const workspace = getWorkspace(core.getInput('workspace'));
    const cacheTagPrefix = getCacheTagPrefix(core.getInput('cache-tag'));
    const inputVersion = core.getInput('node-version');
    const workingDir = core.getInput('working-directory') || process.cwd();
    const cacheNode = core.getInput('cache-node') !== 'false';
    const cacheModules = core.getInput('cache-modules') !== 'false';
    const verbose = core.getInput('verbose') === 'true';
    const cliVersion = core.getInput('cli-version');

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

    const miseDataDir = getMiseDataDir();

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

    // Turbo remote cache
    const turboRemoteCache = core.getInput('turbo-remote-cache') === 'true';
    if (turboRemoteCache) {
      const turboApiUrl = core.getInput('turbo-api-url');
      const turboToken = core.getInput('turbo-token') || 'boringcache';
      const turboTeam = core.getInput('turbo-team');
      const turboPort = parseInt(core.getInput('turbo-port') || '4227', 10);

      if (turboApiUrl) {
        configureTurboRemoteEnv(turboApiUrl, turboToken, turboTeam);
      } else {
        let port = turboPort;
        try {
          const proxy = await startCacheRegistryProxy(workspace, port, cacheTagPrefix);
          core.saveState('turboProxyPid', proxy.pid.toString());
          core.saveState('turboProxyPort', proxy.port.toString());
          configureTurboRemoteEnv(`http://127.0.0.1:${proxy.port}`, turboToken, turboTeam);
        } catch (e) {
          core.info(`Port ${port} unavailable, trying random port...`);
          port = await findAvailablePort();
          const proxy = await startCacheRegistryProxy(workspace, port, cacheTagPrefix);
          core.saveState('turboProxyPid', proxy.pid.toString());
          core.saveState('turboProxyPort', proxy.port.toString());
          configureTurboRemoteEnv(`http://127.0.0.1:${proxy.port}`, turboToken, turboTeam);
        }
      }

      core.saveState('turboRemoteCache', 'true');
    }

    // Restore build system caches
    const cacheBuild = core.getInput('cache-build') !== 'false';
    if (cacheBuild) {
      let autoDetected = await detectBuildCaches(workingDir);
      if (turboRemoteCache) {
        autoDetected = filterTurboFromBuildCaches(autoDetected);
      }
      const userOverrides = parseBuildCachePaths(core.getInput('build-cache-paths'), workingDir);
      const buildCaches = mergeBuildCaches(autoDetected, userOverrides);

      if (buildCaches.length > 0) {
        core.info(`Detected build caches: ${buildCaches.map(e => e.name).join(', ')}`);
        const buildCacheTags: { name: string; tag: string; path: string }[] = [];

        for (const entry of buildCaches) {
          const tag = `${cacheTagPrefix}-${entry.name}`;
          buildCacheTags.push({ name: entry.name, tag, path: entry.path });

          core.info(`Restoring ${entry.name} build cache...`);
          const args = ['restore', workspace, `${tag}:${entry.path}`];
          if (verbose) args.push('--verbose');
          await execBoringCache(args);
        }

        core.saveState('buildCaches', JSON.stringify(buildCacheTags));
      }

      core.saveState('cacheBuild', cacheBuild.toString());
    }

    core.info('Node.js setup complete');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
