const path = require('node:path');

class IpfsPackPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapPromise('IpfsPackPlugin', async (compilation) => {
      const { packDirectoryToCar, stampIndexWithRootCID, writeIpfsAddressedHtml, computeDirectoryManifest, uploadDirectoryViaApi } = await import('@cursor/ipfs-pack-core');
      const outDir = compiler.options.output.path;
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
          compilation.warnings.push(new Error(report));
        } catch (e) {
          compilation.warnings.push(new Error(`IPFS upload failed: ${e && e.message ? e.message : String(e)}`));
        }
      }
      compilation.warnings.push(new Error(`IPFS root CID: ${rootCid}`));
    });
  }
}

module.exports = IpfsPackPlugin;