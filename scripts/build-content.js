import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const src = resolve(root, 'src/content/content-runtime.template.js');
const outDir = resolve(root, 'public');
const out = resolve(outDir, 'content.js');

mkdirSync(outDir, { recursive: true });
writeFileSync(out, readFileSync(src, 'utf8'));
