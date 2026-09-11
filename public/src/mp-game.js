// ============================================
// 蔬菜大作战 - 多人联机模式（星露谷风格）
// WASD 移动 / E 交互地块 / F 投掷蔬菜
// 服务端权威模拟，客户端本地预测移动
// ============================================

import { Network } from './network.js';

const CANVAS_W = 640;
const CANVAS_H = 360;
const HUD_H = 28;
const SHOP_Y = 302;

const PLANT_TYPES = {
  carrot:   { id:'carrot',   name:'胡萝卜', cost:10, damage:10, growthTime:3, speed:4, chargeTime:0.5, color:'#FF6B35', leafColor:'#4CAF50' },
  potato:   { id:'potato',   name:'土豆',   cost:20, damage:20, growthTime:5, speed:3, chargeTime:0.9, color:'#8B5E3C', leafColor:'#66BB6A' },
  pepper:   { id:'pepper',   name:'辣椒',   cost:30, damage:15, growthTime:6, speed:3, chargeTime:0.8, color:'#E53935', leafColor:'#2E7D32' },
  corn:     { id:'corn',     name:'玉米',   cost:12, damage:8,  growthTime:4, speed:6, chargeTime:1.0, color:'#FDD835', leafColor:'#388E3C' },
  pumpkin:  { id:'pumpkin',  name:'南瓜',   cost:15, damage:5,  growthTime:7, speed:2, chargeTime:1.3, color:'#F57C00', leafColor:'#1B5E20' },
  garlic:   { id:'garlic',   name:'大蒜',   cost:40, damage:30, growthTime:8, speed:2, chargeTime:1.5, color:'#FAFAFA', leafColor:'#558B2F' },
};
const MAX_POWER = 3;           // 满蓄力时速度倍数
const CHARGE_DECAY_TIME = 1.5; // 松手后从满蓄力衰减到 0 需要的时间（秒）
const PLANT_ORDER = ['carrot','potato','pepper','corn','pumpkin','garlic'];

const FARM_COLS = 5;
const FARM_ROWS = 5;
const CELL = 40;
const PLAYER_HP = 100;
const GAME_DURATION = 180;

const FARMS = { p1: { x: 40, y: 52 }, p2: { x: 360, y: 52 } };
const WALKS = {
  p1: { minX: 24,  maxX: 304, minY: 52, maxY: 288 },
  p2: { minX: 336, maxX: 616, minY: 52, maxY: 288 },
};
const PLAYER_SPEED = 100;
const REACH = 30;
const MOVE_SEND_INTERVAL = 60; // ms

// ===== 蔬菜像素美术 =====
// 字符 → 调色板：L/l 叶（深/浅）、O 主体、o 暗部、h 亮部、S 蒂/秆、k 玉米粒、W 玉米须、T 花、G 蒜苔珠
// 田里三个阶段：0 发芽 / 1 生长 / 2 成熟 —— 都画"长在地里"的样子（叶子在上，根/果贴近土面）
const CROP_ART = {
  carrot: {
    palette: { L:'#2F7D32', l:'#66BB6A', O:'#FF6B35', o:'#D9541F', h:'#FFA05C' },
    stages: [
      ['.........', '.........', '...l.l...', '..lLlLl..', '...lLl...', '....L....', '.........', '.........', '.........'],
      ['.........', '..l.l.l..', '.lLlLlLl.', '.lLlLlLl.', '..lLLLl..', '..lLLl...', '...LL....', '.........', '.........'],
      ['...l.l...', '..lLlLl..', '.lLlLlLl.', '.lLlLlLl.', '..lLlLl..', '..lLLLl..', '..lOOo...', '...oOo...', '.........'],
    ],
  },
  potato: {
    palette: { L:'#388E3C', l:'#66BB6A', O:'#A9764A', o:'#6B4526', h:'#C79A6B', T:'#F4E26B' },
    stages: [
      ['.........', '.........', '....L....', '..lL.Ll..', '...lLl...', '....L....', '.........', '.........', '.........'],
      ['.........', '...L.L...', '..lLlLl..', '...LLL...', '.LlLLlLl.', '.LlLlLlL.', '..lLLLl..', '...LLL...', '.........'],
      ['.........', '...L..L..', '..LlLLl..', '.LlLlLlL.', '.LTLlLTL.', '.LlLLlLl.', '..LLlLL..', '...LLL...', '.........'],
    ],
  },
  pepper: {
    palette: { L:'#388E3C', l:'#66BB6A', O:'#E53935', o:'#B71C1C', h:'#FF6659', S:'#2E7D32' },
    stages: [
      ['.........', '.........', '....L....', '...lLl...', '....L....', '.........', '.........', '.........', '.........'],
      ['.........', '....S....', '...LLL...', '..LLlLL..', '.LLlLLLl.', '.LlLLlLL.', '..LLLLL..', '...LLL...', '.........'],
      ['...L.L...', '..LllLL..', '.LlOLLlL.', '.LOLOLOL.', '.LLOLLOL.', '..LOLOL..', '...OoO...', '...o.o...', '.........'],
    ],
  },
  corn: {
    palette: { L:'#388E3C', l:'#66BB6A', O:'#FDD835', o:'#B08400', h:'#FFF176', k:'#E0A800', W:'#F5F5F5' },
    stages: [
      ['.........', '.........', '....L....', '...lLl...', '....L....', '....L....', '.........', '.........', '.........'],
      ['.........', '....L....', '...lLl...', '..LlLlL..', '.LLLlLLL.', '.LLlLlLL.', '.LLLlLLL.', '..LLLLL..', '.........'],
      ['....W....', '...lWl...', '..LlOkl..', '..LlkOl..', '..LkOlL..', '..LkOlL..', '..LOklL..', '..LLLLL..', '...ooo...'],
    ],
  },
  pumpkin: {
    palette: { L:'#388E3C', l:'#66BB6A', O:'#F57C00', o:'#E65100', h:'#FFB74D', S:'#6D4C41' },
    stages: [
      ['.........', '.........', '....L....', '..lL.L...', '...lLl...', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '....S....', '..LLL....', '.LlLLLl..', '.LlLLlLL.', '..lLLLl..', '..LLL....', '.........'],
      ['.........', '..l..l...', '.lLLlLL..', '..llll...', '...SS....', '.OhOoOoO.', '.OhOoOoO.', '.OhOoOoO.', '..OOOo...'],
    ],
  },
  garlic: {
    palette: { L:'#558B2F', l:'#9CCC65', O:'#FAFAFA', o:'#CFCFCF', h:'#FFFFFF', G:'#A5C93D' },
    stages: [
      ['.........', '.........', '....L....', '...lLl...', '....L....', '.........', '.........', '.........', '.........'],
      ['.........', '....L....', '...lLl...', '...lLl...', '...lLl...', '....L....', '....L....', '.........', '.........'],
      ['...G.G...', '..lL.Ll..', '..lL.Ll..', '...lLl...', '...lLl...', '....L....', '....L....', '....L....', '.........'],
    ],
  },
};

