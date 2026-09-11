// 生成像素风胡萝卜图标（与游戏内 carrot 调色板一致）
// 输出：
//   assets/carrot.ico        多尺寸图标：16/32/48/64(BMP) + 128/256(PNG)
//   assets/carrot-preview.png 放大预览图（128x128）
//   public/favicon.png        网页图标（32x32）
// 用法：node tools/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 与 sp-game.js / mp-game.js 中 carrot 一致的调色板
const PALETTE = {
  '.': null,
  L: [0x2F, 0x7D, 0x32, 255], // 深绿叶
  l: [0x66, 0xBB, 0x6A, 255], // 浅绿叶
  O: [0xFF, 0x6B, 0x35, 255], // 胡萝卜橙
  o: [0xD9, 0x54, 0x1F, 255], // 暗部橙
  h: [0xFF, 0xA0, 0x5C, 255], // 高光橙
};

// ---- 16x16 像素图（透明背景，光源在左上） ----
const ART = [
  '.....l.l.l......',
  '.....LlLlL......',
  '.....lLLLl......',
  '......LlL.......',
];
// 身体 12 行，从上到下由 9 像素收窄到 1 像素
const BODY_WIDTHS = [9, 9, 9, 8, 7, 6, 6, 5, 4, 3, 2, 1];
for (const w of BODY_WIDTHS) {
  const left = 3 + Math.round((9 - w) / 2);
  const right = left + w - 1;
  const row = new Array(16).fill('.');
  for (let x = left; x <= right; x++) {
    if (w === 1 || x === right) row[x] = 'o';                    // 右缘暗部
    else if (x === left || (x === left + 1 && w >= 7)) row[x] = 'h'; // 左侧高光
    else row[x] = 'O';
  }
  ART.push(row.join(''));
}

// 校验像素图
ART.forEach((row, y) => {
  if (row.length !== 16) throw new Error(`ART 第 ${y} 行宽度是 ${row.length}，应为 16`);
});

// ---- 渲染：最近邻放大到目标尺寸 ----
function render(size) {
  const scale = size / 16;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = ART[Math.floor(y / scale)][Math.floor(x / scale)];
      const col = PALETTE[ch];
      if (!col) continue;
      const i = (y * size + x) * 4;
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = col[3];
    }
  }
  return rgba;
}

// ---- PNG 编码（无依赖，zlib + CRC32） ----
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- ICO 编码：BMP（小尺寸，兼容性最好）+ PNG（大尺寸，体积小） ----
function encodeBmpIcon(rgba, w, h) {
  const maskRowBytes = Math.ceil(w / 32) * 4;
  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0);
  bih.writeInt32LE(w, 4);
  bih.writeInt32LE(h * 2, 8); // XOR + AND 两张位图高度之和
  bih.writeUInt16LE(1, 12);
  bih.writeUInt16LE(32, 14);
  bih.writeUInt32LE(0, 16); // BI_RGB
  bih.writeUInt32LE(w * h * 4 + maskRowBytes * h, 20);

  const xor = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y; // BMP 自下而上存储
    for (let x = 0; x < w; x++) {
      const si = (srcY * w + x) * 4;
      const di = (y * w + x) * 4;
      xor[di] = rgba[si + 2];     // B
      xor[di + 1] = rgba[si + 1]; // G
      xor[di + 2] = rgba[si];     // R
      xor[di + 3] = rgba[si + 3]; // A
    }
  }

  const mask = Buffer.alloc(maskRowBytes * h);
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y;
    for (let x = 0; x < w; x++) {
      if (rgba[(srcY * w + x) * 4 + 3] < 128) mask[y * maskRowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([bih, xor, mask]);
}

function encodeICO(entries) {
  const count = entries.length;
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(count, 4);

  const blobs = entries.map((e) => (e.png ? encodePNG(e.rgba, e.w, e.h) : encodeBmpIcon(e.rgba, e.w, e.h)));
  const dirEntries = [];
  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const e = entries[i];
    const de = Buffer.alloc(16);
    de.writeUInt8(e.w >= 256 ? 0 : e.w, 0); // 0 表示 256
    de.writeUInt8(e.h >= 256 ? 0 : e.h, 1);
    de.writeUInt8(0, 2);  // 调色板颜色数
    de.writeUInt8(0, 3);
    de.writeUInt16LE(1, 4);   // planes
    de.writeUInt16LE(32, 6);  // bpp
    de.writeUInt32LE(blobs[i].length, 8);
    de.writeUInt32LE(offset, 12);
    offset += blobs[i].length;
    dirEntries.push(de);
  }
  return Buffer.concat([dir, ...dirEntries, ...blobs]);
}

// ---- 输出 ----
mkdirSync(join(ROOT, 'assets'), { recursive: true });

const icoEntries = [
  { w: 16, h: 16, rgba: render(16) },
  { w: 32, h: 32, rgba: render(32) },
  { w: 48, h: 48, rgba: render(48) },
  { w: 64, h: 64, rgba: render(64) },
  { w: 128, h: 128, rgba: render(128), png: true },
  { w: 256, h: 256, rgba: render(256), png: true },
];
writeFileSync(join(ROOT, 'assets', 'carrot.ico'), encodeICO(icoEntries));
writeFileSync(join(ROOT, 'assets', 'carrot-preview.png'), encodePNG(render(128), 128, 128));
mkdirSync(join(ROOT, 'public'), { recursive: true });
writeFileSync(join(ROOT, 'public', 'favicon.png'), encodePNG(render(32), 32, 32));

console.log('已生成:');
console.log('  assets/carrot.ico         (16/32/48/64 BMP + 128/256 PNG)');
console.log('  assets/carrot-preview.png (128x128 预览)');
console.log('  public/favicon.png        (32x32 网页图标)');
