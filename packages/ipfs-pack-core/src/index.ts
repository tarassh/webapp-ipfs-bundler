import fs from 'node:fs';
import path from 'node:path';
import { CarWriter } from '@ipld/car';
import { importer } from 'ipfs-unixfs-importer';
import { CID } from 'multiformats/cid';

/**
 * Minimal in-memory blockstore implementing the interface used by ipfs-unixfs-importer.
 * We avoid external blockstore packages to keep compatibility and simplicity.
 */
class MemoryBlockstore {
  private map = new Map<string, Uint8Array>();
  async put(key: CID, val: Uint8Array) {
    this.map.set(key.toString(), val);
  }
  async get(key: CID) {
    const v = this.map.get(key.toString());
    if (!v) throw new Error(`block not found: ${key.toString()}`);
    return v;
  }
  async has(key: CID) {
    return this.map.has(key.toString());
  }
  async *blocks() {
    for (const [k, v] of this.map.entries()) {
      yield { key: k, val: v };
    }
  }
}

export type PackResult = {
  rootCid: string;
  fileCids: Record<string, string>;
  carPath: string;
  manifestPath: string;
};

/**
 * Pack a directory as a UnixFS DAG, write a CAR and manifest with per-file CIDs and root CID.
 * - Uses CIDv1 (base32).
 * - Preserves folder structure; use the root CID for /ipfs/<root>/ mounts.
 */
export async function packDirectoryToCar(
  outDir: string,
  carPath: string,
  manifestPath: string = path.join(outDir, 'ipfs-manifest.json')
): Promise<PackResult> {
  const debugEnabled = !!process.env.IPFS_PACK_DEBUG;
  const debugEntries: any[] = debugEnabled ? [] : [];
  const blockstore = new MemoryBlockstore();

  // Collect files in outDir
  const files: { path: string; content: AsyncIterable<Uint8Array> }[] = [];
  const relPaths: string[] = [];
  const excludedAtRoot = new Set(['bundle.car', 'ipfs-manifest.json', 'ipfs-debug.json']);

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(outDir, abs).replace(/\\/g, '/');
      if (entry.isDirectory()) walk(abs);
      else {
        if (excludedAtRoot.has(rel)) continue;
        relPaths.push(rel);
        files.push({
          path: rel,
          content: (async function* () {
            yield fs.readFileSync(abs);
          })()
        });
      }
    }
  };
  walk(outDir);

  // Import into UnixFS (wrapWithDirectory to get stable directory root)
  const fileCids: Record<string, string> = {};
  let rootCidStr: string | null = null;

  for await (const entry of importer(files, blockstore as any, {
    cidVersion: 1,
    rawLeaves: true,
    wrapWithDirectory: true
  })) {
    if (debugEnabled) {
      const cidV1 = entry.cid.toV1().toString();
      const cidRaw = entry.cid.toString();
      const normalize = (v: any) => typeof v === 'bigint' ? v.toString() : v;
      const unixfs: any = (entry as any)?.unixfs;
      const sizeCandidate =
        (entry as any)?.size ??
        (typeof unixfs?.fileSize === 'function' ? unixfs.fileSize() : unixfs?.fileSize);
      debugEntries.push({
        path: entry.path,
        cidV1,
        cidRaw,
        size: normalize(sizeCandidate),
        type: unixfs?.type ?? undefined
      });
    }
    if (entry.path === '') {
      rootCidStr = entry.cid.toV1().toString();
    } else if (typeof entry.path === 'string') {
      // Capture file CIDs (v1 base32)
      fileCids[entry.path] = entry.cid.toV1().toString();
    }
  }

  if (!rootCidStr) {
    throw new Error('Failed to compute root CID');
  }

  // Write CAR with all blocks, root is the directory CID
  const { writer, out } = CarWriter.create([CID.parse(rootCidStr)]);
  const carWrite = fs.createWriteStream(carPath);
  const writeOutPromise = (async () => {
    for await (const chunk of out as AsyncIterable<Uint8Array>) {
      carWrite.write(chunk);
    }
    carWrite.end();
  })();
  let numBlocksWritten = 0;
  for await (const b of blockstore.blocks()) {
    const cid = CID.parse(b.key);
    await writer.put({ cid, bytes: b.val });
    numBlocksWritten++;
  }
  await writer.close();
  await writeOutPromise;

  // Manifest
  const manifest = { root: rootCidStr, files: fileCids };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (debugEnabled) {
    const debugPath = path.join(outDir, 'ipfs-debug.json');
    const debugPayload = {
      root: rootCidStr,
      files: fileCids,
      blocks: numBlocksWritten,
      entries: debugEntries
    };
    fs.writeFileSync(debugPath, JSON.stringify(debugPayload, null, 2));
  }

  return { rootCid: rootCidStr, fileCids, carPath, manifestPath };
}

