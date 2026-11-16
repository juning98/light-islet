import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'dist/client');
let html = await readFile(path.join(client, 'index.html'), 'utf8');
const scriptTag = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
const styleTag = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/);
if (!scriptTag || !styleTag) throw new Error('Expected one built JavaScript bundle and one stylesheet.');
let script = await readFile(path.join(client, scriptTag[1].replace(/^\//, '')), 'utf8');
const css = await readFile(path.join(client, styleTag[1].replace(/^\//, '')), 'utf8');
for (const name of ['clear', 'frost', 'cones', 'wave', 'honeycomb']) {
  const source = `./assets/${name}.webp`;
  if (!script.includes(source)) throw new Error(`Missing material asset reference: ${source}`);
  const bytes = await readFile(path.join(client, 'assets', `${name}.webp`));
  script = script.replaceAll(source, `data:image/webp;base64,${bytes.toString('base64')}`);
}
html = html.replace(scriptTag[0], () => `<script type="module">${script.replaceAll('</script', '<\\/script')}</script>`);
html = html.replace(styleTag[0], () => `<style>${css}</style>`);
const output = path.join(root, '光屿.html');
await writeFile(output, html, 'utf8');
console.log(`Standalone HTML: ${output} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
