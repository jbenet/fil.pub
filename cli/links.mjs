// What fp shares with the web app, copied here because the CLI runs on plain Node (no TypeScript):
// the name the composer suggests for a file (web/src/lib/suggest.ts) and the public IPFS gateway the
// app links (web/src/lib/gateway.ts). test/cli-put.test.ts checks they still agree.

/** A name or file stem made of a title: lowercase letters, digits and dashes, at most 40 characters. */
export function slugOf(s) {
  if (!s) return '';
  let out = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (out.length > 40) out = out.slice(0, 40).replace(/-[^-]*$/, '') || out.slice(0, 40);
  return out;
}

/** A file's name as a pub name: its stem, slugged (notes.v2.md → notes-v2). */
export const stemSlug = (path) => slugOf(path.split('/').pop().replace(/\.[^.]*$/, ''));

/** The public IPFS gateway: ipfs.io and dweb.link stopped serving pages in Sept 2026 (0113). */
export const PUBLIC_GATEWAY = 'inbrowser.link';
const B32 = /^b[a-z2-7]{20,61}$/;
/** https://<cid>.ipfs.inbrowser.link/ (or https://inbrowser.link/ipfs/<cid>/ for a CID that can't be a DNS label). */
export function gatewayUrl(cid) {
  return B32.test(cid) ? `https://${cid}.ipfs.${PUBLIC_GATEWAY}/` : `https://${PUBLIC_GATEWAY}/ipfs/${cid}/`;
}
