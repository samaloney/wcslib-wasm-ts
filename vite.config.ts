import { defineConfig } from 'vitest/config';

export default defineConfig({
  // This ensures Vite doesn't try to process the .wasm as a standard asset
  // and allows the ?url suffix to work correctly.
  assetsInclude: ['**/*.wasm'],
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'WcsLib',
      fileName: 'wcslib'
    },
    rollupOptions: {
      // Ensure the .wasm file is emitted in the output
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.wasm')) return 'wcslib.wasm';
          return assetInfo.name || '';
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'node', // Use node for Wasm testing unless you need DOM
  }
});
