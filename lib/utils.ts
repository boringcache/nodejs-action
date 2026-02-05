import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureBoringCache, execBoringCache } from '@boringcache/action-core';

export { ensureBoringCache, execBoringCache };

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
  await exec.exec('sh', ['-c', 'curl https://mise.run | sh']);

  const homedir = os.homedir();
  core.addPath(`${homedir}/.local/bin`);
  core.addPath(`${homedir}/.local/share/mise/shims`);
}

export async function installNode(version: string): Promise<void> {
  core.info(`Installing Node.js ${version} via mise...`);
  const homedir = os.homedir();
  const misePath = `${homedir}/.local/bin/mise`;

  await exec.exec(misePath, ['install', `node@${version}`]);
  await exec.exec(misePath, ['use', '-g', `node@${version}`]);
}

export async function activateNode(version: string): Promise<void> {
  core.info(`Activating Node.js ${version}...`);
  const homedir = os.homedir();
  const misePath = `${homedir}/.local/bin/mise`;

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
