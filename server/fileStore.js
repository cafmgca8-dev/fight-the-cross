import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function readJson(relativePath) { const filePath = path.join(root, relativePath); return JSON.parse(await fs.readFile(filePath, 'utf8')); }
export async function writeJson(relativePath, data) { const filePath = path.join(root, relativePath); await fs.mkdir(path.dirname(filePath), { recursive: true }); await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8'); }
export function resolveRoot(relativePath) { return path.join(root, relativePath); }
