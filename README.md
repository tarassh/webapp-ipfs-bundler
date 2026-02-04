# web-ipfs-pack

Monorepo that adds IPFS packing to front-end builds. After building Vite/Webpack/Next projects,
it generates:
- `ipfs-manifest.json` (path -> CID map and root CID)
- `bundle.car` (CAR file containing the UnixFS DAG)
- optional meta tag with root CID in `index.html`

## Packages
- `ipfs-pack-core`: shared TypeScript helper to pack a directory to a CAR and manifest
- `vite-plugin-ipfs-pack`: Vite plugin (React and others)
- `webpack-ipfs-pack`: Webpack plugin (CJS)
- `next-ipfs-pack`: Next.js postbuild script

## Examples
- `examples/vite-react`
- `examples/webpack-react`
- `examples/next`

## Quickstart

```bash
pnpm install
pnpm -r run build    # build all packages
pnpm -C examples/vite-react run build
pnpm -C examples/webpack-react run build
pnpm -C examples/next run build
```

Each example emits `bundle.car` and `ipfs-manifest.json` into its build folder.
