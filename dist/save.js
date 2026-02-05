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
const os = __importStar(require("os"));
async function run() {
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
            await (0, utils_1.execBoringCache)(args);
        }
        // Save node_modules cache if not restored from cache
        if (cacheModules && !modulesRestored && modulesTag) {
            const modulesDir = path.join(workingDir, 'node_modules');
            if (await (0, utils_1.pathExists)(modulesDir)) {
                core.info(`Saving ${packageManager} modules...`);
                const args = ['save', workspace, `${modulesTag}:${modulesDir}`];
                if (exclude) {
                    args.push('--exclude', exclude);
                }
                await (0, utils_1.execBoringCache)(args);
            }
        }
        core.info('Save complete');
    }
    catch (error) {
        if (error instanceof Error) {
            core.warning(`Save failed: ${error.message}`);
        }
    }
}
run();
