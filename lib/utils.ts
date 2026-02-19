import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import * as http from 'http';
import { spawn } from 'child_process';
import { ensureBoringCache, execBoringCache } from '@boringcache/action-core';

export { ensureBoringCache, execBoringCache };

const isWindows = process.platform === 'win32';

export function getMiseBinPath(): string {
  const homedir = os.homedir();
  return isWindows
    ? path.join(homedir, '.local', 'bin', 'mise.exe')
    : path.join(homedir, '.local', 'bin', 'mise');
}

export function getMiseDataDir(): string {
  if (isWindows) {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'mise');
  }
  return path.join(os.homedir(), '.local', 'share', 'mise');
}

export function getWorkspace(inputWorkspace: string): string {
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

export function getCacheTagPrefix(inputCacheTag: string): string {
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

export async function getNodeVersion(inputVersion: string, workingDir: string): Promise<string> {
  if (inputVersion) {
    return inputVersion;
  }

  const nodeVersionFile = path.join(workingDir, '.node-version');
  try {
    const content = await fs.promises.readFile(nodeVersionFile, 'utf-8');
    return content.trim();
  } catch {
  }

  const nvmrcFile = path.join(workingDir, '.nvmrc');
  try {
    const content = await fs.promises.readFile(nvmrcFile, 'utf-8');
    return content.trim().replace(/^v/, '');
  } catch {
  }

  const toolVersionsFile = path.join(workingDir, '.tool-versions');
  try {
    const content = await fs.promises.readFile(toolVersionsFile, 'utf-8');
    const nodeLine = content.split('\n').find(line => line.startsWith('nodejs ') || line.startsWith('node '));
    if (nodeLine) {
      return nodeLine.split(/\s+/)[1].trim();
    }
  } catch {
  }

  return '22';
}

export async function getFileHash(filePath: string): Promise<string> {
  try {
    const crypto = await import('crypto');
    const content = await fs.promises.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

export async function detectPackageManager(workingDir: string): Promise<'npm' | 'yarn' | 'pnpm'> {
  if (await pathExists(path.join(workingDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (await pathExists(path.join(workingDir, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

export async function installMise(): Promise<void> {
  core.info('Installing mise...');
  if (isWindows) {
    await installMiseWindows();
  } else {
    await exec.exec('sh', ['-c', 'curl https://mise.run | sh']);
  }

  core.addPath(path.dirname(getMiseBinPath()));
  core.addPath(path.join(getMiseDataDir(), 'shims'));
}

async function installMiseWindows(): Promise<void> {
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
    await fs.promises.copyFile(
      path.join(tempDir, 'mise', 'bin', 'mise.exe'),
      getMiseBinPath(),
    );
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function installNode(version: string): Promise<void> {
  core.info(`Installing Node.js ${version} via mise...`);
  const misePath = getMiseBinPath();

  await exec.exec(misePath, ['install', `node@${version}`]);
  await exec.exec(misePath, ['use', '-g', `node@${version}`]);
}

export async function activateNode(version: string): Promise<void> {
  core.info(`Activating Node.js ${version}...`);
  const misePath = getMiseBinPath();

  await exec.exec(misePath, ['use', '-g', `node@${version}`]);
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

export function getPnpmStoreDir(): string {
  if (process.env.PNPM_HOME) {
    return path.join(process.env.PNPM_HOME, 'store');
  }
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, 'pnpm', 'store');
  }
  if (isWindows) {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'pnpm',
      'store',
    );
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'pnpm', 'store');
  }
  return path.join(os.homedir(), '.local', 'share', 'pnpm', 'store');
}

export interface BuildCacheEntry {
  name: string;
  path: string;
}

export async function detectBuildCaches(workingDir: string): Promise<BuildCacheEntry[]> {
  const entries: BuildCacheEntry[] = [];

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
    } catch {
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
      } else if (
        config.tasksRunnerOptions?.default?.options?.cacheDirectory &&
        typeof config.tasksRunnerOptions.default.options.cacheDirectory === 'string'
      ) {
        cacheDir = config.tasksRunnerOptions.default.options.cacheDirectory;
      }
    } catch {
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
    } catch {
      core.warning('Failed to parse .yarnrc.yml, skipping yarn cache detection');
    }

    if (!enableGlobalCache) {
      entries.push({
        name: 'yarn-cache',
        path: path.isAbsolute(cacheFolder) ? cacheFolder : path.resolve(workingDir, cacheFolder),
      });
    }
  }

  // pnpm
  const pnpmLockPath = path.join(workingDir, 'pnpm-lock.yaml');
  if (await pathExists(pnpmLockPath)) {
    let storeDir = getPnpmStoreDir();
    const npmrcPath = path.join(workingDir, '.npmrc');
    if (await pathExists(npmrcPath)) {
      try {
        const content = await fs.promises.readFile(npmrcPath, 'utf-8');
        for (const line of content.split('\n')) {
          const match = line.match(/^store-dir\s*=\s*(.+)$/);
          if (match) {
            storeDir = match[1].trim();
          }
        }
      } catch {
      }
    }
    entries.push({
      name: 'pnpm-store',
      path: path.isAbsolute(storeDir) ? storeDir : path.resolve(workingDir, storeDir),
    });
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

export function parseBuildCachePaths(input: string, workingDir: string): BuildCacheEntry[] {
  if (!input.trim()) return [];

  const entries: BuildCacheEntry[] = [];
  const lines = input.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const name = trimmed.slice(0, colonIdx).trim();
    const rawPath = trimmed.slice(colonIdx + 1).trim();
    if (!name || !rawPath) continue;

    entries.push({
      name,
      path: path.isAbsolute(rawPath) ? rawPath : path.resolve(workingDir, rawPath),
    });
  }

  return entries;
}

export function mergeBuildCaches(
  autoDetected: BuildCacheEntry[],
  userOverrides: BuildCacheEntry[],
): BuildCacheEntry[] {
  const map = new Map<string, BuildCacheEntry>();

  for (const entry of autoDetected) {
    map.set(entry.name, entry);
  }
  for (const entry of userOverrides) {
    map.set(entry.name, entry);
  }

  return Array.from(map.values());
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
        resolve(res.statusCode);
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

export async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.on('error', reject);
  });
}

export async function startCacheRegistryProxy(workspace: string, port: number, tag?: string): Promise<{ pid: number; port: number }> {
  const logFile = path.join(os.tmpdir(), `boringcache-proxy-${port}.log`);
  const fd = fs.openSync(logFile, 'w');

  const args = [
    'cache-registry', workspace,
  ];
  if (tag) {
    args.push(tag);
  }
  args.push('--host', '127.0.0.1', '--port', port.toString(), '--no-platform', '--no-git');

  const child = spawn('boringcache', args, {
    detached: true,
    stdio: ['ignore', fd, fd]
  });

  child.unref();
  fs.closeSync(fd);

  if (!child.pid) {
    throw new Error('Failed to start cache-registry proxy');
  }

  core.info(`Cache-registry proxy starting (pid=${child.pid}, port=${port})...`);

  const maxWait = 30_000;
  const interval = 500;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      await httpGet(`http://127.0.0.1:${port}/v2/`);
      core.info(`Cache-registry proxy ready on port ${port}`);
      return { pid: child.pid, port };
    } catch {
      await sleep(interval);
    }
  }

  try {
    const logs = fs.readFileSync(logFile, 'utf-8');
    core.error(`Cache-registry proxy logs:\n${logs}`);
  } catch {}

  throw new Error(`Cache-registry proxy failed to become ready within ${maxWait / 1000}s`);
}

export async function stopCacheRegistryProxy(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
    core.info(`Stopped cache-registry proxy (pid=${pid})`);
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      core.info(`Cache-registry proxy (pid=${pid}) already exited`);
    } else {
      core.warning(`Failed to stop cache-registry proxy: ${err.message}`);
    }
  }
}

export function configureTurboRemoteEnv(apiUrl: string, token: string, team?: string): void {
  process.env.TURBO_API = apiUrl;
  core.exportVariable('TURBO_API', apiUrl);

  process.env.TURBO_TOKEN = token;
  core.exportVariable('TURBO_TOKEN', token);

  const resolvedTeam = team || 'team_boringcache';
  process.env.TURBO_TEAM = resolvedTeam;
  core.exportVariable('TURBO_TEAM', resolvedTeam);

  core.info(`Turbo remote cache configured: api=${apiUrl} team=${resolvedTeam}`);
}

export function filterTurboFromBuildCaches(entries: BuildCacheEntry[]): BuildCacheEntry[] {
  return entries.filter(e => e.name !== 'turbo');
}