/**
 * Optional helper: inject a meta tag with the root CID into index.html if it exists.
 */
export function stampIndexWithRootCID(outDir: string, rootCid: string) {
  const indexPath = path.join(outDir, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  const html = fs.readFileSync(indexPath, 'utf8');
  if (html.includes('name="ipfs-root-cid"')) return;
  const tag = `<meta name="ipfs-root-cid" content="${rootCid}" />`;
  const updated = html.replace('</head>', `${tag}\n</head>`);
  fs.writeFileSync(indexPath, updated);
}

export default { packDirectoryToCar, stampIndexWithRootCID };

/**
 * Generate IPFS-addressed HTML variants that reference subresources via /ipfs/<rootCID>/<path>.
 * This keeps original outputs intact and writes sibling files with a ".ipfs.html" suffix.
 * Useful for verifiable browsers that resolve /ipfs/ without gateways.
 */
export function writeIpfsAddressedHtml(
  outDir: string,
  manifestPath?: string,
  options?: { urlStyle?: 'path' | 'scheme' | 'scheme-file' }
) {
  const manifestAbs = manifestPath ?? path.join(outDir, 'ipfs-manifest.json');
  if (!fs.existsSync(manifestAbs)) return;
  const manifestRaw = fs.readFileSync(manifestAbs, 'utf8');
  let manifest: { root: string; files: Record<string, string> };
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return;
  }
  const rootCid = manifest.root;
  if (!rootCid) return;
  const styleEnvRaw = (process.env.IPFS_PACK_URL_STYLE || process.env.IPFS_URL_STYLE || '').toLowerCase();
  const envStyle: 'path' | 'scheme' | 'scheme-file' =
    styleEnvRaw === ''
      ? 'scheme-file' // default: per-file ipfs://<cid>
      : (styleEnvRaw === 'scheme-file' || styleEnvRaw === 'file'
          ? 'scheme-file'
          : (styleEnvRaw === 'scheme' || styleEnvRaw === 'ipfs' ? 'scheme' : 'path'));
  const urlStyle = options?.urlStyle ?? envStyle;
  const ipfsPrefix = urlStyle === 'scheme' ? `ipfs://${rootCid}/` : `/ipfs/${rootCid}/`;

  const htmlFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.name.toLowerCase().endsWith('.html')) {
        htmlFiles.push(abs);
      }
    }
  };
  walk(outDir);

  // Build quick lookup of valid relative paths present in the build output
  const relPaths = new Set(Object.keys(manifest.files));

  const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const htmlPath of htmlFiles) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    let updated = html;

    // Replace occurrences of src/href with either /ipfs/<root>/<path> or ipfs://<fileCid>
    // We try a small set of common URL shapes for robustness.
    for (const rel of relPaths) {
      const candidates = [
        rel,
        `./${rel}`,
        `/${rel}`
      ];
      for (const cand of candidates) {
        const rx = new RegExp(`(src|href)=(['"])${escapeForRegex(cand)}\\2`, 'g');
        updated = updated.replace(rx, (_m, attr, quote) => {
          if (urlStyle === 'scheme-file') {
            const fileCid = manifest.files[rel];
            if (!fileCid) return `${attr}=${quote}${ipfsPrefix}${rel}${quote}`;
            return `${attr}=${quote}ipfs://${fileCid}${quote}`;
          } else {
            return `${attr}=${quote}${ipfsPrefix}${rel}${quote}`;
          }
        });
      }
    }

    const outPath =
      htmlPath.endsWith('.html') ? htmlPath.replace(/\.html$/i, '.ipfs.html') : `${htmlPath}.ipfs.html`;
    if (updated !== html) {
      fs.writeFileSync(outPath, updated);
    } else {
      // If no replacements happened:
      // - For scheme-file, emit unchanged .ipfs.html (no useful base for per-file CIDs)
      // - Otherwise, inject a <base> to root/path style to help relative assets
      if (urlStyle === 'scheme-file') {
        fs.writeFileSync(outPath, html);
      } else {
        const baseTag = `<base href="${ipfsPrefix}">`;
        let injected = html;
        if (html.includes('<head')) {
          injected = html.replace('</head>', `${baseTag}\n</head>`);
        } else {
          injected = `${baseTag}\n${html}`;
        }
        fs.writeFileSync(outPath, injected);
      }
    }
  }
}

