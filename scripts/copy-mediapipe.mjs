import { mkdir, readdir, copyFile } from 'node:fs/promises';
const source = 'node_modules/@mediapipe/tasks-vision/wasm';
await mkdir('public/mediapipe', {recursive:true});
for (const file of await readdir(source)) if (/\.(wasm|js)$/.test(file)) await copyFile(`${source}/${file}`, `public/mediapipe/${file}`);
