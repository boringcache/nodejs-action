# BoringCache Node.js

## What It Does

Sets up Node.js via mise and caches:
- Node.js installation
- Package manager dependencies (`node_modules`)

## Quick Reference

```yaml
- uses: boringcache/nodejs@v1
  with:
    workspace: my-org/my-project
    node-version: '20'
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}
```

## How It Works

1. **Restore phase**:
   - Restores cached Node.js installation and node_modules
   - Installs mise (if needed)
   - Installs Node.js via mise
   - Detects and uses appropriate package manager (npm/yarn/pnpm)

2. **Save phase**:
   - Saves Node.js installation and node_modules

## Cache Tags

Uses `cache-tag` prefix (defaults to repository name) with suffixes:
- `{prefix}-node-{version}` - Node.js installation
- `{prefix}-modules` - node_modules directory

## Version Detection

Auto-detects version from (in order):
1. `node-version` input
2. `.node-version`
3. `.nvmrc`
4. `.tool-versions`

## Package Manager Detection

Auto-detects from lock files:
- `pnpm-lock.yaml` → pnpm
- `yarn.lock` → yarn
- `package-lock.json` → npm

## Inputs

| Input | Description |
|-------|-------------|
| `workspace` | BoringCache workspace |
| `node-version` | Node.js version (e.g., `20`, `18.19.0`) |
| `cache-tag` | Cache tag prefix (defaults to repo name) |
| `package-manager` | Override detected package manager |

## Outputs

| Output | Description |
|--------|-------------|
| `cache-hit` | `true` if cache was restored |
| `node-version` | Installed Node.js version |
| `node-tag` | Cache tag for Node.js installation |
| `modules-tag` | Cache tag for node_modules |

## Code Structure

- `lib/restore.ts` - Restore caches, install Node.js via mise
- `lib/save.ts` - Save caches
- `lib/utils.ts` - Shared utilities, mise helpers, package manager detection

## Build

```bash
npm install && npm run build && npm test
```

---
**See [../AGENTS.md](../AGENTS.md) for shared conventions.**
