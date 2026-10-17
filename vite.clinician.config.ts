import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import appConfig from './vite.config.ts';
export default mergeConfig(appConfig, defineConfig({ build: { outDir: 'dist-clinician', rollupOptions: { input: { app: fileURLToPath(new URL('./index.html', import.meta.url)), clinician: fileURLToPath(new URL('./src/features/clinician/dashboard/index.html', import.meta.url)) } } } }));
