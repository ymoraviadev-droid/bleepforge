// Native image-dimension probe. Reads just enough bytes to extract
// width/height for the formats the corpus actually uses (PNG dominant,
// SVG present, others rare). No new dep — keeps the server lean for
// future Electron-wrap.
//
// Returns { width, height } or null when the format isn't supported or
// the file is malformed. Callers fall back to "—" in the UI.

import fs from "node:fs/promises";

export interface Dims {
  width: number;
  height: number;
}

export async function readImageDims(absPath: string): Promise<Dims | null> {
  const ext = absPath.slice(absPath.lastIndexOf(".") + 1).toLowerCase();
  try {
    if (ext === "png") return await readPngDims(absPath);
    if (ext === "svg") return await readSvgDims(absPath);
    // jpg/jpeg/webp/gif/bmp not supported by the native reader — would
    // need format-specific parsers. Returning null is the honest answer;
    // the UI handles missing dims gracefully.
    return null;
  } catch {
    return null;
  }
}

// PNG: 8-byte signature, then IHDR chunk. Dims live at bytes 16..23
// (BE uint32 width, BE uint32 height). Read 24 bytes — that's enough
// to validate the signature, the IHDR magic, and read the dims.
async function readPngDims(absPath: string): Promise<Dims | null> {
  const fd = await fs.open(absPath, "r");
  try {
    const buf = Buffer.alloc(24);
    const { bytesRead } = await fd.read(buf, 0, 24, 0);
    if (bytesRead < 24) return null;
    const sig = buf.subarray(0, 8);
    const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!sig.equals(PNG_SIG)) return null;
    const ihdrType = buf.subarray(12, 16).toString("ascii");
    if (ihdrType !== "IHDR") return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } finally {
    await fd.close();
  }
}

// SVG: read first ~2KB and pull width/height (or viewBox) out of the
// root <svg> attributes. SVG is text, so we just regex it. Best-effort —
// if the attributes are missing or use units we don't strip ("100%",
// "10em"), we return null.
async function readSvgDims(absPath: string): Promise<Dims | null> {
  const fd = await fs.open(absPath, "r");
  try {
    const buf = Buffer.alloc(2048);
    const { bytesRead } = await fd.read(buf, 0, 2048, 0);
    const head = buf.subarray(0, bytesRead).toString("utf8");
    const widthAttr = /\bwidth\s*=\s*"([^"]+)"/i.exec(head);
    const heightAttr = /\bheight\s*=\s*"([^"]+)"/i.exec(head);
    const w = parsePxNumber(widthAttr?.[1]);
    const h = parsePxNumber(heightAttr?.[1]);
    if (w !== null && h !== null) return { width: w, height: h };
    // Fall back to viewBox: "minX minY width height"
    const vb = /\bviewBox\s*=\s*"([^"]+)"/i.exec(head);
    if (vb && vb[1]) {
      const parts = vb[1].trim().split(/\s+/);
      if (parts.length === 4) {
        const vw = Number(parts[2]);
        const vh = Number(parts[3]);
        if (Number.isFinite(vw) && Number.isFinite(vh)) {
          return { width: Math.round(vw), height: Math.round(vh) };
        }
      }
    }
    return null;
  } finally {
    await fd.close();
  }
}

function parsePxNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  // Accept plain numbers and "Npx". Anything else (%, em, mm, …) → null.
  const m = /^\s*(\d+(?:\.\d+)?)(px)?\s*$/i.exec(raw);
  if (!m) return null;
  return Math.round(Number(m[1]));
}
