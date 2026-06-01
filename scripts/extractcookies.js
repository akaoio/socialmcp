#!/usr/bin/env node
/**
 * extractcookies.js — extracts and decrypts Facebook cookies from the system
 * Chromium profile on Linux.
 *
 * Requires: python3-pycryptodome (installed by ./install.sh --server)
 *
 * Usage:
 *   node scripts/extractcookies.js > /tmp/fb_cookies.json
 *   FACEBOOK_COOKIES=$(cat /tmp/fb_cookies.json) npm test
 *
 * The output is a JSON array of { name, value, domain, path, httpOnly, secure }
 * objects, suitable for Playwright's context.addCookies().
 */

import { execFileSync } from 'child_process';
import { homedir }      from 'os';
import { join }         from 'path';

const COOKIE_DB = join(homedir(), '.config/chromium/Default/Cookies');

const PYTHON = `
import sys, json, sqlite3
from Cryptodome.Cipher import AES
from Cryptodome.Protocol.KDF import PBKDF2

db   = sys.argv[1]
key  = PBKDF2(b'peanuts', b'saltysalt', dkLen=16, count=1)
iv   = b' ' * 16

con  = sqlite3.connect(db)
rows = con.execute(
    "SELECT name, encrypted_value, host_key, path, is_httponly, is_secure "
    "FROM cookies WHERE host_key LIKE '%facebook.com'"
).fetchall()
con.close()

result = []
for name, enc, host, path, httponly, secure in rows:
    if enc[:3] != b'v10':
        continue
    plain = AES.new(key, AES.MODE_CBC, iv).decrypt(enc[3:])
    value = plain[32:].decode('utf-8', errors='replace').rstrip('\\x01\\x02\\x03\\x04\\x05\\x06\\x07\\x08\\x09\\x0a\\x0b\\x0c\\x0d\\x0e\\x0f\\x10')
    result.append({
        'name':     name,
        'value':    value,
        'domain':   host.lstrip('.'),
        'path':     path,
        'httpOnly': bool(httponly),
        'secure':   bool(secure),
    })

print(json.dumps(result))
`;

const out = execFileSync('python3', ['-c', PYTHON, COOKIE_DB], { encoding: 'utf8' });
process.stdout.write(out);
