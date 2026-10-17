import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],server:{port:5173,strictPort:true,fs:{deny:['**/.env','**/.env.*','**/.git/**','**/server/**','**/.remotion-data/**']},watch:{ignored:['**/.remotion-data/**','**/server/**','**/dist-clinician/**','**/dist-echoes/**']},proxy:{'/api':'http://127.0.0.1:3001'}},build:{chunkSizeWarningLimit:1600}});