// 收获后的"蔬菜本体"（手持 / 飞弹 / 商店图标 / 背包用）——果实造型
const ITEM_ART = {
  carrot: {
    palette: { L:'#2F7D32', l:'#66BB6A', O:'#FF6B35', o:'#D9541F', h:'#FFA05C' },
    map: [
      '...l.l...', '..lLlLl..', '...LLL...', '..hOOOo..', '..hOOOo..', '..hOOOo..', '...hOo...', '....o....', '.........'],
  },
  potato: {
    palette: { L:'#388E3C', l:'#66BB6A', O:'#A9764A', o:'#6B4526', h:'#C79A6B' },
    map: [
      '.........', '..hOOOO..', '.hOOoOo..', '.OOoOOo..', '.OOOoOO..', '.OOOOOo..', '..oOOOo..', '.........', '.........'],
  },
  pepper: {
    palette: { L:'#388E3C', l:'#66BB6A', O:'#E53935', o:'#B71C1C', h:'#FF6659', S:'#2E7D32' },
    map: [
      '....S....', '...SSS...', '..hOOOo..', '..hOOOo..', '..hOOOo..', '..hOOOo..', '..hOOOo..', '...hOo...', '....o....'],
  },
  corn: {
    palette: { L:'#388E3C', l:'#66BB6A', O:'#FDD835', o:'#B08400', h:'#FFF176', k:'#E0A800', W:'#F5F5F5' },
    map: [
      '....W....', '..lWl....', '.LlOOl...', '.LlOOk...', '.LlOOO...', '.LlOOk...', '.LlOOO...', '..Lll....', '...o.....'],
  },
  pumpkin: {
    palette: { L:'#388E3C', l:'#66BB6A', O:'#F57C00', o:'#E65100', h:'#FFB74D', S:'#6D4C41' },
    map: [
      '.........', '...SS....', '..OOOOO..', '.OhOoOoO.', '.OhOoOoO.', '.OhOoOoO.', '.OhOoOoO.', '..OOOOO..', '.........'],
  },
  garlic: {
    palette: { L:'#558B2F', l:'#9CCC65', O:'#FAFAFA', o:'#CFCFCF', h:'#FFFFFF', G:'#A5C93D' },
    map: [
      '...L.....', '...Ll....', '..OOOOO..', '.hOOoOo..', '.OOoOoO..', '.OOOoOO..', '.OOoOoO..', '..OOOOO..', '...ooo...'],
  },
};

