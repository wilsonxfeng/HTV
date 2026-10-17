import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import appConfig from './vite.config.ts';
export default mergeConfig(
  appConfig,
  defineConfig({
    build: {
      outDir: 'dist-echoes',
      rollupOptions: {
        input: fileURLToPath(
          new URL(
            './src/features/movement-echoes/demo/index.html',
            import.meta.url,
          ),
        ),
      },
    },
  }),
);
