"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const utils_1 = require("./utils");
const path = __importStar(require("path"));
async function run() {
    try {
        const workspace = (0, utils_1.getWorkspace)(core.getInput('workspace'));
        const cacheTagPrefix = (0, utils_1.getCacheTagPrefix)(core.getInput('cache-tag'));
        const inputVersion = core.getInput('node-version');
        const workingDir = core.getInput('working-directory') || process.cwd();
        const cacheNode = core.getInput('cache-node') !== 'false';
        const cacheModules = core.getInput('cache-modules') !== 'false';
        const verbose = core.getInput('verbose') === 'true';
        const cliVersion = core.getInput('cli-version') || 'v1.1.1';
        const nodeVersion = await (0, utils_1.getNodeVersion)(inputVersion, workingDir);
        const packageManager = await (0, utils_1.detectPackageManager)(workingDir);
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
            await (0, utils_1.ensureBoringCache)({ version: cliVersion });
        }
        const miseDataDir = (0, utils_1.getMiseDataDir)();
        // Restore Node.js cache
        // BoringCache is content-addressed, so simple tags work - no hash needed
        if (cacheNode) {
            const nodeTag = `${cacheTagPrefix}-node-${nodeVersion}`;
            core.info(`Restoring Node.js ${nodeVersion}...`);
            const nodeArgs = ['restore', workspace, `${nodeTag}:${miseDataDir}`];
            if (verbose)
                nodeArgs.push('--verbose');
            const nodeResult = await (0, utils_1.execBoringCache)(nodeArgs);
            if (nodeResult === 0) {
                core.info('Node.js cache restored');
                core.saveState('nodeRestored', 'true');
                // Mise binary is not cached, only the data dir - need to install mise first
                await (0, utils_1.installMise)();
                await (0, utils_1.activateNode)(nodeVersion);
            }
            else {
                core.info('Node.js cache not found, will install');
                await (0, utils_1.installMise)();
                await (0, utils_1.installNode)(nodeVersion);
            }
        }
        else {
            await (0, utils_1.installMise)();
            await (0, utils_1.installNode)(nodeVersion);
        }
        // Restore node_modules cache
        if (cacheModules) {
            const modulesDir = path.join(workingDir, 'node_modules');
            core.info(`Restoring ${packageManager} modules...`);
            const modulesArgs = ['restore', workspace, `${modulesTag}:${modulesDir}`];
            if (verbose)
                modulesArgs.push('--verbose');
            const modulesResult = await (0, utils_1.execBoringCache)(modulesArgs);
            if (modulesResult === 0) {
                core.info('Modules cache restored');
                core.saveState('modulesRestored', 'true');
            }
            else {
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
                (0, utils_1.configureTurboRemoteEnv)(turboApiUrl, turboToken, turboTeam);
            }
            else {
                let port = turboPort;
                try {
                    const proxy = await (0, utils_1.startCacheRegistryProxy)(workspace, port, cacheTagPrefix);
                    core.saveState('turboProxyPid', proxy.pid.toString());
                    core.saveState('turboProxyPort', proxy.port.toString());
                    (0, utils_1.configureTurboRemoteEnv)(`http://127.0.0.1:${proxy.port}`, turboToken, turboTeam);
                }
                catch (e) {
                    core.info(`Port ${port} unavailable, trying random port...`);
                    port = await (0, utils_1.findAvailablePort)();
                    const proxy = await (0, utils_1.startCacheRegistryProxy)(workspace, port, cacheTagPrefix);
                    core.saveState('turboProxyPid', proxy.pid.toString());
                    core.saveState('turboProxyPort', proxy.port.toString());
                    (0, utils_1.configureTurboRemoteEnv)(`http://127.0.0.1:${proxy.port}`, turboToken, turboTeam);
                }
            }
            core.saveState('turboRemoteCache', 'true');
        }
        // Restore build system caches
        const cacheBuild = core.getInput('cache-build') !== 'false';
        if (cacheBuild) {
            let autoDetected = await (0, utils_1.detectBuildCaches)(workingDir);
            if (turboRemoteCache) {
                autoDetected = (0, utils_1.filterTurboFromBuildCaches)(autoDetected);
            }
            const userOverrides = (0, utils_1.parseBuildCachePaths)(core.getInput('build-cache-paths'), workingDir);
            const buildCaches = (0, utils_1.mergeBuildCaches)(autoDetected, userOverrides);
            if (buildCaches.length > 0) {
                core.info(`Detected build caches: ${buildCaches.map(e => e.name).join(', ')}`);
                const buildCacheTags = [];
                for (const entry of buildCaches) {
                    const tag = `${cacheTagPrefix}-${entry.name}`;
                    buildCacheTags.push({ name: entry.name, tag, path: entry.path });
                    core.info(`Restoring ${entry.name} build cache...`);
                    const args = ['restore', workspace, `${tag}:${entry.path}`];
                    if (verbose)
                        args.push('--verbose');
                    await (0, utils_1.execBoringCache)(args);
                }
                core.saveState('buildCaches', JSON.stringify(buildCacheTags));
            }
            core.saveState('cacheBuild', cacheBuild.toString());
        }
        core.info('Node.js setup complete');
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
    }
}
run();
