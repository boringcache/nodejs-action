import * as core from '@actions/core';
import {
  configureTurboRemoteEnv,
  filterTurboFromBuildCaches,
  BuildCacheEntry,
} from '../lib/utils';

describe('Turbo Remote Cache', () => {
  describe('configureTurboRemoteEnv', () => {
    it('should set TURBO_API, TURBO_TOKEN, and default TURBO_TEAM', () => {
      configureTurboRemoteEnv('http://127.0.0.1:4227', 'my-token');

      expect(process.env.TURBO_API).toBe('http://127.0.0.1:4227');
      expect(process.env.TURBO_TOKEN).toBe('my-token');
      expect(process.env.TURBO_TEAM).toBe('team_boringcache');
      expect(core.exportVariable).toHaveBeenCalledWith('TURBO_API', 'http://127.0.0.1:4227');
      expect(core.exportVariable).toHaveBeenCalledWith('TURBO_TOKEN', 'my-token');
      expect(core.exportVariable).toHaveBeenCalledWith('TURBO_TEAM', 'team_boringcache');
    });

    it('should set TURBO_TEAM when provided', () => {
      configureTurboRemoteEnv('http://127.0.0.1:4227', 'my-token', 'my-team');

      expect(process.env.TURBO_TEAM).toBe('my-team');
      expect(core.exportVariable).toHaveBeenCalledWith('TURBO_TEAM', 'my-team');
    });

    it('should use default TURBO_TEAM when empty string', () => {
      configureTurboRemoteEnv('http://127.0.0.1:4227', 'my-token', '');

      expect(process.env.TURBO_TEAM).toBe('team_boringcache');
      expect(core.exportVariable).toHaveBeenCalledWith('TURBO_TEAM', 'team_boringcache');
    });
  });

  describe('filterTurboFromBuildCaches', () => {
    it('should remove turbo entry from build caches', () => {
      const entries: BuildCacheEntry[] = [
        { name: 'turbo', path: '/path/.turbo/cache' },
        { name: 'nx', path: '/path/.nx/cache' },
        { name: 'nextjs', path: '/path/.next/cache' },
      ];

      const result = filterTurboFromBuildCaches(entries);

      expect(result).toEqual([
        { name: 'nx', path: '/path/.nx/cache' },
        { name: 'nextjs', path: '/path/.next/cache' },
      ]);
    });

    it('should return all entries when no turbo present', () => {
      const entries: BuildCacheEntry[] = [
        { name: 'nx', path: '/path/.nx/cache' },
      ];

      const result = filterTurboFromBuildCaches(entries);
      expect(result).toEqual(entries);
    });

    it('should return empty array when only turbo present', () => {
      const entries: BuildCacheEntry[] = [
        { name: 'turbo', path: '/path/.turbo/cache' },
      ];

      const result = filterTurboFromBuildCaches(entries);
      expect(result).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      expect(filterTurboFromBuildCaches([])).toEqual([]);
    });
  });
});