// cell = 每个"美术像素"占多少画布像素（取整数才能保持像素锐利）
function createCropCanvas(plantId, stage, cell) {
  const art = CROP_ART[plantId];
  const map = art.stages[stage];
  return canvasFromMap(map, art.palette, cell);
}
function createItemCanvas(plantId, cell) {
  const art = ITEM_ART[plantId];
  return canvasFromMap(art.map, art.palette, cell);
}
function canvasFromMap(map, palette, cell) {
  const size = 9 * cell;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < 9; y++) {
    const row = map[y];
    if (!row) continue;
    for (let x = 0; x < 9; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      const col = palette[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return c;
}

const textures = {};       // 田里的作物（发芽/生长 3px→27x27；成熟 2px→18x18，视觉更小更贴地）
const itemTextures = {};   // 手持 / 投掷 / 图标（2px 单元 → 18x18，果实造型）
for (const pid of PLANT_ORDER) {
  textures[pid] = [];
  for (let s = 0; s < 2; s++) textures[pid].push(createCropCanvas(pid, s, 3));
  textures[pid].push(createCropCanvas(pid, 2, 2));   // 成熟阶段缩小
  itemTextures[pid] = createItemCanvas(pid, 2);
}

// ===== 预渲染静态美术（避免逐帧重画大量图元） =====
function makeTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return c;
}

// 地面：PvZ 风条纹草地 + 中缝木制墙体 + 两块农田底色（全部静态）
const groundTex = makeTex(CANVAS_W, CANVAS_H, (ctx) => {
  // 条纹草坪：与耕地行对齐、明暗交替（类似植物大战僵尸草地）
  for (let y = HUD_H; y < SHOP_Y; y++) {
    const band = Math.floor((y - FARMS.p1.y) / CELL);
    ctx.fillStyle = (band % 2 !== 0) ? '#569A39' : '#5FA83F';
    ctx.fillRect(0, y, CANVAS_W, 1);
  }
  // 草叶点缀
  for (let i = 0; i < 260; i++) {
    const x = (i * 137 + 23) % CANVAS_W;
    const y = HUD_H + ((i * 71 + 11) % (SHOP_Y - HUD_H));
    ctx.fillStyle = i % 3 === 0 ? '#4E8C32' : '#6BB04A';
    ctx.fillRect(x, y, 2, 1);
  }

  // 中缝木制墙体（竖向木板 + 压顶/压底 + 地面投影）
  const wx0 = 312, ww = 16, wy0 = HUD_H + 2, wy1 = SHOP_Y - 2;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';                    // 右侧地面投影
  ctx.fillRect(wx0 + ww, wy0 + 4, 4, wy1 - wy0 - 4);
  for (let i = 0; i < ww; i += 5) {                      // 竖向木板
    const pw = Math.min(5, ww - i);
    ctx.fillStyle = '#8B6B4A';
    ctx.fillRect(wx0 + i, wy0, pw, wy1 - wy0);
    ctx.fillStyle = '#9A7A55';
    ctx.fillRect(wx0 + i, wy0, 1, wy1 - wy0);            // 板左高光
    ctx.fillStyle = '#6B4F35';
    ctx.fillRect(wx0 + i + pw - 1, wy0, 1, wy1 - wy0);   // 板缝
  }
  ctx.fillStyle = 'rgba(90,70,50,0.35)';                 // 水平木纹
  for (let y = wy0 + 9; y < wy1; y += 14) ctx.fillRect(wx0, y, ww, 1);
  ctx.fillStyle = '#6B4F35';                             // 压顶梁
  ctx.fillRect(wx0 - 2, wy0 - 2, ww + 4, 6);
  ctx.fillStyle = '#A0855A';
  ctx.fillRect(wx0 - 2, wy0 - 2, ww + 4, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(wx0 - 2, wy0 + 4, ww + 4, 2);
  ctx.fillStyle = '#5A4632';                             // 压底梁
  ctx.fillRect(wx0 - 2, wy1 - 4, ww + 4, 4);
  ctx.fillStyle = '#3B2D1E';
  ctx.fillRect(wx0 - 2, wy1 - 1, ww + 4, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';                    // 墙脚投影
  ctx.fillRect(wx0 - 2, wy1, ww + 4, 2);

  // 农田底色：泥土 + 与草地的抖动过渡（外圈撒土色渐隐、内缘撒草色）
  for (const farm of [FARMS.p1, FARMS.p2]) {
    const w = FARM_COLS * CELL, h = FARM_ROWS * CELL;
    const bx = farm.x - 6, by = farm.y - 6, bw = w + 12, bh = h + 12;
    ctx.fillStyle = '#7A5C3E';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#8E6C4A';
    ctx.fillRect(bx, by, bw, 2);                          // 受光上边
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(bx, by + bh - 2, bw, 2);                 // 背光下边
    ctx.fillRect(bx + bw - 2, by, 2, bh);                 // 背光右边
    ctx.fillRect(bx, by, 2, bh);                          // 背光左边
    // 外圈抖动：越往外越稀疏（d=1:1/2, d=2:1/4, d=3:1/4, d=4:1/8）
    for (let d = 1; d <= 4; d++) {
      const cover = d === 1 ? 2 : d <= 3 ? 4 : 8;
      ctx.fillStyle = d <= 2 ? '#7A5C3E' : '#6E5238';
      for (let x = bx - d; x < bx + bw + d; x++) {
        if ((x + by - d) % cover === 0) ctx.fillRect(x, by - d, 1, 1);
        if ((x + by + bh - 1 + d) % cover === 0) ctx.fillRect(x, by + bh - 1 + d, 1, 1);
      }
      for (let y = by - d; y < by + bh + d; y++) {
        if ((bx - d + y) % cover === 0) ctx.fillRect(bx - d, y, 1, 1);
        if ((bx + bw - 1 + d + y) % cover === 0) ctx.fillRect(bx + bw - 1 + d, y, 1, 1);
      }
    }
    // 内缘撒草色（泥土边缘融入草地）
    ctx.fillStyle = '#5FA83F';
    for (let x = bx + 2; x < bx + bw - 2; x++) {
      if ((x * 3 + by) % 7 === 0) ctx.fillRect(x, by + 2, 1, 1);
      if ((x * 3 + by + bh) % 7 === 0) ctx.fillRect(x, by + bh - 3, 1, 1);
    }
    for (let y = by + 2; y < by + bh - 2; y++) {
      if ((y * 3 + bx) % 7 === 0) ctx.fillRect(bx + 2, y, 1, 1);
      if ((y * 3 + bx + bw) % 7 === 0) ctx.fillRect(bx + bw - 3, y, 1, 1);
    }
  }
});

// 地块三种状态的贴图（38x38，绘制在 (x+1, y+1)）
function makeTileTex(kind) {
  return makeTex(CELL - 2, CELL - 2, (ctx) => {
    const S = CELL - 2;
    if (kind === 'untilled') {
      ctx.fillStyle = '#8A6B4A';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#9C7B57';
      ctx.fillRect(0, 0, S, 1);
      ctx.fillRect(0, 0, 1, S);
      ctx.fillStyle = '#77593C';
      ctx.fillRect(0, S - 1, S, 1);
      ctx.fillRect(S - 1, 0, 1, S);
      ctx.fillStyle = '#6B9B4A';
      ctx.fillRect(7, 11, 3, 6);
      ctx.fillRect(21, 7, 3, 6);
      ctx.fillRect(27, 23, 3, 6);
      ctx.fillRect(11, 27, 3, 5);
      ctx.fillStyle = '#7DB055';
      ctx.fillRect(7, 11, 3, 1);
      ctx.fillRect(21, 7, 3, 1);
      ctx.fillRect(27, 23, 3, 1);
      ctx.fillRect(11, 27, 3, 1);
    } else {
      const wet = kind === 'watered';
      ctx.fillStyle = wet ? '#4A3228' : '#5D4037';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = wet ? '#5A4033' : '#6E5146';
      ctx.fillRect(3, 7, 32, 1);
      ctx.fillRect(3, 18, 32, 1);
      ctx.fillRect(3, 29, 32, 1);
      ctx.fillStyle = wet ? '#3A251D' : '#4E342E';
      ctx.fillRect(3, 8, 32, 2);
      ctx.fillRect(3, 19, 32, 2);
      ctx.fillRect(3, 30, 32, 2);
      ctx.fillStyle = wet ? '#38251C' : '#4A322A';
      ctx.fillRect(0, S - 1, S, 1);
      ctx.fillRect(S - 1, 0, 1, S);
      if (wet) {
        ctx.fillStyle = 'rgba(120,190,255,0.45)';
        ctx.fillRect(5, 13, 4, 3);
        ctx.fillRect(25, 25, 4, 3);
        ctx.fillStyle = 'rgba(190,225,255,0.35)';
        ctx.fillRect(6, 13, 2, 1);
        ctx.fillRect(26, 25, 2, 1);
      }
    }
  });
}
const tileTex = {
  untilled: makeTileTex('untilled'),
  tilled: makeTileTex('tilled'),
  watered: makeTileTex('watered'),
};

// 暗角（一次性烘焙，逐帧只做一次 blit）
const vignetteTex = makeTex(CANVAS_W, CANVAS_H, (ctx) => {
  const cy = (HUD_H + SHOP_Y) / 2;
  const g = ctx.createRadialGradient(CANVAS_W / 2, cy, 110, CANVAS_W / 2, cy, 400);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(12,22,44,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, HUD_H, CANVAS_W, SHOP_Y - HUD_H);
});

export class MPGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    this.net = new Network();
    this.state = null;
    this.role = null;
    this.roomId = null;

    // 本地预测
    this.local = { x: 160, y: 282, facing: 'down', walkFrame: 0, walkTimer: 0, moving: false };
    this.aim = { x: 0, y: 1 };   // 朝向兜底
    this.charge = 0;             // 当前蓄力秒数
    this.charging = false;       // 是否正在长按空格蓄力
    this.mouse = null;           // 最近一次鼠标位置（左键瞄准用）
    this.selected = 'carrot';
    this.keys = {};
    this.toasts = [];
    this.lastMoveSent = 0;
    this.throwCd = 0;
    this.interactCd = 0;
    this.ended = false;
    this.rafId = null;
    this.lastTime = 0;
    this.gameOverShown = false;

    this.onReady = null;   // 状态进入 playing 时回调
  }

  async start(playerName, roomId = null) {
    await this.net.connect();
    this.setupHandlers();
    this.net.join(playerName, roomId);

    this.lastTime = performance.now();
    this.loop();
  }

  setupHandlers() {
    this.net.on('joined', (msg) => {
      this.role = msg.role;
      this.roomId = msg.roomId;
      const walk = WALKS[this.role];
      this.local.x = Math.round((walk.minX + walk.maxX) / 2);
      this.local.y = 282;
      if (typeof this.onJoined === 'function') this.onJoined(msg);
    });

    this.net.on('state', (msg) => {
      // 自己掉血时给个提示（联机没有服务端提示通道，客户端自己比对）
      const prevMe = this.state?.players?.[this.role];
      this.state = msg.state;
      const me = this.role ? msg.state.players[this.role] : null;
      if (prevMe && me && me.hp < prevMe.hp) {
        this.toast(`你受到 ${prevMe.hp - me.hp} 伤害！`, '#FF8A80');
      }
      if (msg.state.state === 'playing' && !this.started) {
        this.started = true;
        if (typeof this.onReady === 'function') this.onReady(msg.state);
      }
      if (msg.state.state === 'ended' && !this.gameOverShown) {
        this.gameOverShown = true;
        this.showGameOver();
      }
    });

    this.net.on('error', (msg) => {
      // 相同错误 1.5 秒内只提示一次，避免刷屏
      const now = performance.now();
      this._lastErrAt = this._lastErrAt || {};
      if (now - (this._lastErrAt[msg.message] || 0) < 1500) return;
      this._lastErrAt[msg.message] = now;
      this.toast('⚠ ' + msg.message, '#FF8A80');
    });
  }

  showGameOver() {
    const winnerRole = this.state?.winner;
    const isWin = winnerRole === this.role;
    const winner = this.state?.players?.[winnerRole];
    const title = document.getElementById('gameover-title');
    const text = document.getElementById('gameover-message');
    const overlay = document.getElementById('gameover-overlay');
    if (title) title.textContent = isWin ? '🎉 你赢了！' : '💀 你输了...';
    if (text) {
      const me = this.state?.players?.[this.role];
      text.textContent = winner
        ? `${winner.name} 获胜　|　你的 HP: ${me?.hp ?? 0}`
        : '平局！';
    }
    if (overlay) overlay.style.display = 'flex';
    this.ended = true;
  }

  // ===== 循环 =====
  loop() {
    if (this.destroyed) return;
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.05) dt = 0.05;

    try {
      this.update(dt);
      this.render();
    } catch (err) {
      console.error('MP loop error:', err);
    }
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  destroy() {
    this.destroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.net?.ws) {
      try { this.net.ws.close(); } catch {}
    }
  }

  update(dt) {
    if (!this.state || this.state.state !== 'playing') return;
    if (!this.role || !WALKS[this.role]) return;

    // 冷却
    this.throwCd = Math.max(0, this.throwCd - dt);
    this.interactCd = Math.max(0, this.interactCd - dt);

    // 蓄力：按住空格增加，松手后衰减（不同蔬菜蓄力时间不同）
    const selPlant = PLANT_TYPES[this.selected];
    if (selPlant) {
      if (this.charging) {
        this.charge = Math.min(selPlant.chargeTime, this.charge + dt);
      } else if (this.charge > 0) {
        this.charge = Math.max(0, this.charge - dt * (selPlant.chargeTime / CHARGE_DECAY_TIME));
      }
    }

    // 移动（本地预测 + 定时上报）
    let dx = 0, dy = 0;
    const k = this.keys;
    if (k['a'] || k['arrowleft']) dx -= 1;
    if (k['d'] || k['arrowright']) dx += 1;
    if (k['w'] || k['arrowup']) dy -= 1;
    if (k['s'] || k['arrowdown']) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      this.local.x += (dx / len) * PLAYER_SPEED * dt;
      this.local.y += (dy / len) * PLAYER_SPEED * dt;
      this.local.facing = dx !== 0 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.aim = { x: dx / len, y: dy / len };
      this.local.moving = true;
      this.local.walkTimer += dt;
      if (this.local.walkTimer > 0.16) { this.local.walkTimer = 0; this.local.walkFrame ^= 1; }
    } else {
      this.local.moving = false;
    }
    const walk = WALKS[this.role];
    this.local.x = Math.max(walk.minX, Math.min(walk.maxX, this.local.x));
    this.local.y = Math.max(walk.minY, Math.min(walk.maxY, this.local.y));

    const now = performance.now();
    if (now - this.lastMoveSent > MOVE_SEND_INTERVAL) {
      this.lastMoveSent = now;
      this.net.action('move', {
        x: Math.round(this.local.x * 10) / 10,
        y: Math.round(this.local.y * 10) / 10,
        facing: this.local.facing,
        charge: Math.round(this.chargeRatio() * 100) / 100,
      });
    }

    // 提示
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
  }

  // ===== 操作 =====
  // 蓄力进度 0~1（按当前选中蔬菜的蓄力时间归一化）
  chargeRatio() {
    const sel = PLANT_TYPES[this.selected];
    if (!sel) return 0;
    return Math.min(1, this.charge / sel.chargeTime);
  }

  // 发操作前先把当前位置同步给服务器（消息保序），避免服务端位置过旧
  flushMove() {
    this.net.action('move', {
      x: Math.round(this.local.x * 10) / 10,
      y: Math.round(this.local.y * 10) / 10,
      facing: this.local.facing,
      charge: Math.round(this.chargeRatio() * 100) / 100,
    });
    this.lastMoveSent = performance.now();
  }

  me() {
    return this.state?.players?.[this.role] || null;
  }

  opp() {
    return this.state?.players?.[this.role === 'p1' ? 'p2' : 'p1'] || null;
  }

  myFarmOrigin() {
    return FARMS[this.role];
  }

  getTargetTile() {
    const origin = this.myFarmOrigin();
    let tx = this.local.x, ty = this.local.y - 12;
    const f = this.local.facing;
    if (f === 'up') ty -= REACH;
    else if (f === 'down') ty += REACH;
    else if (f === 'left') tx -= REACH;
    else tx += REACH;

    let col = Math.floor((tx - origin.x) / CELL);
    let row = Math.floor((ty - origin.y) / CELL);
    if (row >= 0 && row < FARM_ROWS && col >= 0 && col < FARM_COLS) return { r: row, c: col };

    col = Math.floor((this.local.x - origin.x) / CELL);
    row = Math.floor((this.local.y - origin.y) / CELL);
    if (row >= 0 && row < FARM_ROWS && col >= 0 && col < FARM_COLS) return { r: row, c: col };
    return null;
  }

  tileAction(tile) {
    if (!tile) return null;
    if (!tile.tilled) return '翻地';
    if (!tile.plant) return '播种';
    if (tile.mature) return '收获';
    if (!tile.watered) return '浇水';
    return null;
  }

  tryInteract() {
    if (this.interactCd > 0 || !this.state || this.state.state !== 'playing') return;
    const target = this.getTargetTile();
    if (!target) {
      this.toast('走到自家农田旁，面朝地块按 E', '#FFD700');
      return;
    }
    const me = this.me();
    if (!me) return;
    const tile = me.field[target.r][target.c];

    this.flushMove(); // 先同步位置，服务端按顺序校验

    if (!tile.tilled) {
      this.net.action('till', { row: target.r, col: target.c });
    } else if (!tile.plant) {
      if ((me.seeds[this.selected] || 0) <= 0) {
        this.toast(`没有${PLANT_TYPES[this.selected].name}种子，点下方按钮购买`, '#FF8A80');
        return;
      }
      this.net.action('plant', { row: target.r, col: target.c, plantId: this.selected });
    } else if (tile.mature) {
      this.net.action('harvest', { row: target.r, col: target.c });
    } else if (!tile.watered) {
      this.net.action('water', { row: target.r, col: target.c });
    } else {
      this.toast('作物正在生长中...', '#AAA');
      return;
    }
    this.interactCd = 0.25;
  }

  // 朝鼠标点击位置投掷（左键），威力由蓄力进度决定
  throwAt(mx, my) {
    if (this.throwCd > 0 || !this.state || this.state.state !== 'playing') return;
    const me = this.me();
    if (!me) return;

    const has = (me.veggies[this.selected] || 0) > 0;
    const any = Object.keys(me.veggies).find(k => me.veggies[k] > 0);
    if (!has && !any) {
      this.toast('没有蔬菜可投掷，先收获成熟作物', '#FF8A80');
      return;
    }

    let dx = mx - this.local.x;
    let dy = my - (this.local.y - 14);
    let d = Math.hypot(dx, dy);
    if (d < 6) {
      dx = this.aim.x; dy = this.aim.y; d = Math.hypot(dx, dy) || 1;
    }
    const ratio = this.chargeRatio();
    const power = 1 + (MAX_POWER - 1) * ratio;

    this.flushMove();
    this.net.action('throw', {
      plantId: has ? this.selected : any,
      dirX: Math.round((dx / d) * 1000) / 1000,
      dirY: Math.round((dy / d) * 1000) / 1000,
      power: Math.round(power * 100) / 100,
    });

    // 出手后蓄力清空，并转向投掷方向
    this.charge = 0;
    this.charging = false;
    this.local.facing = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    this.throwCd = 0.5;
  }

  handleKey(k) {
    if (!this.state || this.state.state !== 'playing') return;
    if (k >= '1' && k <= '6') {
      this.selected = PLANT_ORDER[parseInt(k) - 1];
      this.toast(`选中 ${PLANT_TYPES[this.selected].name}`, PLANT_TYPES[this.selected].color);
      return;
    }
    if (k === 'e') this.tryInteract();
  }

  handleShopClick(x, y) {
    const btnW = 50, btnH = 26, gap = 1, x0 = 10, y0 = SHOP_Y + 6;
    for (let i = 0; i < PLANT_ORDER.length; i++) {
      const bx = x0 + i * (btnW + gap);
      if (x >= bx && x < bx + btnW && y >= y0 && y < y0 + btnH) {
        const pid = PLANT_ORDER[i];
        this.selected = pid;
        this.net.action('buy', { plantId: pid });
        return true;
      }
    }
    return false;
  }

  toast(text, color = '#fff') {
    this.toasts.push({ text, color, life: 1.8, maxLife: 1.8 });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  // ===== 渲染 =====
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (!this.state || !this.role) {
      this.drawWaiting(ctx);
      return;
    }
    if (this.state.state === 'waiting') {
      this.drawWaiting(ctx);
      return;
    }

    this.drawGround(ctx);

    const me = this.me(), opp = this.opp();
    this.drawFarm(ctx, me, this.role);
    if (opp) this.drawFarm(ctx, opp, this.role === 'p1' ? 'p2' : 'p1');
    this.drawTargetHighlight(ctx);

    if (opp) this.drawFarmer(ctx, this.opponentView(), this.role === 'p1' ? 'p2' : 'p1');
    this.drawFarmer(ctx, this.selfView(), this.role);
    const oppView = this.opponentView();
    if (oppView) this.drawChargeBar(ctx, Math.round(oppView.x), Math.round(oppView.y), opp?.charge || 0);
    this.drawChargeBar(ctx, Math.round(this.local.x), Math.round(this.local.y), this.chargeRatio());
    this.drawAimIndicator(ctx);

    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    ctx.drawImage(vignetteTex, 0, 0);   // 暗角（在 HUD 之下，保证文字清晰）
    this.drawHUD(ctx);
    this.drawShop(ctx);
    this.drawToasts(ctx);
  }

  selfView() {
    const me = this.me();
    return {
      role: this.role,
      name: me?.name || '我',
      x: this.local.x, y: this.local.y,
      facing: this.local.facing,
      moving: this.local.moving,
      walkFrame: this.local.walkFrame,
      hitFlash: 0,
      selected: this.selected,
      veggies: me?.veggies || {},
      hp: me?.hp ?? 0,
    };
  }

  opponentView() {
    const opp = this.opp();
    if (!opp) return null;
    return {
      role: this.role === 'p1' ? 'p2' : 'p1',
      name: opp.name,
      x: opp.x, y: opp.y,
      facing: opp.facing || 'down',
      moving: false,
      walkFrame: 0,
      hitFlash: 0,
      selected: Object.keys(opp.veggies || {})[0] || 'carrot',
      veggies: opp.veggies || {},
      hp: opp.hp,
    };
  }

  drawWaiting(ctx) {
    ctx.fillStyle = '#2E7D32';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🥬 蔬菜农场大作战', CANVAS_W / 2, 120);
    ctx.fillStyle = '#FFF';
    ctx.font = '14px monospace';
    ctx.fillText(`你的身份: ${this.role === 'p1' ? '左方农场 (蓝)' : '右方农场 (红)'}`, CANVAS_W / 2, 170);
    ctx.fillText(`房间: ${this.roomId || '...'}`, CANVAS_W / 2, 195);
    ctx.fillText('等待对手加入...', CANVAS_W / 2, 225);
    ctx.textAlign = 'start';
  }

  drawGround(ctx) {
    ctx.drawImage(groundTex, 0, 0);
  }

  drawFarm(ctx, farmer, role) {
    if (!farmer) return;
    const fx = FARMS[role].x, fy = FARMS[role].y;
    const w = FARM_COLS * CELL, h = FARM_ROWS * CELL;

    // 土地底色已烘焙进地面贴图，这里只画动态内容
    ctx.fillStyle = role === this.role ? '#E3F2FD' : '#FFEBEE';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(role === this.role ? `${farmer.name}（你）` : farmer.name, fx + w / 2, fy - 10);
    ctx.textAlign = 'start';

    for (let r = 0; r < FARM_ROWS; r++) {
      for (let c = 0; c < FARM_COLS; c++) {
        const x = fx + c * CELL;
        const y = fy + r * CELL;
        const tile = farmer.field[r][c];

        // 地块贴图（三种状态预渲染）
        const tt = !tile.tilled ? tileTex.untilled : (tile.watered ? tileTex.watered : tileTex.tilled);
        ctx.drawImage(tt, x + 1, y + 1);

        if (tile.plant) {
          const prog = tile.maxGrowth > 0 ? tile.growth / tile.maxGrowth : 0;
          const stage = tile.mature ? 2 : prog >= 0.5 ? 1 : 0;
          const tex = textures[tile.plant]?.[stage];
          if (tex) {
            const ts = tile.mature ? 18 : 27;   // 成熟阶段缩小（2px/格），更像真长在地里
            const dx = x + (CELL - ts) / 2;
            const dy = y + (CELL - ts) / 2;
            if (tile.mature) {
              ctx.fillStyle = 'rgba(255,255,150,0.22)';
              ctx.beginPath();
              ctx.arc(x + CELL / 2, y + CELL / 2, CELL / 2, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.drawImage(tex, dx, dy, ts, ts);
            if (tile.mature) {
              ctx.fillStyle = '#FFD700';
              ctx.font = 'bold 10px monospace';
              ctx.fillText('★', x + CELL - 12, y + 11);
            }
            if (!tile.mature && !tile.watered) {
              ctx.fillStyle = '#FF8A80';
              ctx.font = '8px monospace';
              ctx.fillText('!', x + 3, y + 12);
            }
          }
        }
      }
    }
  }

  drawTargetHighlight(ctx) {
    if (!this.state || this.state.state !== 'playing') return;
    const target = this.getTargetTile();
    if (!target) return;
    const me = this.me();
    if (!me) return;
    const tile = me.field[target.r][target.c];
    const origin = this.myFarmOrigin();
    const x = origin.x + target.c * CELL;
    const y = origin.y + target.r * CELL;
    const pulse = 0.5 + Math.sin(performance.now() / 200) * 0.3;

    ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);

    const action = this.tileAction(tile);
    if (action) {
      const label = `E ${action}`;
      ctx.font = 'bold 9px monospace';
      const tw = ctx.measureText(label).width + 8;
      const bx = x + CELL / 2 - tw / 2;
      const by = y - 16;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx, by, tw, 13);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, tw, 13);
      ctx.fillStyle = '#FFD700';
      ctx.fillText(label, bx + 4, by + 10);
    }
  }

  drawFarmer(ctx, farmer, role) {
    if (!farmer) return;
    const x = Math.round(farmer.x);
    const y = Math.round(farmer.y);
    const isP1 = role === 'p1';
    const shirt = isP1 ? '#4A90D9' : '#D9534F';
    const shirtLight = isP1 ? '#6FAEE8' : '#E87A76';   // 受光面（左上光源）
    const shirtDark = isP1 ? '#357ABD' : '#B8403C';
    const skin = '#F2C08A';
    const skinShade = '#D9A46F';
    const pants = isP1 ? '#35507E' : '#4A3A50';
    const pantsDark = isP1 ? '#2A3F63' : '#38293E';
    const hat = isP1 ? '#E8C860' : '#C85A54';
    const hatDark = isP1 ? '#C8A840' : '#A84440';
    const outlineBody = isP1 ? '#1E2A40' : '#3A1E22';   // 深色描边（同色系，不用纯黑）
    const outlineHead = isP1 ? '#6B4A22' : '#5A2A28';
    const bob = farmer.moving && farmer.walkFrame === 1 ? 1 : 0;

    ctx.save();
    ctx.translate(x, y - bob);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const flashing = farmer.hitFlash > 0 && Math.floor(performance.now() / 60) % 2 === 0;

    const legOff = farmer.moving ? (farmer.walkFrame === 1 ? 1 : -1) : 0;
    ctx.fillStyle = pants;
    ctx.fillRect(-4 + legOff, -5, 3, 5);
    ctx.fillRect(1 - legOff, -5, 3, 5);
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(-4 + legOff, -1, 3, 2);
    ctx.fillRect(1 - legOff, -1, 3, 2);

    // 身体（先描边再填色，留出 1px 深色轮廓）
    ctx.fillStyle = outlineBody;
    ctx.fillRect(-6, -15, 12, 12);
    ctx.fillStyle = flashing ? '#FF5252' : shirt;
    ctx.fillRect(-5, -14, 10, 10);
    if (!flashing) {
      ctx.fillStyle = shirtLight;          // 左侧受光
      ctx.fillRect(-5, -14, 2, 10);
      ctx.fillStyle = shirtDark;           // 右侧背光
      ctx.fillRect(3, -14, 2, 10);
    }
    ctx.fillStyle = pants;
    ctx.fillRect(-5, -8, 10, 4);
    ctx.fillRect(-4, -14, 2, 7);
    ctx.fillRect(2, -14, 2, 7);
    ctx.fillStyle = pantsDark;
    ctx.fillRect(-5, -5, 10, 1);

    ctx.fillStyle = flashing ? '#FF5252' : shirtDark;
    ctx.fillRect(-7, -13, 2, 6);
    ctx.fillRect(5, -13, 2, 6);

    // 头（描边 + 下巴阴影）
    ctx.fillStyle = outlineHead;
    ctx.fillRect(-5, -24, 10, 11);
    ctx.fillStyle = skin;
    ctx.fillRect(-4, -23, 8, 9);
    ctx.fillStyle = skinShade;
    ctx.fillRect(-4, -15, 8, 1);

    if (farmer.facing !== 'up') {
      ctx.fillStyle = '#222';
      if (farmer.facing === 'down') {
        ctx.fillRect(-3, -20, 2, 2);
        ctx.fillRect(1, -20, 2, 2);
      } else if (farmer.facing === 'left') {
        ctx.fillRect(-3, -20, 2, 2);
      } else {
        ctx.fillRect(1, -20, 2, 2);
      }
    }

    // 草帽（描边 + 受光边）
    ctx.fillStyle = outlineHead;
    ctx.fillRect(-5, -29, 10, 4);
    ctx.fillRect(-7, -26, 14, 3);
    ctx.fillStyle = hatDark;
    ctx.fillRect(-4, -28, 8, 3);
    ctx.fillStyle = hat;
    ctx.fillRect(-6, -25, 12, 2);
    ctx.fillStyle = 'rgba(255,255,220,0.35)';
    ctx.fillRect(-6, -25, 12, 1);
    ctx.fillStyle = isP1 ? '#8B4513' : '#5D4037';
    ctx.fillRect(-4, -26, 8, 1);

    // 手中持有的蔬菜（成熟形态缩到 9x9）
    if ((farmer.veggies?.[farmer.selected] || 0) > 0) {
      const tex = itemTextures[farmer.selected];
      if (tex) {
        const hx = farmer.facing === 'left' ? -14 : 5;
        ctx.drawImage(tex, hx, -19, 9, 9);
      }
    }

    ctx.restore();

    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = role === this.role ? '#BBDEFB' : '#FFCDD2';
    ctx.fillText(farmer.name, x, y - 32);
    ctx.textAlign = 'start';
  }

  // 背包里有蔬菜时，用渐隐的小点显示"左键会朝哪扔"（指向鼠标位置）
  drawAimIndicator(ctx) {
    const me = this.me();
    if (!me || this.ended || !this.mouse) return;
    const hasVeg = Object.values(me.veggies || {}).some(v => v > 0);
    if (!hasVeg) return;

    let dx = this.mouse.x - this.local.x;
    let dy = this.mouse.y - (this.local.y - 16);
    const len = Math.hypot(dx, dy);
    if (len < 6) {
      dx = this.aim.x; dy = this.aim.y;
      const l2 = Math.hypot(dx, dy) || 1;
      dx /= l2; dy /= l2;
    } else {
      dx /= len; dy /= len;
    }

    const ratio = this.chargeRatio();
    const spread = 1 + ratio * 1.5;
    const full = ratio >= 1;

    ctx.fillStyle = full ? '#FF5252' : '#FFD700';
    for (let i = 1; i <= 3; i++) {
      const d = (12 + i * 9) * spread;
      ctx.globalAlpha = 0.75 - i * 0.18;
      ctx.beginPath();
      ctx.arc(this.local.x + dx * d, (this.local.y - 16) + dy * d, 2.6 - i * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 蓄力条（ratio 0~1）
  drawChargeBar(ctx, x, y, ratio) {
    if (ratio <= 0) return;
    const w = 26, h = 4;
    const bx = x - w / 2;
    const by = y - 38;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = ratio >= 1 ? '#FF5252' : '#FFD700';
    ctx.fillRect(bx, by, w * ratio, h);
    if (ratio >= 1) {
      const pulse = 0.5 + Math.sin(performance.now() / 90) * 0.5;
      ctx.strokeStyle = `rgba(255,82,82,${0.4 + pulse * 0.6})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 2.5, by - 2.5, w + 5, h + 5);
    }
  }

  drawProjectiles(ctx) {
    if (!this.state) return;
    for (const p of this.state.projectiles) {
      const bob = Math.sin((p.t || 0) * 12) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 10, p.size * 0.8, p.size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // 蔬菜本体（成熟形态像素图，飞出去也认得出是什么菜）
      const tex = itemTextures[p.plantId];
      if (tex) {
        ctx.drawImage(tex, Math.round(p.x - 9), Math.round(p.y - 15 + bob), 18, 18);
      }
    }
  }

  drawParticles(ctx) {
    if (!this.state) return;
    for (const p of this.state.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawHUD(ctx) {
    ctx.fillStyle = 'rgba(20,30,15,0.85)';
    ctx.fillRect(0, 0, CANVAS_W, HUD_H);
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, HUD_H - 2, CANVAS_W, 2);

    const me = this.me(), opp = this.opp();
    if (me) this.drawHPBar(ctx, 8, 6, me, false);
    if (opp) this.drawHPBar(ctx, CANVAS_W - 8 - 120, 6, opp, true);

    const rem = Math.max(0, GAME_DURATION - (this.state?.elapsed || 0));
    const m = Math.floor(rem / 60);
    const s = Math.floor(rem % 60);
    ctx.fillStyle = rem < 30 ? '#FF5252' : '#FFF';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${m}:${s.toString().padStart(2, '0')}`, CANVAS_W / 2, 19);
    ctx.textAlign = 'start';
  }

  drawHPBar(ctx, x, y, farmer, alignRight) {
    const w = 120, h = 9;
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, h);
    const pct = Math.max(0, farmer.hp / PLAYER_HP);
    ctx.fillStyle = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#FF9800' : '#F44336';
    if (alignRight) ctx.fillRect(x + w * (1 - pct), y, w * pct, h);
    else ctx.fillRect(x, y, w * pct, h);
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#FFF';
    ctx.font = '8px monospace';
    if (alignRight) {
      ctx.textAlign = 'right';
      ctx.fillText(`${farmer.name}  ❤${farmer.hp}  💰${farmer.coins}`, x + w, y + h + 9);
      ctx.textAlign = 'start';
    } else {
      ctx.fillText(`${farmer.name}  ❤${farmer.hp}  💰${farmer.coins}`, x, y + h + 9);
    }
  }

  drawShop(ctx) {
    ctx.fillStyle = 'rgba(20,30,15,0.9)';
    ctx.fillRect(0, SHOP_Y, CANVAS_W, CANVAS_H - SHOP_Y);
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, SHOP_Y, CANVAS_W, 2);

    const me = this.me();
    if (!me) return;

    const btnW = 50, btnH = 26, gap = 1, x0 = 10, y0 = SHOP_Y + 6;
    for (let i = 0; i < PLANT_ORDER.length; i++) {
      const pid = PLANT_ORDER[i];
      const plant = PLANT_TYPES[pid];
      const bx = x0 + i * (btnW + gap);
      const canAfford = me.coins >= plant.cost;
      const isSel = this.selected === pid;
      const seedCount = me.seeds[pid] || 0;

      ctx.fillStyle = isSel ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(bx, y0, btnW, btnH);
      ctx.strokeStyle = isSel ? '#FFD700' : canAfford ? '#666' : '#444';
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(bx, y0, btnW, btnH);

      // 蔬菜图标（买不起时压暗）
      const iconTex = itemTextures[pid];
      if (iconTex) {
        ctx.globalAlpha = canAfford ? 1 : 0.35;
        ctx.drawImage(iconTex, bx + 3, y0 + 3, 9, 9);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = canAfford ? '#EEE' : '#777';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`${i + 1}.${plant.name}`, bx + 14, y0 + 9);

      ctx.fillStyle = canAfford ? '#FFD700' : '#777';
      ctx.font = '8px monospace';
      ctx.fillText(`💰${plant.cost} x${seedCount}`, bx + 3, y0 + 20);
    }

    const vx0 = x0 + PLANT_ORDER.length * (btnW + gap) + 8;
    ctx.fillStyle = '#AAA';
    ctx.font = '8px monospace';
    ctx.fillText('背包(左键投掷):', vx0, y0 + 9);

    let vx = vx0;
    const vy = y0 + 13;
    for (const pid of PLANT_ORDER) {
      const count = me.veggies[pid] || 0;
      if (count <= 0) continue;
      const isSel = this.selected === pid;
      const tex = itemTextures[pid];
      if (tex) ctx.drawImage(tex, vx, vy, 9, 9);
      ctx.strokeStyle = isSel ? '#FFD700' : 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx - 1, vy - 1, 11, 11);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`x${count}`, vx + 12, vy + 9);
      vx += 36;
    }
    if (vx === vx0) {
      ctx.fillStyle = '#777';
      ctx.font = '8px monospace';
      ctx.fillText('（空 - 收获成熟作物获得）', vx0 + 46, vy + 8);
    }
  }

  drawToasts(ctx) {
    ctx.textAlign = 'center';
    let y = 52;
    for (const t of this.toasts) {
      const alpha = Math.min(1, t.life / 0.5);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(t.text).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(CANVAS_W / 2 - tw / 2, y - 10, tw, 14);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, CANVAS_W / 2, y);
      ctx.globalAlpha = 1;
      y += 16;
    }
    ctx.textAlign = 'start';
  }
}
