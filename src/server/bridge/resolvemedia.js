import fs   from 'fs';
import path from 'path';
import { todataurl } from './todataurl.js';

export function resolvemedia(params) {
  if (!params?.media?.length) return params;
  return {
    ...params,
    media: params.media.map(m => (path.isAbsolute(m) && fs.existsSync(m)) ? todataurl(m) : m),
  };
}
