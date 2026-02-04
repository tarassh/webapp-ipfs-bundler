import path from 'node:path';
import { packDirectoryToCar, stampIndexWithRootCID, writeIpfsAddressedHtml, computeDirectoryManifest } from '@cursor/ipfs-pack-core';

export default function ipfsPackPlugin(): import('vite').PluginOption {
  return {
    name: 'ipfs-pack',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      // Vite exposes config via this?.meta?.watchMode or configResolved hook, but the output path is predictable.
      // We'll assume default "dist" unless user changed it; use environment fallback for simplicity.
      const outDir = (this as any)?.getBuildInfo?.()?.outDir || path.resolve(process.cwd(), 'dist');
      const carPath = path.join(outDir, 'bundle.car');
      const manifestPath = path.join(outDir, 'ipfs-manifest.json');

      // Default: skip CAR unless explicitly disabled
      const skipCar = String(process.env.IPFS_PACK_SKIP_CAR ?? 'true').toLowerCase();
      const shouldSkipCar = skipCar === '1' || skipCar === 'true' || skipCar === 'yes';
      const { rootCid } = shouldSkipCar
        ? await (async () => {
            const res = await computeDirectoryManifest(outDir, manifestPath);
            return { rootCid: res.rootCid };
          })()
        : await packDirectoryToCar(outDir, carPath, manifestPath);
      stampIndexWithRootCID(outDir, rootCid);
      writeIpfsAddressedHtml(outDir, manifestPath);
      const doUpload = String(process.env.IPFS_UPLOAD ?? 'false').toLowerCase();
      if (doUpload === '1' || doUpload === 'true' || doUpload === 'yes') {
        try {
          const core: any = await import('@cursor/ipfs-pack-core');
          const uploadResult = await core.uploadDirectoryViaApi(outDir, {
            apiUrl: process.env.IPFS_API_URL,
            authHeader: process.env.IPFS_API_AUTH,
            wrapWithDirectory: true
          });
          const urlStyleEnv = (process.env.IPFS_PACK_URL_STYLE || process.env.IPFS_URL_STYLE || '').toLowerCase();
          const urlStyle = urlStyleEnv === '' ? 'scheme-file' : (urlStyleEnv as any);
          const report = core.formatUploadReport({
            rootCid: uploadResult.rootCid,
            fileCids: uploadResult.fileCids,
            urlStyle
          });
          this.warn(report);
        } catch (e: any) {
          this.warn(`IPFS upload failed: ${e?.message || e}`);
        }
      }
      this.warn(`IPFS root CID: ${rootCid}`);
    }
  };
}