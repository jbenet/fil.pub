// What a nameless upload is, from its bytes (feedback 0135): stdin to `fp put`, and a plain body
// POSTed with no ?filename=. Best effort: a known magic number, JSON that parses, or text that
// reads as Markdown gets that extension; anything else gets none, and is typed by its contents
// (text/plain when it's UTF-8) like LICENSE or a Makefile. HTML and SVG are never guessed: a pub
// would run them as a page.

const has = (b, at, s) => b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const MAGIC = [
  [(b) => b[0] === 0x89 && has(b, 1, 'PNG\r\n\x1a\n'), 'png'],
  [(b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'jpg'],
  [(b) => has(b, 0, 'GIF87a') || has(b, 0, 'GIF89a'), 'gif'],
  [(b) => has(b, 0, 'RIFF') && has(b, 8, 'WEBP'), 'webp'],
  [(b) => has(b, 0, 'RIFF') && has(b, 8, 'WAVE'), 'wav'],
  [(b) => has(b, 0, '%PDF-'), 'pdf'],
  // An EPUB is a zip whose first entry is "mimetype", stored, holding application/epub+zip.
  [(b) => has(b, 0, 'PK\x03\x04') && has(b, 30, 'mimetypeapplication/epub+zip'), 'epub'],
  [(b) => has(b, 0, 'PK\x03\x04') || has(b, 0, 'PK\x05\x06'), 'zip'],
  [(b) => b[0] === 0x1f && b[1] === 0x8b, 'gz'],
  [(b) => has(b, 4, 'ftypavif'), 'avif'],
  [(b) => has(b, 4, 'ftypheic') || has(b, 4, 'ftypheix') || has(b, 4, 'ftypmif1'), 'heic'],
  [(b) => has(b, 4, 'ftypqt'), 'mov'],
  [(b) => has(b, 4, 'ftyp'), 'mp4'],
  [(b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3, 'webm'],
  [(b) => has(b, 0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && b[1] !== 0xff), 'mp3'],
  [(b) => has(b, 0, 'OggS'), 'ogg'],
  [(b) => has(b, 0, 'fLaC'), 'flac'],
];

// Lines that mark source code, whose `# comments` would otherwise read as Markdown headings.
const CODE = /^(#!|#include\b|import\s|from\s+\S+\s+import\b|def\s|class\s|function\s|const\s|let\s|var\s|package\s|use\s|fn\s|func\s|set\s+-|export\s+[A-Z_]+=)/m;

/** Whether text reads as Markdown: a fenced block, a link, a table or a heading on the first line
 *  count 2 (a table 3); other headings, a list item, a quote, bold and a line of prose 1 each (headings at
 *  most 2), and it takes 3. So `# Notes` over a paragraph or a list is Markdown, and `# comment`
 *  over `key=value` isn't. */
export function looksLikeMarkdown(full) {
  const text = full.slice(0, 64 << 10);
  if (CODE.test(text)) return false;
  const lines = text.split('\n', 400);
  let n = 0;
  if (/^\s*#{1,6} \S/.test(text)) n += 1;
  if (lines.some((l) => !/^\s*[#>|-]|[=;{}<>]/.test(l) && (l.match(/\p{L}+/gu) || []).length >= 8)) n += 1;
  if (/^```/m.test(text)) n += 2;
  if (/\[[^\]\n]+\]\((https?:\/\/|\/|#|\.)[^)\s]*\)/.test(text)) n += 2;
  if (/^\s*\|?\s*:?-{3,}:?\s*\|/m.test(text)) n += 3;
  n += Math.min(2, lines.filter((l) => /^#{1,6} \S/.test(l)).length);
  if (/^\s{0,3}([-*+]|\d+\.) \S/m.test(text)) n += 1;
  if (/^> /m.test(text)) n += 1;
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__/.test(text)) n += 1;
  return n >= 3;
}

/** The extension the bytes look like (no dot), or '' when nothing fits. */
export function detectExt(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const [test, ext] of MAGIC) if (test(b)) return ext;
  const head = b.subarray(0, 8192);
  if (head.includes(0)) return '';
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(b.length > 4 << 20 ? head : b, { stream: b.length > 4 << 20 }); } catch { return ''; }
  const t = text.trim();
  if (/^[[{]/.test(t) && b.length <= 4 << 20) { try { JSON.parse(t); return 'json'; } catch { /* not JSON */ } }
  return looksLikeMarkdown(text) ? 'md' : '';
}

/** A nameless upload's file name: paste.<ext> as detected, or plain `paste` (no .txt: 0135). */
export const pasteName = (bytes, detect = true) => {
  const ext = detect ? detectExt(bytes) : '';
  return ext ? `paste.${ext}` : 'paste';
};
