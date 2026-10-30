// age v1 with one X25519 recipient on node:crypto (native ChaCha20-Poly1305, X25519, HKDF),
// the same format as the app's web/src/screens/pub/agelite.ts. test/agelite.test.ts checks
// both directions against age-encryption. Envelope: u32 JSON length, the JSON, then the file.
import { createCipheriv, createDecipheriv, createHmac, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const CHUNK = 64 * 1024;
const b64 = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '');
const unb64 = (s) => { if (!/^[A-Za-z0-9+/]*$/.test(s)) throw new Error('bad base64'); return Buffer.from(s, 'base64'); };
const hkdf = (ikm, salt, info) => Buffer.from(hkdfSync('sha256', ikm, salt, info, 32));
const priv = (d) => createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), d]), format: 'der', type: 'pkcs8' });
const pubOf = (k) => createPublicKey(k).export({ format: 'der', type: 'spki' }).subarray(12);
const pub = (x) => createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), x]), format: 'der', type: 'spki' });
const iv = (n, last) => { const b = Buffer.alloc(12); b.writeUInt32BE(n, 7); b[11] = last ? 1 : 0; return b; };
function seal(key, nonce, plain) {
  const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}
function open(key, nonce, sealed) {
  if (sealed.length < 16) throw new Error('truncated');
  const d = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
}

// bech32 (BIP 173), only what age secret keys need.
const CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(v) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let c = 1;
  for (const x of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i]; }
  return c;
}
const hrpx = (h) => [...h].map((c) => c.charCodeAt(0) >> 5).concat(0, [...h].map((c) => c.charCodeAt(0) & 31));
function regroup(data, from, to, pad) {
  let acc = 0, bits = 0; const out = [];
  for (const v of data) { acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & ((1 << to) - 1)); } }
  if (pad && bits) out.push((acc << (to - bits)) & ((1 << to) - 1));
  else if (!pad && (bits >= from || ((acc << (to - bits)) & ((1 << to) - 1)))) throw new Error('bad bech32 padding');
  return out;
}
function bech32Encode(hrp, bytes) {
  const d = regroup(bytes, 8, 5, true);
  const p = polymod([...hrpx(hrp), ...d, 0, 0, 0, 0, 0, 0]) ^ 1;
  return `${hrp}1${[...d, ...[0, 1, 2, 3, 4, 5].map((i) => (p >> (5 * (5 - i))) & 31)].map((x) => CS[x]).join('')}`;
}
function bech32Decode(s) {
  const l = s.toLowerCase(), at = l.lastIndexOf('1');
  if (at < 1 || l.length - at < 7) throw new Error('invalid key');
  const hrp = l.slice(0, at), d = [...l.slice(at + 1)].map((c) => { const i = CS.indexOf(c); if (i < 0) throw new Error('invalid key'); return i; });
  if (polymod([...hrpx(hrp), ...d]) !== 1) throw new Error('invalid key');
  return { hrp, bytes: Buffer.from(regroup(d.slice(0, -6), 5, 8, false)) };
}

/** Seals `data` for a fresh identity; returns the age file and the link key (AGE1…). */
export function encrypt(data, env) {
  const id = randomBytes(32), eph = randomBytes(32), fileKey = randomBytes(16), nonce = randomBytes(16);
  const idKey = priv(id), ephKey = priv(eph), me = pubOf(idKey), share = pubOf(ephKey);
  const wrap = hkdf(diffieHellman({ privateKey: ephKey, publicKey: pub(me) }), Buffer.concat([share, me]), 'age-encryption.org/v1/X25519');
  const head = Buffer.from(`age-encryption.org/v1\n-> X25519 ${b64(share)}\n${b64(seal(wrap, Buffer.alloc(12), fileKey))}\n---`);
  const mac = createHmac('sha256', hkdf(fileKey, Buffer.alloc(0), 'header')).update(head).digest();
  const json = Buffer.from(JSON.stringify(env)), len = Buffer.alloc(4);
  len.writeUInt32BE(json.length);
  const plain = Buffer.concat([len, json, data]);
  const key = hkdf(fileKey, nonce, 'payload');
  const chunks = Math.max(1, Math.ceil(plain.length / CHUNK)), parts = [head, Buffer.from(` ${b64(mac)}\n`), nonce];
  for (let n = 0; n < chunks; n++) parts.push(seal(key, iv(n, n === chunks - 1), plain.subarray(n * CHUNK, (n + 1) * CHUNK)));
  return { ciphertext: Buffer.concat(parts), key: 'AGE1' + bech32Encode('age-secret-key-', id).toUpperCase().slice('AGE-SECRET-KEY-1'.length) };
}

