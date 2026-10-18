// Local artifact receiver for the browser's real MediaPipe preparation pipeline.
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('.evidence/body-v2/prepared');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  if (request.headers.origin !== 'http://localhost:5173') { response.writeHead(403).end(); return; }
  response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
  const name = decodeURIComponent((request.url ?? '').slice(1));
  if (!['POST', 'GET'].includes(request.method) || !/^[a-z0-9-]+\.(json|webp)$/.test(name)) { response.writeHead(400).end(); return; }
  try {
    if (request.method === 'GET') { response.end(await readFile(resolve(output, name))); return; }
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 25e6) throw Error('Too large'); chunks.push(chunk); }
    await writeFile(resolve(output, name), Buffer.concat(chunks));
    response.writeHead(201).end('Saved');
  } catch { response.writeHead(request.method === 'GET' ? 404 : 500).end('Could not save artifact'); }
});
server.listen(8788, '127.0.0.1', () => process.stdout.write('Body preparation receiver ready on 8788\n'));
