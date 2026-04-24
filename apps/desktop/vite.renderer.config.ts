import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  return {
    plugins: [tailwindcss()],
    worker: {
      format: 'es',
    },
    resolve: {
      alias: {
        'pierre-diffs-web-components': path.resolve(
          desktopDir,
          '../../node_modules/@pierre/diffs/dist/components/web-components.js',
        ),
      },
    },
    define: {
      'import.meta.env.VITE_CODEX_BACKEND_WS': JSON.stringify(
        process.env.VITE_CODEX_BACKEND_WS ?? 'ws://127.0.0.1:3847/codex',
      ),
    },
  };
});
