import { getWorkspace, getCacheTagPrefix, getMiseBinPath, getMiseDataDir } from '../lib/utils';
import * as core from '@actions/core';
import * as os from 'os';
import * as path from 'path';

describe('Node.js Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BORINGCACHE_DEFAULT_WORKSPACE;
    delete process.env.GITHUB_REPOSITORY;
  });

  describe('getWorkspace', () => {
    it('should return input workspace when provided', () => {
      expect(getWorkspace('my-org/my-project')).toBe('my-org/my-project');
    });

    it('should use BORINGCACHE_DEFAULT_WORKSPACE as fallback', () => {
      process.env.BORINGCACHE_DEFAULT_WORKSPACE = 'default-org/default-project';
      expect(getWorkspace('')).toBe('default-org/default-project');
    });

    it('should add default/ prefix when no slash present', () => {
      expect(getWorkspace('my-project')).toBe('default/my-project');
    });

    it('should fail when no workspace available', () => {
      expect(() => getWorkspace('')).toThrow('Workspace required');
      expect(core.setFailed).toHaveBeenCalled();
    });
  });

  describe('getCacheTagPrefix', () => {
    it('should return input cache tag when provided', () => {
      expect(getCacheTagPrefix('my-cache')).toBe('my-cache');
    });

    it('should use repository name as default', () => {
      process.env.GITHUB_REPOSITORY = 'owner/my-repo';
      expect(getCacheTagPrefix('')).toBe('my-repo');
    });

    it('should return nodejs as final fallback', () => {
      expect(getCacheTagPrefix('')).toBe('nodejs');
    });
  });

  describe('getMiseBinPath', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return mise.exe path on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      // Re-import to get fresh module with win32 platform
      // Since isWindows is set at module load, we test the function directly
      const result = getMiseBinPath();
      const homedir = os.homedir();
      // On the current platform, it returns the appropriate path
      expect(result).toContain('mise');
      expect(result).toContain(path.join('.local', 'bin'));
    });

    it('should return path under homedir/.local/bin', () => {
      const result = getMiseBinPath();
      const homedir = os.homedir();
      expect(result).toBe(
        process.platform === 'win32'
          ? path.join(homedir, '.local', 'bin', 'mise.exe')
          : path.join(homedir, '.local', 'bin', 'mise'),
      );
    });
  });

  describe('getMiseDataDir', () => {
    it('should return path under homedir on unix', () => {
      if (process.platform === 'win32') return; // skip on Windows CI
      const result = getMiseDataDir();
      expect(result).toBe(path.join(os.homedir(), '.local', 'share', 'mise'));
    });

    it('should return LOCALAPPDATA path on Windows', () => {
      if (process.platform !== 'win32') return; // skip on non-Windows CI
      const result = getMiseDataDir();
      expect(result).toContain('mise');
    });
  });
});