/**
 * Compute only the manifest (root CID and per-file CIDs) without writing a CAR file.
 */
export async function computeDirectoryManifest(
  outDir: string,
  manifestPath: string = path.join(outDir, 'ipfs-manifest.json')
): Promise<{ rootCid: string; fileCids: Record<string, string>; manifestPath: string }> {
  const debugEnabled = !!process.env.IPFS_PACK_DEBUG;
  const debugEntries: any[] = debugEnabled ? [] : [];
  const blockstore = new MemoryBlockstore();

  const files: { path: string; content: AsyncIterable<Uint8Array> }[] = [];
  const excludedAtRoot = new Set(['bundle.car', 'ipfs-manifest.json', 'ipfs-debug.json']);
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(outDir, abs).replace(/\\/g, '/');
      if (entry.isDirectory()) walk(abs);
      else {
        if (excludedAtRoot.has(rel)) continue;
        files.push({
          path: rel,
          content: (async function* () {
            yield fs.readFileSync(abs);
          })()
        });
      }
    }
  };
  walk(outDir);

  const fileCids: Record<string, string> = {};
  let rootCidStr: string | null = null;
  for await (const entry of importer(files, blockstore as any, {
    cidVersion: 1,
    rawLeaves: true,
    wrapWithDirectory: true
  })) {
    if (debugEnabled) {
      const cidV1 = entry.cid.toV1().toString();
      const cidRaw = entry.cid.toString();
      const normalize = (v: any) => (typeof v === 'bigint' ? v.toString() : v);
      const unixfs: any = (entry as any)?.unixfs;
      const sizeCandidate =
        (entry as any)?.size ??
        (typeof unixfs?.fileSize === 'function' ? unixfs.fileSize() : unixfs?.fileSize);
      debugEntries.push({
        path: entry.path,
        cidV1,
        cidRaw,
        size: normalize(sizeCandidate),
        type: unixfs?.type ?? undefined
      });
    }
    if (entry.path === '') {
      rootCidStr = entry.cid.toV1().toString();
    } else if (typeof entry.path === 'string') {
      fileCids[entry.path] = entry.cid.toV1().toString();
    }
  }
  if (!rootCidStr) {
    throw new Error('Failed to compute root CID');
  }
  const manifest = { root: rootCidStr, files: fileCids };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (debugEnabled) {
    const debugPath = path.join(outDir, 'ipfs-debug.json');
    const debugPayload = {
      root: rootCidStr,
      files: fileCids,
      // No CAR written; block count is still indicative
      entries: debugEntries
    };
    fs.writeFileSync(debugPath, JSON.stringify(debugPayload, null, 2));
  }
  return { rootCid: rootCidStr, fileCids, manifestPath };
}