export function decrypt(file, linkKey) {
  file = Buffer.from(file.buffer, file.byteOffset, file.length);
  const k = linkKey.trim().toUpperCase();
  const { hrp, bytes: id } = bech32Decode(k.startsWith('AGE-SECRET-KEY-1') ? k : 'AGE-SECRET-KEY-1' + k.replace(/^AGE1/, ''));
  if (hrp !== 'age-secret-key-' || id.length !== 32) throw new Error('invalid key');
  const idKey = priv(id), me = pubOf(idKey);
  const end = file.subarray(0, 65536).indexOf('\n---');
  if (end < 0) throw new Error('not an age file');
  const nl = file.indexOf(10, end + 1);
  if (file[end + 4] !== 32 || nl < 0 || file.length < nl + 17 + 16) throw new Error('truncated');
  const lines = file.subarray(0, end + 1).toString().split('\n');
  if (lines[0] !== 'age-encryption.org/v1') throw new Error('not an age file');
  let fileKey = null;
  for (let i = 1; i < lines.length && !fileKey; i++) {
    const args = lines[i].startsWith('-> ') ? lines[i].slice(3).split(' ') : null;
    if (!args) continue;
    let body = '';
    while (++i < lines.length) { body += lines[i]; if (lines[i].length < 64) break; }
    if (args[0] !== 'X25519' || args.length !== 2) continue;
    const share = unb64(args[1]);
    if (share.length !== 32) continue;
    const wrap = hkdf(diffieHellman({ privateKey: idKey, publicKey: pub(share) }), Buffer.concat([share, me]), 'age-encryption.org/v1/X25519');
    try { fileKey = open(wrap, Buffer.alloc(12), unb64(body)); } catch { /* not ours */ }
  }
  if (!fileKey) throw new Error('no identity matched');
  const mac = createHmac('sha256', hkdf(fileKey, Buffer.alloc(0), 'header')).update(file.subarray(0, end + 4)).digest();
  const got = unb64(file.subarray(end + 5, nl).toString());
  if (got.length !== 32 || !timingSafeEqual(mac, got)) throw new Error('invalid header');
  const key = hkdf(fileKey, file.subarray(nl + 1, nl + 17), 'payload');
  const out = [];
  for (let at = nl + 17, n = 0; at < file.length; n++) {
    const chunk = file.subarray(at, at + CHUNK + 16);
    at += chunk.length;
    // An empty chunk is only valid as the whole payload (age spec); never as a trailer.
    if (chunk.length < 16 || (chunk.length === 16 && n > 0)) throw new Error('truncated');
    out.push(open(key, iv(n, at >= file.length), chunk));
  }
  const plain = Buffer.concat(out), h = plain.readUInt32BE(0);
  return { env: JSON.parse(plain.subarray(4, 4 + h).toString()), data: plain.subarray(4 + h) };
}

// Passwords on top of keys (feedback 0114, docs/encryption.md): key.age is an age file sealed to
// one scrypt (passphrase) recipient, holding the pub's age identity. Same as agelite's wrapKey.
export const WRAP_LOGN = 17;
const WRAP_LOGN_MAX = 20;
const scryptKey = (password, salt, logN) => new Promise((ok, no) => scrypt(Buffer.from(password), Buffer.concat([Buffer.from('age-encryption.org/v1/scrypt'), salt]), 32, { N: 2 ** logN, r: 8, p: 1, maxmem: 2 ** 31 }, (e, k) => (e ? no(e) : ok(k))));

/** key.age: the link key (AGE1…) sealed under a password. */
export async function wrapKey(linkKey, password, logN = WRAP_LOGN) {
  if (!password) throw new Error('empty password');
  const k = linkKey.trim().toUpperCase();
  const identity = k.startsWith('AGE-SECRET-KEY-1') ? k : 'AGE-SECRET-KEY-1' + k.replace(/^AGE1/, '');
  if (bech32Decode(identity).bytes.length !== 32) throw new Error('invalid key');
  const salt = randomBytes(16), fileKey = randomBytes(16), nonce = randomBytes(16);
  const wrap = await scryptKey(password, salt, logN);
  const head = Buffer.from(`age-encryption.org/v1\n-> scrypt ${b64(salt)} ${logN}\n${b64(seal(wrap, Buffer.alloc(12), fileKey))}\n---`);
  const mac = createHmac('sha256', hkdf(fileKey, Buffer.alloc(0), 'header')).update(head).digest();
  return Buffer.concat([head, Buffer.from(` ${b64(mac)}\n`), nonce, seal(hkdf(fileKey, nonce, 'payload'), iv(0, true), Buffer.from(identity + '\n'))]);
}

/** The link key (AGE1…) inside key.age; a wrong password throws Error('wrong password'). */
export async function unwrapKey(file, password) {
  file = Buffer.from(file.buffer, file.byteOffset, file.length);
  const end = file.subarray(0, 65536).indexOf('\n---');
  if (end < 0) throw new Error('not an age file');
  const nl = file.indexOf(10, end + 1);
  if (file[end + 4] !== 32 || nl < 0 || file.length < nl + 17 + 16) throw new Error('truncated');
  const lines = file.subarray(0, end + 1).toString().split('\n');
  const args = lines[1]?.startsWith('-> ') ? lines[1].slice(3).split(' ') : [];
  // age: an scrypt stanza is the only one, and its body (43 characters) ends the header.
  if (lines[0] !== 'age-encryption.org/v1' || lines.length !== 4 || args[0] !== 'scrypt' || args.length !== 3 || !/^[1-9][0-9]?$/.test(args[2])) throw new Error('not a password key file');
  const salt = unb64(args[1]), logN = Number(args[2]);
  if (salt.length !== 16) throw new Error('not a password key file');
  if (logN > WRAP_LOGN_MAX) throw new Error('scrypt work factor is too high');
  let fileKey;
  try { fileKey = open(await scryptKey(password, salt, logN), Buffer.alloc(12), unb64(lines[2])); } catch { throw new Error('wrong password'); }
  const mac = createHmac('sha256', hkdf(fileKey, Buffer.alloc(0), 'header')).update(file.subarray(0, end + 4)).digest();
  const got = unb64(file.subarray(end + 5, nl).toString());
  if (got.length !== 32 || !timingSafeEqual(mac, got)) throw new Error('invalid header');
  const identity = open(hkdf(fileKey, file.subarray(nl + 1, nl + 17), 'payload'), iv(0, true), file.subarray(nl + 17)).toString().trim().toUpperCase();
  if (!/^AGE-SECRET-KEY-1[0-9A-Z]{58}$/.test(identity)) throw new Error('not a password key file');
  return 'AGE1' + identity.slice('AGE-SECRET-KEY-1'.length);
}
