import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import ipfsPack from '@cursor/vite-plugin-ipfs-pack';

export default defineConfig({
  base: './',
  plugins: [react(), ipfsPack()]
});