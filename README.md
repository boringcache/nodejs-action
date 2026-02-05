# boringcache/nodejs-action

**Cache once. Reuse everywhere.**

BoringCache is a universal build artifact cache for CI, Docker, and local development. It stores and restores directories you choose so build outputs, dependencies, and tool caches can be reused across environments.

BoringCache does not run builds and is not tied to any build tool. It works with any language, framework, or workflow by caching directories explicitly selected by the user.

Caches are content-addressed and verified before restore. If identical content already exists, uploads are skipped. The same cache can be reused in GitHub Actions, Docker/BuildKit, and on developer machines using the same CLI.

This action installs Node.js and configures BoringCache to cache its artifacts. It uses the same BoringCache CLI and cache format as all other BoringCache actions.

## Quick start

```yaml
- uses: boringcache/nodejs-action@v1
  with:
    workspace: my-org/my-project
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}

- run: npm install
- run: npm test
```

## Mental model

This action caches the Node.js directories you explicitly choose.

- Node.js is installed via mise.
- `node_modules` is restored if a matching cache exists.
- Updated caches are saved after the job completes.

This action does not infer what should be cached and does not modify your build commands.

Version detection order:
- `.node-version`
- `.nvmrc`
- `.tool-versions` (asdf/mise format)

If no version file is found, defaults to Node.js 22.

Package manager detection:
- `pnpm-lock.yaml` -> pnpm
- `yarn.lock` -> yarn
- Otherwise -> npm

Cache tags:
- Node.js: `{cache-tag}-node-{version}`
- Modules: `{cache-tag}-modules`

## Common patterns

### Simple Node.js CI cache

```yaml
- uses: boringcache/nodejs-action@v1
  with:
    workspace: my-org/my-project
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}
```

### With a specific Node.js version

```yaml
- uses: boringcache/nodejs-action@v1
  with:
    workspace: my-org/my-project
    node-version: '20'
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}
```

### With yarn or pnpm

```yaml
- uses: boringcache/nodejs-action@v1
  with:
    workspace: my-org/my-project
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}

- run: yarn install
- run: yarn test
```

```yaml
- uses: boringcache/nodejs-action@v1
  with:
    workspace: my-org/my-project
  env:
    BORINGCACHE_API_TOKEN: ${{ secrets.BORINGCACHE_API_TOKEN }}

- run: pnpm install
- run: pnpm test
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `cli-version` | No | `v1.0.0` | BoringCache CLI version. Set to `skip` to disable installation. |
| `workspace` | No | repo name | Workspace in `org/repo` form. Defaults to `BORINGCACHE_DEFAULT_WORKSPACE` or repo name. |
| `cache-tag` | No | repo name | Cache tag prefix used for node/modules tags. |
| `node-version` | No | auto-detected or `22` | Node.js version to install. |
| `working-directory` | No | `.` | Project working directory. |
| `cache-node` | No | `true` | Cache Node.js installation. |
| `cache-modules` | No | `true` | Cache `node_modules`. |
| `exclude` | No | - | Glob pattern to exclude from cache digest (e.g., `*.out`). |
| `save-always` | No | `false` | Save cache even if job fails. |

## Outputs

| Output | Description |
|--------|-------------|
| None | This action does not set outputs. |

## Platform behavior

Platform scoping is what makes it safe to reuse caches across machines.

`node_modules` and native addons are platform-specific, so keep platform scoping enabled unless your cache is fully portable.

## Environment variables

| Variable | Description |
|----------|-------------|
| `BORINGCACHE_API_TOKEN` | API token for BoringCache authentication |
| `BORINGCACHE_DEFAULT_WORKSPACE` | Default workspace if not specified in inputs |

## Troubleshooting

- Cache miss on first run is expected.
- If native modules fail to load, ensure the runner OS matches where the cache was created.

## Release notes

See https://github.com/boringcache/nodejs-action/releases.

## License

MIT
