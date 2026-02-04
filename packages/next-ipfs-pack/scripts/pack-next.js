import path from 'node:path';
import { packDirectoryToCar, stampIndexWithRootCID, writeIpfsAddressedHtml, computeDirectoryManifest, uploadDirectoryViaApi } from '@cursor/ipfs-pack-core';

const outDir = path.resolve(process.cwd(), 'out');
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
console.log('IPFS root CID:', rootCid);
if (String(process.env.IPFS_UPLOAD ?? 'false').toLowerCase() === 'true' || String(process.env.IPFS_UPLOAD ?? 'false').toLowerCase() === '1' || String(process.env.IPFS_UPLOAD ?? 'false').toLowerCase() === 'yes') {
  try {
    const uploadResult = await uploadDirectoryViaApi(outDir, {
      apiUrl: process.env.IPFS_API_URL,
      authHeader: process.env.IPFS_API_AUTH,
      wrapWithDirectory: true
    });
    const urlStyleEnv = (process.env.IPFS_PACK_URL_STYLE || process.env.IPFS_URL_STYLE || '').toLowerCase();
    const urlStyle = urlStyleEnv === '' ? 'scheme-file' : urlStyleEnv;
    const { formatUploadReport } = await import('@cursor/ipfs-pack-core');
    const report = formatUploadReport({
      rootCid: uploadResult.rootCid,
      fileCids: uploadResult.fileCids,
      urlStyle
    });
    console.log(report);
  } catch (e) {
    console.warn('IPFS upload failed:', e && e.message ? e.message : String(e));
  }
}