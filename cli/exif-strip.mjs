// Generated from web/src/lib/exif-strip.ts by scripts/cli-exif.mjs. Don't edit.
const ascii = (d, at, n) => String.fromCharCode(...d.subarray(at, Math.min(d.length, at + n)));
const u16 = (d, p) => d[p] << 8 | d[p + 1];
const u32 = (d, p) => (d[p] << 24 >>> 0) + (d[p + 1] << 16) + (d[p + 2] << 8) + d[p + 3];
const u32le = (d, p) => (d[p + 3] << 24 >>> 0) + (d[p + 2] << 16) + (d[p + 1] << 8) + d[p];
function imageFormat(d) {
  if (d.length >= 3 && d[0] === 255 && d[1] === 216 && d[2] === 255) return "jpeg";
  if (d.length >= 8 && u32(d, 0) === 2303741511 && u32(d, 4) === 218765834) return "png";
  if (d.length >= 12 && ascii(d, 0, 4) === "RIFF" && ascii(d, 8, 4) === "WEBP") return "webp";
  if (d.length >= 12 && ascii(d, 4, 4) === "ftyp" && /^(hei[cxms]|hev[cxms]|mif1|msf1|avif|avis)$/.test(ascii(d, 8, 4))) return "heif";
  if (d.length >= 8 && (d[0] === 73 && d[1] === 73 && d[2] === 42 && d[3] === 0 || d[0] === 77 && d[1] === 77 && d[2] === 0 && d[3] === 42)) return "tiff";
  if (d.length >= 13 && /^GIF8[79]a$/.test(ascii(d, 0, 6))) return "gif";
  return null;
}
function readTiff(t) {
  const r = { orientation: 0, gps: false, other: false };
  if (t.length < 8) return r;
  const le = t[0] === 73;
  if (!le && t[0] !== 77) return r;
  const g16 = (p) => le ? t[p] | t[p + 1] << 8 : u16(t, p);
  const g32 = (p) => le ? u32le(t, p) : u32(t, p);
  const ifd = g32(4);
  if (ifd + 2 > t.length) {
    r.other = true;
    return r;
  }
  const n = g16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > t.length) {
      r.other = true;
      break;
    }
    const tag = g16(e);
    if (tag === 274) r.orientation = g16(e + 8);
    else {
      r.other = true;
      if (tag === 34853) {
        const g = g32(e + 8);
        r.gps = g + 2 > t.length || g16(g) > 0;
      }
    }
  }
  if (g32(ifd + 2 + n * 12) !== 0) r.other = true;
  return r;
}
function minimalTiff(o) {
  const t = new Uint8Array(26);
  t.set([73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, o & 255, o >> 8]);
  return t;
}
const EXIF_ID = [69, 120, 105, 102, 0, 0];
const xmpGps = (d) => /GPS(Latitude|Longitude|Position|Altitude)|LocationShown|LocationCreated/.test(new TextDecoder().decode(d));
const keep = (orientation) => orientation > 1 && orientation <= 8;
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function jpegSegs(d) {
  const segs = [];
  let p = 2;
  while (p + 4 <= d.length && d[p] === 255) {
    const mk = d[p + 1];
    if (mk === 255) {
      p++;
      continue;
    }
    if (mk === 216 || mk === 1 || mk >= 208 && mk <= 215) {
      p += 2;
      continue;
    }
    if (mk === 218 || mk === 217) break;
    const end = p + 2 + u16(d, p + 2);
    segs.push({ at: p, end: Math.min(end, d.length), marker: mk });
    p = end;
  }
  return { segs, body: p };
}
function jpegKind(d, s) {
  if (s.marker === 225) {
    if (EXIF_ID.every((v, i) => d[s.at + 4 + i] === v)) return "exif";
    if (ascii(d, s.at + 4, 20).startsWith("http://ns.adobe.com/")) return "xmp";
  }
  if (s.marker === 237) return "iptc";
  if (s.marker === 254) return "comment";
  if (s.marker === 226 && ascii(d, s.at + 4, 11) === "ICC_PROFILE") return "icc";
  return null;
}
function jpegApp1(o) {
  const t = minimalTiff(o), seg = new Uint8Array(4 + 6 + t.length);
  seg.set([255, 225, seg.length - 2 >> 8, seg.length - 2 & 255, ...EXIF_ID]);
  seg.set(t, 10);
  return seg;
}
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  return c;
});
function crc32(d) {
  let c = 4294967295;
  for (const b of d) c = CRC[(c ^ b) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function pngChunk(type, data) {
  const c = new Uint8Array(12 + data.length), v = new DataView(c.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i);
  c.set(data, 8);
  v.setUint32(8 + data.length, crc32(c.subarray(4, 8 + data.length)));
  return c;
}
const PNG_TEXT = /* @__PURE__ */ new Set(["tEXt", "zTXt", "iTXt"]);
function webpChunks(d) {
  const out = [];
  for (let p = 12; p + 8 <= d.length; ) {
    const len = u32le(d, p + 4), end = p + 8 + len + (len & 1);
    out.push({ at: p, end: Math.min(end, d.length), type: ascii(d, p, 4), data: d.subarray(p + 8, Math.min(p + 8 + len, d.length)) });
    p = end;
  }
  return out;
}
const tiffOf = (exif) => EXIF_ID.every((v, i) => exif[i] === v) ? exif.subarray(6) : exif;
function webpChunk(type, data) {
  const c = new Uint8Array(8 + data.length + (data.length & 1)), v = new DataView(c.buffer);
  for (let i = 0; i < 4; i++) c[i] = type.charCodeAt(i);
  v.setUint32(4, data.length, true);
  c.set(data, 8);
  return c;
}
const TIFF_PERSONAL = /* @__PURE__ */ new Set([270, 271, 272, 305, 306, 315, 316, 33432, 700, 33723, 50735, 50708, 40091, 40092, 40093, 40094, 40095]);
const TIFF_SUBIFD = /* @__PURE__ */ new Set([34665, 34853, 40965]);
const TIFF_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
function tiffScan(t, blank) {
  const r = { gps: false, xmp: null, personal: false };
  const le = t[0] === 73;
  const g16 = (p) => p + 2 <= t.length ? le ? t[p] | t[p + 1] << 8 : u16(t, p) : 0;
  const g32 = (p) => p + 4 <= t.length ? le ? u32le(t, p) : u32(t, p) : 0;
  const nz = (at, n) => t.subarray(at, Math.min(t.length, at + n)).some((x) => x !== 0);
  const value = (e) => {
    const type = g16(e + 2), n = Math.min(g32(e + 4) * (TIFF_SIZE[type] || 1), t.length);
    return n <= 4 ? [e + 8, n] : [g32(e + 8), n];
  };
  const seen = /* @__PURE__ */ new Set();
  const empty = (at) => {
    if (!at || at + 2 > t.length || seen.has(at)) return;
    seen.add(at);
    const n = g16(at);
    if (n > 0) {
      r.personal = true;
    }
    for (let i = 0; i < n && at + 2 + i * 12 + 12 <= t.length; i++) {
      const e = at + 2 + i * 12;
      if (TIFF_SUBIFD.has(g16(e))) empty(g32(e + 8));
      const [v, len] = value(e);
      if (nz(v, len)) {
        r.personal = true;
        blank?.(v, len);
      }
    }
    if (n > 0) blank?.(at, 2 + n * 12);
  };
  for (let ifd = g32(4), k = 0; ifd && ifd + 2 <= t.length && k < 64 && !seen.has(ifd); ifd = g32(ifd + 2 + g16(ifd) * 12), k++) {
    seen.add(ifd);
    const n = g16(ifd);
    for (let i = 0; i < n && ifd + 2 + i * 12 + 12 <= t.length; i++) {
      const e = ifd + 2 + i * 12, tag = g16(e);
      if (TIFF_SUBIFD.has(tag)) {
        const sub = g32(e + 8);
        if (tag === 34853 && sub + 2 <= t.length && g16(sub) > 0) r.gps = true;
        empty(sub);
      } else if (TIFF_PERSONAL.has(tag)) {
        const [v, len] = value(e);
        if (tag === 700 && len) r.xmp = t.subarray(v, Math.min(t.length, v + len));
        if (nz(v, len)) {
          r.personal = true;
          blank?.(v, len);
        }
      }
    }
  }
  if (r.xmp && xmpGps(r.xmp)) r.gps = true;
  return r;
}
function gifBlocks(d) {
  const subs = (p2) => {
    while (p2 < d.length && d[p2] !== 0) p2 += d[p2] + 1;
    return p2 < d.length ? p2 + 1 : -1;
  };
  let p = 13 + (d[10] & 128 ? 3 << (d[10] & 7) + 1 : 0);
  const head = p, blocks = [];
  while (p < d.length) {
    const b = d[p];
    if (b === 59) {
      blocks.push({ at: p, end: d.length, drop: false, kind: null, data: null });
      return { head, blocks };
    }
    if (b === 44) {
      let q = p + 10 + (d[p + 9] & 128 ? 3 << (d[p + 9] & 7) + 1 : 0) + 1;
      if (q > d.length) return null;
      q = subs(q);
      if (q < 0) return null;
      blocks.push({ at: p, end: q, drop: false, kind: null, data: null });
      p = q;
    } else if (b === 33 && p + 2 <= d.length) {
      const label = d[p + 1], q = subs(p + 2);
      if (q < 0) return null;
      const id = label === 255 && d[p + 2] === 11 ? ascii(d, p + 3, 11) : "";
      const keepApp = /^(NETSCAPE2\.0|ANIMEXTS1\.0|ICCRGBG1012)$/.test(id);
      const drop = label === 254 || label === 255 && !keepApp;
      blocks.push({ at: p, end: q, drop, kind: label === 254 ? "Comment" : drop ? "XMP" : null, data: drop ? d.subarray(p, q) : null });
      p = q;
    } else return null;
  }
  return null;
}
function boxes(d, from, to) {
  const out = [];
  for (let p = from; p + 8 <= to; ) {
    let size = u32(d, p), body = p + 8;
    if (size === 1) {
      if (p + 16 > to) break;
      size = u32(d, p + 8) * 2 ** 32 + u32(d, p + 12);
      body = p + 16;
    } else if (size === 0) size = to - p;
    if (size < 8) break;
    out.push({ type: ascii(d, p + 4, 4), at: p, body, end: Math.min(p + size, to) });
    p += size;
  }
  return out;
}
function heifItems(d) {
  const meta = boxes(d, 0, d.length).find((b) => b.type === "meta");
  if (!meta) return [];
  const kids = boxes(d, meta.body + 4, meta.end);
  const items = /* @__PURE__ */ new Map();
  const iinf = kids.find((b) => b.type === "iinf");
  if (iinf) {
    const v = d[iinf.body];
    for (const e of boxes(d, iinf.body + 4 + (v === 0 ? 2 : 4), iinf.end)) {
      if (e.type !== "infe") continue;
      const ev = d[e.body];
      if (ev < 2) continue;
      const p = e.body + 4, id = ev === 2 ? u16(d, p) : u32(d, p), q = p + (ev === 2 ? 2 : 4) + 2, type = ascii(d, q, 4);
      const it = { id, type, extents: [] };
      if (type === "mime") {
        let s = q + 4;
        while (s < e.end && d[s]) s++;
        s++;
        let t = s;
        while (t < e.end && d[t]) t++;
        it.mime = ascii(d, s, t - s);
      }
      items.set(id, it);
    }
  }
  const idat = kids.find((b) => b.type === "idat");
  const iloc = kids.find((b) => b.type === "iloc");
  if (iloc) {
    const v = d[iloc.body];
    let p = iloc.body + 4;
    const os = d[p] >> 4, ls = d[p] & 15, bs = d[p + 1] >> 4, is = v === 1 || v === 2 ? d[p + 1] & 15 : 0;
    p += 2;
    const num = (n) => {
      let x = 0;
      for (let i = 0; i < n; i++) x = x * 256 + d[p + i];
      p += n;
      return x;
    };
    const count = v < 2 ? num(2) : num(4);
    for (let i = 0; i < count && p < iloc.end; i++) {
      const id = v < 2 ? num(2) : num(4);
      const method = v === 1 || v === 2 ? num(2) & 15 : 0;
      num(2);
      const base = num(bs), n = num(2);
      const it = items.get(id);
      if (is + os + ls === 0) continue;
      for (let j = 0; j < n && p < iloc.end; j++) {
        if (is) num(is);
        const off = num(os), len = num(ls);
        const start = method === 1 ? idat ? idat.body + base + off : -1 : method === 0 ? base + off : -1;
        if (it && start >= 0 && len > 0 && (it.size ?? 0) + len <= d.length) {
          it.extents.push([start, len]);
          it.size = (it.size ?? 0) + len;
        }
      }
    }
  }
  return [...items.values()];
}
const isXmp = (it) => it.type === "mime" && /rdf\+xml|xmp/i.test(it.mime || "");
const itemBytes = (d, it) => concat(it.extents.map(([s, l]) => d.subarray(s, Math.min(s + l, d.length))));
function inspectImage(d) {
  const format = imageFormat(d);
  if (!format) return null;
  const m = { format, gps: false, removable: [], kept: [] };
  const add = (l, w) => {
    if (!l.includes(w)) l.push(w);
  };
  const exif = (t) => {
    const r = readTiff(t);
    if (r.gps) m.gps = true;
    if (keep(r.orientation)) add(m.kept, "Orientation");
    if (r.other) add(m.removable, "EXIF");
  };
  const xmp = (x) => {
    add(m.removable, "XMP");
    if (xmpGps(x)) m.gps = true;
  };
  if (format === "jpeg") {
    for (const s of jpegSegs(d).segs) {
      const k = jpegKind(d, s);
      if (k === "exif") exif(d.subarray(s.at + 10, s.end));
      else if (k === "xmp") xmp(d.subarray(s.at + 4, s.end));
      else if (k === "iptc") add(m.removable, "IPTC");
      else if (k === "comment") add(m.removable, "Comment");
      else if (k === "icc") add(m.kept, "Color profile");
    }
  } else if (format === "png") {
    for (let p = 8; p + 8 <= d.length; ) {
      const len = u32(d, p), type = ascii(d, p + 4, 4), data = d.subarray(p + 8, Math.min(p + 8 + len, d.length));
      if (type === "eXIf") exif(data);
      else if (PNG_TEXT.has(type)) {
        if (/XML:com\.adobe\.xmp/.test(ascii(data, 0, 20))) xmp(data);
        else add(m.removable, "Text");
      } else if (type === "iCCP") add(m.kept, "Color profile");
      if (type === "IEND") break;
      p += 12 + len;
    }
  } else if (format === "webp") {
    for (const c of webpChunks(d)) {
      if (c.type === "EXIF") exif(tiffOf(c.data));
      else if (c.type === "XMP ") xmp(c.data);
      else if (c.type === "ICCP") add(m.kept, "Color profile");
    }
  } else if (format === "tiff") {
    const r = tiffScan(d, null), o = readTiff(d).orientation;
    if (r.gps) m.gps = true;
    if (r.personal) add(m.removable, "EXIF");
    if (r.xmp && r.xmp.some((x) => x !== 0)) add(m.removable, "XMP");
    if (keep(o)) add(m.kept, "Orientation");
  } else if (format === "gif") {
    for (const b of gifBlocks(d)?.blocks ?? []) {
      if (b.kind === "Comment") add(m.removable, "Comment");
      else if (b.kind === "XMP") xmp(b.data);
    }
  } else {
    for (const it of heifItems(d)) {
      if (it.type === "Exif") {
        const b = itemBytes(d, it);
        if (b.length >= 4) {
          const r = readTiff(b.subarray(4 + u32(b, 0)));
          if (r.gps) m.gps = true;
          if (r.other) add(m.removable, "EXIF");
          if (keep(r.orientation)) add(m.kept, "Orientation");
        }
      } else if (isXmp(it)) {
        const b = itemBytes(d, it);
        if (b.some((x) => x !== 32 && x !== 0)) xmp(b);
      }
    }
  }
  return m;
}
function stripImage(d) {
  const format = imageFormat(d);
  if (format === "jpeg") {
    const { segs } = jpegSegs(d);
    const parts = [d.subarray(0, 2)];
    let changed = false, last = 2;
    for (const s of segs) {
      if (s.at > last) parts.push(d.subarray(last, s.at));
      last = s.end;
      const k = jpegKind(d, s), seg = d.subarray(s.at, s.end);
      if (k === "exif") {
        const o = readTiff(d.subarray(s.at + 10, s.end)).orientation;
        const mini = keep(o) ? jpegApp1(o) : null;
        if (mini && same(mini, seg)) parts.push(seg);
        else {
          changed = true;
          if (mini) parts.push(mini);
        }
      } else if (k === "xmp" || k === "iptc" || k === "comment") changed = true;
      else parts.push(seg);
    }
    if (!changed) return d;
    parts.push(d.subarray(last));
    return concat(parts);
  }
  if (format === "png") {
    const parts = [d.subarray(0, 8)];
    let changed = false, p = 8;
    for (; p + 8 <= d.length; ) {
      const len = u32(d, p), type = ascii(d, p + 4, 4), end = Math.min(p + 12 + len, d.length), data = d.subarray(p + 8, Math.min(p + 8 + len, d.length));
      if (type === "eXIf") {
        const o = readTiff(data).orientation, mini = keep(o) ? pngChunk("eXIf", minimalTiff(o)) : null;
        if (mini && same(mini, d.subarray(p, end))) parts.push(d.subarray(p, end));
        else {
          changed = true;
          if (mini) parts.push(mini);
        }
      } else if (PNG_TEXT.has(type)) changed = true;
      else parts.push(d.subarray(p, end));
      p = end;
      if (type === "IEND") break;
    }
    if (!changed) return d;
    if (p < d.length) parts.push(d.subarray(p));
    return concat(parts);
  }
  if (format === "webp") {
    const parts = [];
    let changed = false, exifKept = false, vp8x = null;
    for (const c of webpChunks(d)) {
      const raw = d.subarray(c.at, c.end);
      if (c.type === "EXIF") {
        const o = readTiff(tiffOf(c.data)).orientation, mini = keep(o) ? webpChunk("EXIF", minimalTiff(o)) : null;
        if (mini) exifKept = true;
        if (mini && same(mini, raw)) parts.push(raw);
        else {
          changed = true;
          if (mini) parts.push(mini);
        }
      } else if (c.type === "XMP ") changed = true;
      else if (c.type === "VP8X") {
        vp8x = raw.slice();
        parts.push(vp8x);
      } else parts.push(raw);
    }
    if (!changed) return d;
    if (vp8x) vp8x[8] = vp8x[8] & ~12 | (exifKept ? 8 : 0);
    const body = concat(parts), out = new Uint8Array(12 + body.length);
    out.set(d.subarray(0, 12));
    new DataView(out.buffer).setUint32(4, 4 + body.length, true);
    out.set(body, 12);
    return out;
  }
  if (format === "tiff") {
    let out = null;
    tiffScan(d, (at, n) => {
      (out ??= d.slice()).fill(0, at, Math.min(d.length, at + n));
    });
    return out ?? d;
  }
  if (format === "gif") {
    const g = gifBlocks(d);
    if (!g || !g.blocks.some((b) => b.drop)) return d;
    return concat([d.subarray(0, g.head), ...g.blocks.filter((b) => !b.drop).map((b) => d.subarray(b.at, b.end))]);
  }
  if (format === "heif") {
    let out = null;
    const w = () => out ??= d.slice();
    for (const it of heifItems(d)) {
      if (it.type === "Exif") {
        const b = itemBytes(d, it);
        if (b.length < 4) continue;
        const pre = 4 + u32(b, 0), r = readTiff(b.subarray(pre));
        const want = new Uint8Array(b.length);
        want.set(b.subarray(0, Math.min(pre, b.length)));
        if (keep(r.orientation) && pre + 26 <= b.length) want.set(minimalTiff(r.orientation), pre);
        if (same(want, b)) continue;
        let o = 0;
        for (const [s, l] of it.extents) {
          w().set(want.subarray(o, o + l), s);
          o += l;
        }
      } else if (isXmp(it)) {
        for (const [s, l] of it.extents) if (d.subarray(s, s + l).some((x) => x !== 32)) w().fill(32, s, s + l);
      }
    }
    return out ?? d;
  }
  return d;
}
const IMAGE_EXT = /\.(jpe?g|png|webp|hei[cf]|avif|tiff?|dng|gif)$/i;
const isImagePath = (f, path = f.name) => f.type.startsWith("image/") || IMAGE_EXT.test(path);
async function stripFile(f, path = f.name) {
  if (!isImagePath(f, path)) return f;
  const d = new Uint8Array(await f.arrayBuffer());
  const s = stripImage(d);
  return s === d ? f : new File([s], f.name, { type: f.type, lastModified: f.lastModified });
}
export {
  imageFormat,
  inspectImage,
  isImagePath,
  stripFile,
  stripImage
};