/**
 * Upload a directory's files to an IPFS node via HTTP API.
 * - Respects env: IPFS_API_URL (default http://127.0.0.1:5001), IPFS_API_AUTH (optional header value)
 * - By default, uploads the directory as a folder (wrapWithDirectory) so the returned root matches the directory CID.
 * - Returns the root CID and per-file CIDs from the node response map.
 */
export async function uploadDirectoryViaApi(
  outDir: string,
  options?: {
    apiUrl?: string;
    authHeader?: string;
    wrapWithDirectory?: boolean;
  }
): Promise<{ rootCid: string; fileCids: Record<string, string> }> {
  const { create } = await import('ipfs-http-client');
  const apiUrl = options?.apiUrl || process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
  const authHeader = options?.authHeader || process.env.IPFS_API_AUTH;
  const wrapWithDirectory = options?.wrapWithDirectory ?? true;

  const client = create({
    url: apiUrl,
    headers: authHeader ? { Authorization: authHeader } : undefined
  } as any);

  // Prepare file sources
  const sources: Array<{ path: string; content: Uint8Array }> = [];
  const excludedAtRoot = new Set(['bundle.car', 'ipfs-manifest.json', 'ipfs-debug.json']);
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(outDir, abs).replace(/\\/g, '/');
      if (entry.isDirectory()) walk(abs);
      else {
        if (excludedAtRoot.has(rel)) continue;
        const content = fs.readFileSync(abs);
        sources.push({ path: rel, content });
      }
    }
  };
  walk(outDir);

  const fileCids: Record<string, string> = {};
  let rootCid: string | null = null;

  // Upload all files; ipfs-http-client will handle directory wrapping if requested
  for await (const result of (client as any).addAll(sources, {
    wrapWithDirectory,
    cidVersion: 1,
    rawLeaves: true,
    pin: true
  })) {
    // result.path is '' for the directory root entry when wrapWithDirectory is true
    const cidStr = String(result.cid);
    if (result.path === '' || (wrapWithDirectory && result.path === undefined && !result.name)) {
      rootCid = cidStr;
    } else if (typeof result.path === 'string' && result.path.length > 0) {
      fileCids[result.path] = cidStr;
    }
  }
  if (!rootCid) {
    // Some versions emit the directory root as the last entry with path set to the root directory name.
    // Fallback: compute root from the set if present in map under ''.
    const rootCandidate = (fileCids as any)[''] as string | undefined;
    if (rootCandidate) rootCid = rootCandidate;
  }
  if (!rootCid) {
    throw new Error('IPFS upload did not return a directory root CID');
  }
  return { rootCid, fileCids };
}

/**
 * Create a human-readable upload report listing the root CID and each file with its CID.
 */
export function formatUploadReport(args: {
  rootCid: string;
  fileCids: Record<string, string>;
  urlStyle?: 'path' | 'scheme' | 'scheme-file';
}): string {
  const { rootCid, fileCids } = args;
  const urlStyle = args.urlStyle ?? 'scheme-file';
  const keys = Object.keys(fileCids).sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  lines.push('Uploaded to IPFS:');
  lines.push(`- root: ${rootCid}`);
  lines.push(`- files (${keys.length}):`);
  for (const k of keys) {
    const cid = fileCids[k];
    let href: string;
    if (urlStyle === 'scheme-file') {
      href = `ipfs://${cid}`;
    } else if (urlStyle === 'scheme') {
      href = `ipfs://${rootCid}/${k}`;
    } else {
      href = `/ipfs/${rootCid}/${k}`;
    }
    lines.push(`  - ${k} -> ${href}`);
  }
  return lines.join('\n');
}