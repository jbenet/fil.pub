#!/usr/bin/env node
// fp: the fil.pub command line. `fp help` (cli/help.mjs) lists the commands and flags.
import { readFile, readdir, stat, writeFile, mkdir, rename } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { encrypt, decrypt, wrapKey, unwrapKey } from './age.mjs'; // same envelope and format as the web app, on node:crypto
import { HELP, COMMANDS, commandHelp } from './help.mjs';
import { slugOf, stemSlug, gatewayUrl, PUBLIC_GATEWAY } from './links.mjs';
import { stripImage } from './exif-strip.mjs'; // generated from web/src/lib/exif-strip.ts (scripts/cli-exif.mjs)

const ORIGIN = (process.env.FP_ORIGIN || 'https://fil.pub').replace(/\/$/, '');
// Each account has its own API keys (Settings > API keys). `fp login` saves one per deployment
// in ~/.config/fp/keys.json (mode 0600); FP_API_KEY or FP_KEY wins over it.
const CONFIG_DIR = process.env.FP_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'fp');
const KEYS_FILE = join(CONFIG_DIR, 'keys.json');
function savedKeys() { try { return JSON.parse(readFileSync(KEYS_FILE, 'utf8')); } catch { return {}; } }
async function saveKeys(keys) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${KEYS_FILE}.${process.pid}`;
  await writeFile(tmp, JSON.stringify(keys, null, 1) + '\n', { mode: 0o600 });
  await rename(tmp, KEYS_FILE);
}
const KEY = process.env.FP_API_KEY || process.env.FP_KEY || savedKeys()[ORIGIN] || '';

function headers(extra = {}) {
  const h = { ...extra };
  if (KEY) h.authorization = `Bearer ${KEY}`;
  return h;
}

function parse(argv) {
  const args = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      // Only the first = splits: --password=a=b is the password a=b (debug 5: it was "a").
      const eq = a.indexOf('='), k = eq < 0 ? a.slice(2) : a.slice(2, eq), v = eq < 0 ? undefined : a.slice(eq + 1);
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--') && ['name', 'since', 'type', 'message', 'key', 'filename', 'expires', 'token'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else args.push(a);
  }
  return { args, flags };
}

// --password=<pw>, else FP_PASSWORD, else asked for on the terminal (never on the command line by default).
async function password(flags) {
  if (typeof flags.password === 'string') return flags.password;
  if (process.env.FP_PASSWORD) return process.env.FP_PASSWORD;
  if (!process.stdin.isTTY) die('--password: set FP_PASSWORD, or run on a terminal');
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl._writeToOutput = (s) => { if (!s.includes('assword')) process.stderr.write(s.replace(/[^\r\n]/g, '')); else process.stderr.write(s); };
  const pw = await rl.question('Password: ');
  rl.close();
  process.stderr.write('\n');
  if (!pw) die('empty password');
  return pw;
}

async function walk(dir, root = dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, root, out);
    else if (e.isFile()) out.push({ path: join(basename(root), relative(root, p)), file: p });
  }
  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks);
}

const MIME = { md: 'text/markdown', txt: 'text/plain', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', svg: 'image/svg+xml', html: 'text/html', csv: 'text/csv', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', pdf: 'application/pdf', zip: 'application/zip' };
/** What the viewer shows an encrypted file as: an image, text, or a file (videos and audio play). */
const kindOf = (type) => (type.startsWith('image/') ? 'image' : /^text\/|^application\/json$/.test(type) ? 'text' : 'files');
const mimeOf = (p) => MIME[p.split('.').pop().toLowerCase()] || 'application/octet-stream';
/** A file's type; a name with no extension (LICENSE, ssh-pk: 0127) is text/plain when its first
 *  8 KiB have no NUL and are UTF-8, so an encrypted one still opens as text. */
function typeOf(path, bytes) {
  const name = path.split('/').pop();
  if (name.lastIndexOf('.') > 0) return mimeOf(name);
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return 'application/octet-stream';
  try { new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: bytes.length > head.length }); return 'text/plain'; } catch { return 'application/octet-stream'; }
}

/** The name a signed-in `fp put` gives a lone file or folder, as the web composer suggests it
 *  (web/src/lib/suggest.ts): the folder's name, or the file's stem (notes/deploy.md → deploy).
 *  Null (the pub gets its short code) for stdin, several files, --encrypt (the name would give
 *  away the file's name, which the ciphertext hides), --anon, or no key. */
async function derivedName(args, flags, isDir) {
  if (flags.name || flags['no-name'] || flags.encrypt || flags.anon || !KEY || args.length !== 1 || args[0] === '-') return null;
  const base = isDir ? slugOf(basename(resolve(args[0]))) : stemSlug(args[0]);
  if (!base) return null;
  const me = await (await fetch(`${ORIGIN}/api/me`, { headers: headers() })).json().catch(() => ({}));
  if (!me.handle) return null; // names need a handle; until then the server names it by its code
  // Like the composer: a name of yours gets a new version; one another account holds (or, with
  // --burn, one that already has versions) gets -2, -3, ...
  for (let i = 1; i <= 20; i++) {
    const n = i === 1 ? base : `${base}-${i}`;
    const c = await (await fetch(`${ORIGIN}/api/names/check?name=${encodeURIComponent(n)}`, { headers: headers() })).json().catch(() => null);
    if (!c || !c.valid) return null;
    if (c.taken || (flags.burn && c.versions)) continue;
    return n;
  }
  return null;
}

/** `--name-link` and the rest: each prints that one link of the pub. */
const LINK_FLAGS = ['name-link', 'short-link', 'word-link', 'ipfs-link', 'gateway-link', 'cid', 'delete-token'];

async function put(args, flags) {
  let files = [], isDir = false;
  for (const a of args.length ? args : ['-']) {
    if (a === '-') files.push({ path: flags.filename || 'paste.txt', bytes: await readStdin() });
    else if ((await stat(a)).isDirectory()) { isDir = true; for (const f of await walk(a)) files.push({ path: f.path, bytes: await readFile(f.file) }); }
    else files.push({ path: basename(a), bytes: await readFile(a) });
  }
  // Location and other metadata leave every image before upload (the server strips plain uploads too,
  // but it can't see inside an encrypted one).
  if (!flags['keep-meta']) files = files.map((f) => /^image\//.test(mimeOf(f.path)) ? { ...f, bytes: stripImage(new Uint8Array(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength)) } : f);
  const fd = new FormData();
  let key = null;
  if (flags.encrypt) {
    if (files.length !== 1) die('--encrypt takes one file');
    const f = files[0];
    const type = typeOf(f.path, f.bytes);
    const r = await encrypt(f.bytes, { name: f.path, type, kind: kindOf(type) });
    key = r.key;
    files = [{ path: 'paste.age', bytes: r.ciphertext }];
    fd.set('encrypted', '1');
    fd.set('kind', kindOf(type));
    // --password: the key also opens with a password (key.age next to paste.age, docs/encryption.md).
    if (flags.password) fd.set('password_key', Buffer.from(await wrapKey(key, await password(flags))).toString('base64'));
  } else if (flags.password) die('--password goes with --encrypt');
  for (const f of files) { fd.append('file', new Blob([f.bytes]), basename(f.path)); fd.append('path', f.path); }
  const derived = await derivedName(args, flags, isDir);
  if (flags.name || derived) fd.set('name', flags.name || derived);
  if (flags.message) fd.set('message', flags.message);
  // Without a key the pub is anonymous (text only, under fil.pub/anonymous/), unlisted unless --listed.
  if (KEY || flags.listed) fd.set('listed', flags.unlisted ? '0' : '1');
  if (flags.private) fd.set('visibility', 'private'); // only your account sees it on fil.pub
  if (flags.anon) fd.set('anonymous', '1'); // no signature: shown as "anonymous"
  // Anonymous pubs expire in 30 days unless asked for less; --burn: read once (docs/expiry.md).
  if (flags.expires) fd.set('expires', String(flags.expires));
  if (flags.burn) fd.set('burn', '1');
  if (flags['keep-meta']) fd.set('keep_meta', '1'); // keep camera, time and location in images
  const r = await fetch(`${ORIGIN}/api/pubs`, { method: 'POST', body: fd, headers: headers() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) die(j.error || `HTTP ${r.status}`);
  // An encrypted pub's key rides in every link's #k= (the server never has it).
  const k = (u) => (u && key ? `${u}#k=${key}` : u || '');
  const links = {
    'name-link': k(j.name_url), 'short-link': k(j.short_url), 'word-link': k(j.words_url),
    'ipfs-link': k(j.url || `${ORIGIN}/ipfs/${j.cid}/`), 'gateway-link': k(gatewayUrl(j.cid)), cid: j.cid, 'delete-token': j.delete_token || '',
  };
  const main = links['name-link'] || links['ipfs-link'];
  if (flags.json) return console.log(JSON.stringify({ ...j, url: links['ipfs-link'], link: main, gateway_url: links['gateway-link'], key }, null, 1));
  // Only the links asked for, one a line, in the order asked, and nothing on stderr.
  const asked = Object.keys(flags).filter((f) => LINK_FLAGS.includes(f));
  if (asked.length) return console.log(asked.map((f) => links[f]).join('\n'));
  // The name link alone on stdout (`fp put x | pbcopy`); the others, labeled, on stderr (0132).
  console.log(main);
  const err = [];
  if (j.name && j.version > 1) err.push(`version ${j.version} of ${j.name}`);
  if (j.short_url) err.push('', `short code: ${links['short-link']}`, `words code: ${links['word-link']}`);
  err.push('', `pub-ipfs link: ${links['ipfs-link']}`, `gateway link (public IPFS gateway, ${PUBLIC_GATEWAY}):`, links['gateway-link']);
  const notes = [];
  if (j.burn) notes.push('read once: the first full read deletes it');
  if (j.expiresAt) notes.push(`expires ${new Date(j.expiresAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  if (j.delete_token) notes.push(`delete token: ${j.delete_token}  (fp rm ${j.name} --token ${j.delete_token})`);
  if (notes.length) err.push('', ...notes);
  console.error(err.join('\n'));
}

function since(s) {
  const m = String(s).match(/^(\d+)([mhd])$/);
  if (!m) die('--since takes e.g. 30m, 24h, 7d');
  return Date.now() - Number(m[1]) * { m: 60e3, h: 3600e3, d: 86400e3 }[m[2]];
}

async function ls(args, flags) {
  const q = new URLSearchParams();
  if (flags.since) q.set('since', String(since(flags.since)));
  if (flags.type) q.set('type', flags.type);
  q.set('limit', '200');
  // Every page (debug 5: it printed the newest 100 and stopped).
  const pubs = [];
  for (let cursor = null; ;) {
    if (cursor) q.set('cursor', cursor);
    const r = await fetch(`${ORIGIN}/api/pubs?${q}`, { headers: headers() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) die(j.error || `HTTP ${r.status}`);
    pubs.push(...j.pubs);
    if (!j.next || j.next === cursor) break;
    cursor = j.next;
  }
  if (flags.json) return console.log(JSON.stringify(pubs, null, 1));
  for (const p of pubs) console.log(`${new Date(p.createdAt).toISOString().slice(0, 16).replace('T', ' ')}  ${p.cid}  ${p.encrypted ? '[enc] ' : ''}${p.name ? `${p.name}@v${p.version}` : p.title}`);
}

/** The name a link means, under its handle: `/<handle>/<name>` (also `/raw`, `.git`), or `/s/`
 *  and `/w/` links, which the server resolves to that. Null for anything else (a CID, an /ipfs/
 *  link, a bare name). The handle matters: two accounts can each have a `notes` (debug 5: a
 *  short link or name link of another account's `notes` read, or deleted, the caller's own). */
async function nameLink(a) {
  if (!/^https?:\/\//i.test(a) && !/^\/?(s|w)\//i.test(a)) return null;
  const u = new URL(a, ORIGIN);
  let parts = u.pathname.split('/').filter(Boolean);
  if (/^(s|w)$/i.test(parts[0] || '') && parts.length === 2) {
    const r = await fetch(`${ORIGIN}/${parts[0].toLowerCase()}/${parts[1]}`, { redirect: 'manual', headers: headers({ accept: 'text/html' }) });
    const to = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
    if (!to) die(`no pub at ${a}`);
    parts = new URL(to, ORIGIN).pathname.split('/').filter(Boolean);
  }
  if (parts[2] === 'raw' && parts.length === 3) parts = parts.slice(0, 2);
  const label = (s) => decodeURIComponent(s).replace(/\.git$/, '').toLowerCase();
  if (parts.length === 2 && parts[0] !== 'ipfs') return { handle: decodeURIComponent(parts[0]).toLowerCase(), name: label(parts[1]) };
  // https://juan.fil.pub/notes: the handle is the host.
  if (parts.length === 1) return { handle: u.host === new URL(ORIGIN).host ? null : u.hostname.toLowerCase(), name: label(parts[0]) };
  return null;
}
/** /api/names/<name> for a name or a name link (see nameLink), with what follows. */
async function namePath(a, rest = '', n) {
  n = n || await nameLink(a);
  if (n) return `/api/names/${encodeURIComponent(n.name)}${rest}${n.handle ? `?handle=${encodeURIComponent(n.handle)}` : ''}`;
  if (/^https?:|\//i.test(a)) die(`${a} is not a name link: pass the name, its link (${ORIGIN}/<handle>/<name>), or its /s/ or /w/ link`);
  return `/api/names/${encodeURIComponent(a)}${rest}`;
}

async function get(args, flags) {
  let [target, path] = args;
  if (!target) die('fp get <cid|url> [path]');
  let key = flags.key;
  // Name links (/<handle>/<name>), short and word links (/s/x7k2qd, /w/otter-plaza-crumb): the
  // name's latest version.
  const named = !/\/ipfs\//i.test(target) && await nameLink(target.replace(/#.*$/, ''));
  if (named) {
    const n = await (await fetch(`${ORIGIN}${await namePath(target, '', named)}`, { headers: headers() })).json().catch(() => ({}));
    if (!n.versions?.[0]?.cid) die(`no pub at ${target}`);
    key = key || target.match(/#k=([A-Za-z0-9-]+)/)?.[1];
    target = n.versions[0].cid;
  }
  const m = target.match(/ipfs\/([a-z0-9]+)\/?([^#?]*)(?:\?[^#]*)?(?:#k=([A-Za-z0-9-]+))?/i);
  if (m) { target = m[1]; path = path || (m[2] ? decodeURIComponent(m[2]) : ''); key = key || m[3]; }
  if (!path) {
    const meta = await (await fetch(`${ORIGIN}/ipfs/${target}/meta.json?raw`, { headers: headers() })).json();
    path = meta.main || meta.files?.[0]?.path;
  }
  // The path comes from the link or the pub's own meta.json: keep it inside the pub, so a
  // pub can't point this request (which carries the API key) at another fil.pub route.
  const parts = String(path).split('/').filter((s) => s && s !== '.');
  if (!/^[a-z0-9]+$/i.test(target) || !parts.length || parts.some((s) => s === '..')) die(`bad pub path: ${path}`);
  const r = await fetch(`${ORIGIN}/ipfs/${target}/${parts.map(encodeURIComponent).join('/')}?raw`, { headers: headers() });
  if (!r.ok) die(`HTTP ${r.status}`);
  let data = Buffer.from(await r.arrayBuffer());
  if (path === 'paste.age') {
    // A password pub (0114) without its key: key.age opens with the password.
    if (!key && flags.password) {
      const k = await fetch(`${ORIGIN}/ipfs/${target}/key.age?raw`, { headers: headers() });
      if (!k.ok) die('This pub has no password; pass --key or the full link with #k=');
      key = await unwrapKey(Buffer.from(await k.arrayBuffer()), await password(flags)).catch((e) => die(e.message));
    }
    if (!key) die('Encrypted: pass --key, --password, or the full link with #k=');
    data = (await decrypt(data, key)).data;
  }
  process.stdout.write(data);
}

// Opens a pub's page: a CID, any link (name, /s/, /w/, /ipfs/), `<handle>/<name>`, or one of
// your own names (debug 9: no argument opened /ipfs/undefined/, and a name opened /ipfs/<name>/).
async function open(args) {
  const a = args[0] || die('fp open <cid|name|url>');
  let url;
  if (/^https?:\/\//i.test(a)) url = a;
  else if (/^\/?(s|w|ipfs)\//i.test(a)) url = `${ORIGIN}/${a.replace(/^\//, '')}`;
  else if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/.test(a)) url = `${ORIGIN}/ipfs/${a}/`;
  else if (a.includes('/')) url = `${ORIGIN}/${a}`;
  else {
    // A bare name is one of yours, under your handle.
    if (!KEY) die(`${a}: pass <handle>/${a}, or fp login to open your own names`);
    const me = await (await fetch(`${ORIGIN}/api/me`, { headers: headers() })).json().catch(() => ({}));
    if (!me.handle) die(`${a}: pass <handle>/${a} (your account has no handle)`);
    url = `${ORIGIN}/${me.handle}/${encodeURIComponent(a)}`;
  }
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  // No opener (a server, a container): the printed URL is still there to copy.
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  console.log(url);
}

const labelIn = (at) => decodeURIComponent(at.split('/')[3].split('?')[0]);

// Deletes a pub (every version of its name): with the delete token `fp put` printed for an
// anonymous pub, or with FP_API_KEY (write scope). Takes the name, or any of its links.
async function rm(args, flags) {
  const a = args[0] || die('fp rm <name|link> --token <fpd_...>');
  if (!flags.token && !KEY) die('pass --token (printed by fp put), or sign in with fp login');
  const at = await namePath(a);
  const r = await fetch(`${ORIGIN}${at}`, { method: 'DELETE', headers: flags.token ? { 'x-delete-token': String(flags.token) } : headers() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) die(j.error || `HTTP ${r.status}`);
  console.error(`deleted ${labelIn(at)}`);
}

// Stops fil.pub serving a pub (every version of its name) and keeps it stored, or serves it
// again (docs/expiry.md "Unpublish"). Same arguments as rm.
const setServed = (on) => async (args, flags) => {
  const verb = on ? 'republish' : 'unpublish';
  const a = args[0] || die(`fp ${verb} <name|link>`);
  if (!flags.token && !KEY) die('pass --token (printed by fp put), or sign in with fp login');
  const at = await namePath(a, `/${verb}`), name = labelIn(at);
  const r = await fetch(`${ORIGIN}${at}`, { method: 'POST', headers: flags.token ? { 'x-delete-token': String(flags.token) } : headers() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) die(j.error || `HTTP ${r.status}`);
  console.error(on ? `${name} is published again` : `unpublished ${name}: fil.pub no longer serves it (fp republish ${name} to undo)`);
};
const unpublish = setServed(false), republish = setServed(true);

function die(msg) { console.error(`fp: ${msg}`); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);
const { args, flags } = parse(rest);
// Saves an API key for this deployment after checking it: from the argument, or stdin.
async function login(args) {
  let key = args[0];
  if (!key && !process.stdin.isTTY) key = (await readStdin()).toString();
  if (!key) {
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    key = await rl.question(`API key from ${ORIGIN}/settings/keys: `);
    rl.close();
  }
  key = key.trim();
  if (!/^fp_live_[a-z2-7]+$/.test(key)) die('that is not a fil.pub API key (fp_live_...)');
  const me = await (await fetch(`${ORIGIN}/api/me`, { headers: { authorization: `Bearer ${key}` } })).json().catch(() => ({}));
  if (!me.signedIn) die(`${ORIGIN} doesn't take that key (revoked, or from another deployment?)`);
  await saveKeys({ ...savedKeys(), [ORIGIN]: key });
  console.error(`signed in to ${ORIGIN} as ${me.handle || me.address}`);
}

// Revokes the saved key on the server (so a copy of it left anywhere stops working), then forgets it.
async function logout() {
  const keys = savedKeys();
  const key = keys[ORIGIN];
  if (key) {
    const r = await fetch(`${ORIGIN}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${key}` } }).catch((e) => ({ ok: false, status: e.message }));
    if (!r.ok) console.error(`fp: couldn't revoke the key on ${ORIGIN} (${r.status}); revoke it in ${ORIGIN}/settings/keys`);
  }
  delete keys[ORIGIN];
  await saveKeys(keys);
  console.error(`signed out of ${ORIGIN}${key ? '; the key is revoked' : ''}`);
}

async function whoami() {
  if (!KEY) { console.log(`anonymous on ${ORIGIN} (fp login to sign in)`); return; }
  const me = await (await fetch(`${ORIGIN}/api/me`, { headers: headers() })).json().catch(() => ({}));
  if (!me.signedIn) die('the saved key no longer works; fp login with a new one');
  console.log(`${me.handle || me.address} on ${ORIGIN}`);
}

const cmds = { put, ls, get, open, rm, unpublish, republish, login, logout, whoami };
// `fp <command> -h` (or --help, or `fp help <command>`): that command's usage and flags.
const about = cmd === 'help' && COMMANDS[args[0]] ? args[0] : cmds[cmd] && (rest.includes('-h') || flags.help) ? cmd : null;
if (about) { console.log(commandHelp(about)); process.exit(0); }
if (!cmds[cmd]) {
  const asked = !cmd || ['help', '--help', '-h'].includes(cmd);
  (asked ? console.log : console.error)(asked ? HELP : `fp: unknown command ${cmd}\n\n${HELP}`);
  process.exit(asked ? 0 : 1);
}
cmds[cmd](args, flags).catch((e) => die(e.message));
