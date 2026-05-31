// 程序化生成番茄剪影 PNG(纯黑 + 透明 alpha),用作 macOS 状态栏 template 图标。
// 仅依赖 Node 内置 zlib,无第三方库。运行:node scripts/gen-tray-icon.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// —— CRC32(PNG chunk 校验所需)——
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// —— 判断像素是否落在番茄轮廓内(在 32 单位坐标系里描述形状)——
function inTomato(nx, ny) {
  // 主体:略扁的椭圆果身
  const body = Math.pow((nx - 16) / 12.6, 2) + Math.pow((ny - 20) / 10.4, 2) <= 1;
  // 顶部萼片:5 片放射尖瓣,正上方居中一片,左右对称
  const dx = nx - 16, dy = ny - 11;
  const theta = Math.atan2(dy, dx);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const f = (Math.cos(5 * (theta + Math.PI / 2)) + 1) / 2; // 峰值落在正上方,每 72° 一片
  const petal = 2.0 + 5.4 * Math.pow(f, 1.5);
  const leaves = dist <= petal;
  return body || leaves;
}

// 点到线段距离
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 待办图标:圆角方框 + 勾
function inTodo(nx, ny) {
  const x0 = 4.5, y0 = 4.5, x1 = 27.5, y1 = 27.5, sw = 2.4;
  const inRect = (a, b, ax, ay, bx, by) => a >= ax && a <= bx && b >= ay && b <= by;
  const frame = inRect(nx, ny, x0, y0, x1, y1) && !inRect(nx, ny, x0 + sw, y0 + sw, x1 - sw, y1 - sw);
  const check = segDist(nx, ny, 10, 16.5, 14.5, 21) < 1.4 ||
                segDist(nx, ny, 14.5, 21, 22.5, 11) < 1.4;
  return frame || check;
}

function makePng(size, shapeFn) {
  const S = 32; // 形状坐标系
  const stride = size * 4 + 1; // 每行多 1 字节 filter
  const raw = Buffer.alloc(size * stride, 0);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      // 4x 超采样抗锯齿
      let hit = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const nx = ((x + (sx + 0.5) / 2) / size) * S;
        const ny = ((y + (sy + 0.5) / 2) / size) * S;
        if (shapeFn(nx, ny)) hit++;
      }
      const a = Math.round((hit / 4) * 255);
      const off = y * stride + 1 + x * 4;
      raw[off] = 0; raw[off + 1] = 0; raw[off + 2] = 0; raw[off + 3] = a; // 黑色,alpha 决定形状
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
// 番茄图标(计时)
fs.writeFileSync(path.join(outDir, 'trayTemplate.png'), makePng(16, inTomato));
fs.writeFileSync(path.join(outDir, 'trayTemplate@2x.png'), makePng(32, inTomato));
// 待办图标(ToDo)
fs.writeFileSync(path.join(outDir, 'todoTemplate.png'), makePng(16, inTodo));
fs.writeFileSync(path.join(outDir, 'todoTemplate@2x.png'), makePng(32, inTodo));
// 预览
fs.writeFileSync(path.join(__dirname, 'preview-tomato.png'), makePng(256, inTomato));
fs.writeFileSync(path.join(__dirname, 'preview-todo.png'), makePng(256, inTodo));
console.log('已生成 trayTemplate / todoTemplate (16 + @2x) 及预览图');
