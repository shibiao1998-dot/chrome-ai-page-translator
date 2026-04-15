import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT_DIR = new URL('.', import.meta.url).pathname;

export default defineConfig({
  publicDir: false,
  plugins: [
    {
      name: 'copy-manifest',
      closeBundle() {
        const distDir = resolve(ROOT_DIR, 'dist');
        mkdirSync(distDir, { recursive: true });
        copyFileSync(resolve(ROOT_DIR, 'src/content/manifest.json'), resolve(distDir, 'manifest.json'));
        copyFileSync(resolve(ROOT_DIR, 'public/content.js'), resolve(distDir, 'content.js'));
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: 'src/background/index.ts',
        popup: 'src/popup/index.html',
        options: 'src/options/index.html'
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return '[name].js';
          }

          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
