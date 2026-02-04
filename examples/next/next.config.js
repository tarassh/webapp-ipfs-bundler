const crypto = require('node:crypto');
const fs = require('node:fs');

module.exports = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: '',
  assetPrefix: './',
  generateBuildId: async () => {
    const lock = fs.readFileSync(require.resolve('./package.json'), 'utf8');
    return crypto.createHash('sha256').update(lock).digest('hex').slice(0,16);
  }
};