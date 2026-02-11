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
exports.execBoringCache = exports.ensureBoringCache = void 0;
exports.getMiseBinPath = getMiseBinPath;
exports.getMiseDataDir = getMiseDataDir;
exports.getWorkspace = getWorkspace;
exports.getCacheTagPrefix = getCacheTagPrefix;
exports.getNodeVersion = getNodeVersion;
exports.getFileHash = getFileHash;
exports.detectPackageManager = detectPackageManager;
exports.installMise = installMise;
exports.installNode = installNode;
exports.activateNode = activateNode;
exports.pathExists = pathExists;
exports.detectBuildCaches = detectBuildCaches;
exports.parseBuildCachePaths = parseBuildCachePaths;
exports.mergeBuildCaches = mergeBuildCaches;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const action_core_1 = require("@boringcache/action-core");
Object.defineProperty(exports, "ensureBoringCache", { enumerable: true, get: function () { return action_core_1.ensureBoringCache; } });
Object.defineProperty(exports, "execBoringCache", { enumerable: true, get: function () { return action_core_1.execBoringCache; } });
const isWindows = process.platform === 'win32';
function getMiseBinPath() {
    const homedir = os.homedir();
    return isWindows
        ? path.join(homedir, '.local', 'bin', 'mise.exe')
        : path.join(homedir, '.local', 'bin', 'mise');
}
function getMiseDataDir() {
    if (isWindows) {
        return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'mise');
    }
    return path.join(os.homedir(), '.local', 'share', 'mise');
}
function getWorkspace(inputWorkspace) {
    let workspace = inputWorkspace || process.env.BORINGCACHE_DEFAULT_WORKSPACE || '';
    if (!workspace) {
        core.setFailed('Workspace is required. Set workspace input or BORINGCACHE_DEFAULT_WORKSPACE env var.');
        throw new Error('Workspace required');
    }
    if (!workspace.includes('/')) {
        workspace = `default/${workspace}`;
    }
    return workspace;
}
function getCacheTagPrefix(inputCacheTag) {
    if (inputCacheTag) {
        return inputCacheTag;
    }
    const repo = process.env.GITHUB_REPOSITORY || '';
    if (repo) {
        const repoName = repo.split('/')[1] || repo;
        return repoName;
    }
    return 'nodejs';
}
async function getNodeVersion(inputVersion, workingDir) {
    if (inputVersion) {
        return inputVersion;
    }
    const nodeVersionFile = path.join(workingDir, '.node-version');
    try {
        const content = await fs.promises.readFile(nodeVersionFile, 'utf-8');
        return content.trim();
    }
    catch {
    }
    const nvmrcFile = path.join(workingDir, '.nvmrc');
    try {
        const content = await fs.promises.readFile(nvmrcFile, 'utf-8');
        return content.trim().replace(/^v/, '');
    }
    catch {
    }
    const toolVersionsFile = path.join(workingDir, '.tool-versions');
    try {
        const content = await fs.promises.readFile(toolVersionsFile, 'utf-8');
        const nodeLine = content.split('\n').find(line => line.startsWith('nodejs ') || line.startsWith('node '));
        if (nodeLine) {
            return nodeLine.split(/\s+/)[1].trim();
        }
    }
    catch {
    }
    return '22';
}
async function getFileHash(filePath) {
    try {
        const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
        const content = await fs.promises.readFile(filePath);
        return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    }
    catch {
        return '';
    }
}
async function detectPackageManager(workingDir) {
    if (await pathExists(path.join(workingDir, 'pnpm-lock.yaml'))) {
        return 'pnpm';
    }
    if (await pathExists(path.join(workingDir, 'yarn.lock'))) {
        return 'yarn';
    }
    return 'npm';
}
async function installMise() {
    core.info('Installing mise...');
    if (isWindows) {
        await installMiseWindows();
    }
    else {
        await exec.exec('sh', ['-c', 'curl https://mise.run | sh']);
    }
    core.addPath(path.dirname(getMiseBinPath()));
    core.addPath(path.join(getMiseDataDir(), 'shims'));
}
async function installMiseWindows() {
    const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
    const miseVersion = process.env.MISE_VERSION || 'v2026.2.8';
    const url = `https://github.com/jdx/mise/releases/download/${miseVersion}/mise-${miseVersion}-windows-${arch}.zip`;
    const binDir = path.dirname(getMiseBinPath());
    await fs.promises.mkdir(binDir, { recursive: true });
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mise-'));
    try {
        const zipPath = path.join(tempDir, 'mise.zip');
        await exec.exec('curl', ['-fsSL', '-o', zipPath, url]);
        await exec.exec('tar', ['-xf', zipPath, '-C', tempDir]);
        await fs.promises.copyFile(path.join(tempDir, 'mise', 'bin', 'mise.exe'), getMiseBinPath());
    }
    finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
}
async function installNode(version) {
    core.info(`Installing Node.js ${version} via mise...`);
    const misePath = getMiseBinPath();
    await exec.exec(misePath, ['install', `node@${version}`]);
    await exec.exec(misePath, ['use', '-g', `node@${version}`]);
}
async function activateNode(version) {
    core.info(`Activating Node.js ${version}...`);
    const misePath = getMiseBinPath();
    await exec.exec(misePath, ['use', '-g', `node@${version}`]);
}
async function pathExists(p) {
    try {
        await fs.promises.access(p);
        return true;
    }
    catch {
        return false;
    }
}
async function detectBuildCaches(workingDir) {
    var _a, _b, _c;
    const entries = [];
    // Turbo
    const turboJsonPath = path.join(workingDir, 'turbo.json');
    if (await pathExists(turboJsonPath)) {
        let cacheDir = '.turbo/cache';
        try {
            const content = await fs.promises.readFile(turboJsonPath, 'utf-8');
            const config = JSON.parse(content);
            if (config.cacheDir && typeof config.cacheDir === 'string') {
                cacheDir = config.cacheDir;
            }
        }
        catch {
            core.warning('Failed to parse turbo.json, using default cache path');
        }
        entries.push({
            name: 'turbo',
            path: path.isAbsolute(cacheDir) ? cacheDir : path.resolve(workingDir, cacheDir),
        });
    }
    // Nx
    const nxJsonPath = path.join(workingDir, 'nx.json');
    if (await pathExists(nxJsonPath)) {
        let cacheDir = '.nx/cache';
        try {
            const content = await fs.promises.readFile(nxJsonPath, 'utf-8');
            const config = JSON.parse(content);
            if (config.cacheDirectory && typeof config.cacheDirectory === 'string') {
                cacheDir = config.cacheDirectory;
            }
            else if (((_c = (_b = (_a = config.tasksRunnerOptions) === null || _a === void 0 ? void 0 : _a.default) === null || _b === void 0 ? void 0 : _b.options) === null || _c === void 0 ? void 0 : _c.cacheDirectory) &&
                typeof config.tasksRunnerOptions.default.options.cacheDirectory === 'string') {
                cacheDir = config.tasksRunnerOptions.default.options.cacheDirectory;
            }
        }
        catch {
            core.warning('Failed to parse nx.json, using default cache path');
        }
        entries.push({
            name: 'nx',
            path: path.isAbsolute(cacheDir) ? cacheDir : path.resolve(workingDir, cacheDir),
        });
    }
    // Yarn Berry
    const yarnrcPath = path.join(workingDir, '.yarnrc.yml');
    const yarnLockPath = path.join(workingDir, 'yarn.lock');
    if (await pathExists(yarnrcPath) && await pathExists(yarnLockPath)) {
        let cacheFolder = '.yarn/cache';
        let enableGlobalCache = true;
        try {
            const content = await fs.promises.readFile(yarnrcPath, 'utf-8');
            for (const line of content.split('\n')) {
                const cacheFolderMatch = line.match(/^cacheFolder:\s*['"]?(.+?)['"]?\s*$/);
                if (cacheFolderMatch) {
                    cacheFolder = cacheFolderMatch[1];
                }
                const globalCacheMatch = line.match(/^enableGlobalCache:\s*(true|false)\s*$/);
                if (globalCacheMatch) {
                    enableGlobalCache = globalCacheMatch[1] === 'true';
                }
            }
        }
        catch {
            core.warning('Failed to parse .yarnrc.yml, skipping yarn cache detection');
        }
        if (!enableGlobalCache) {
            entries.push({
                name: 'yarn-cache',
                path: path.isAbsolute(cacheFolder) ? cacheFolder : path.resolve(workingDir, cacheFolder),
            });
        }
    }
    // Next.js
    const nextConfigs = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
    for (const configFile of nextConfigs) {
        if (await pathExists(path.join(workingDir, configFile))) {
            entries.push({
                name: 'nextjs',
                path: path.resolve(workingDir, '.next/cache'),
            });
            break;
        }
    }
    return entries;
}
function parseBuildCachePaths(input, workingDir) {
    if (!input.trim())
        return [];
    const entries = [];
    const lines = input.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1)
            continue;
        const name = trimmed.slice(0, colonIdx).trim();
        const rawPath = trimmed.slice(colonIdx + 1).trim();
        if (!name || !rawPath)
            continue;
        entries.push({
            name,
            path: path.isAbsolute(rawPath) ? rawPath : path.resolve(workingDir, rawPath),
        });
    }
    return entries;
}
function mergeBuildCaches(autoDetected, userOverrides) {
    const map = new Map();
    for (const entry of autoDetected) {
        map.set(entry.name, entry);
    }
    for (const entry of userOverrides) {
        map.set(entry.name, entry);
    }
    return Array.from(map.values());
}
