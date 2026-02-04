const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const IpfsPackPlugin = require('@cursor/webpack-ipfs-pack');

module.exports = {
  entry: './src/index.tsx',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'assets/bundle.js',
    publicPath: './'
  },
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
      { test: /\.css$/i, use: ['style-loader', 'css-loader'] },
      { test: /\.(png|jpe?g|gif|svg)$/i, type: 'asset/resource', generator: { filename: 'assets/[name][ext]' } }
    ]
  },
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  plugins: [
    new HtmlWebpackPlugin({ title: 'Webpack React + IPFS Pack' }),
    new IpfsPackPlugin()
  ]
};