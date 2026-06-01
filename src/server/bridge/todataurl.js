import fs   from 'fs';
import path from 'path';

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

export function todataurl(p) {
  const ext  = path.extname(p).slice(1).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
}
