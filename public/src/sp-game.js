// ============================================
// 蔬菜大作战 - 单人测试模式（星露谷风格）
// WASD 移动 / E 交互地块 / F 投掷蔬菜
// 完全独立，无外部依赖
// ============================================

import { audio } from './audio.js?v=1';

audio.installUnlock();

const CANVAS_W = 640;
const CANVAS_H = 360;
const HUD_H = 28;       // 顶部状态栏高度
const SHOP_Y = 302;     // 底部商店栏起始 y

// ===== 常量 =====
const PLANT_TYPES = {
  carrot:   { id:'carrot',   name:'胡萝卜', cost:10, damage:10, growthTime:3, speed:4, chargeTime:0.5, color:'#FF6B35', leafColor:'#4CAF50' },
  potato:   { id:'potato',   name:'土豆',   cost:20, damage:20, growthTime:5, speed:3, chargeTime:0.9, color:'#8B5E3C', leafColor:'#66BB6A' },
  pepper:   { id:'pepper',   name:'辣椒',   cost:30, damage:15, growthTime:6, speed:3, chargeTime:0.8, color:'#E53935', leafColor:'#2E7D32' },
  corn:     { id:'corn',     name:'玉米',   cost:12, damage:8,  growthTime:4, speed:6, chargeTime:1.0, color:'#FDD835', leafColor:'#388E3C' },
  pumpkin:  { id:'pumpkin',  name:'南瓜',   cost:15, damage:5,  growthTime:7, speed:2, chargeTime:1.3, color:'#F57C00', leafColor:'#1B5E20' },
  garlic:   { id:'garlic',   name:'大蒜',   cost:40, damage:30, growthTime:8, speed:2.5, chargeTime:1.5, color:'#FAFAFA', leafColor:'#558B2F' },
};
const MAX_POWER = 3;         // 满蓄力时速度倍数
const CHARGE_DECAY_TIME = 1.5; // 松手后从满蓄力衰减到 0 需要的时间（秒）
const PLANT_ORDER = ['carrot','potato','pepper','corn','pumpkin','garlic'];

const FARM_COLS = 5;
const FARM_ROWS = 5;
const CELL = 40;
const PLAYER_HP = 100;
const STARTING_COINS = 50;
const GAME_DURATION = 180;

const P1_FARM = { x: 40,  y: 52 };
const P2_FARM = { x: 360, y: 52 };
const WALK_P1 = { minX: 24, maxX: 304, minY: 52, maxY: 288 };
const WALK_P2 = { minX: 336, maxX: 616, minY: 52, maxY: 288 };
const PLAYER_SPEED = 100;
const AI_SPEED = 78;
const WATER_DURATION = 6;  // 一次浇水可维持的生长时间（秒）
const TILL_IDLE_TIME = 15; // 翻好的地多久没种就荒废回未耕种（秒）
const TILL_HOLD_TIME = 0.5; // 翻地需要长按 E 的秒数

// ===== 被动金币：4 个阶段，每过一个阶段速度 +0.3/秒 =====
const COIN_BASE_RATE = 1;     // 基础速度（枚/秒）
const COIN_STAGE_COUNT = 4;
const COIN_STAGE_BONUS = 0.3;

function coinStageAt(elapsed) {
  return Math.min(
    COIN_STAGE_COUNT - 1,
    Math.floor(elapsed / (GAME_DURATION / COIN_STAGE_COUNT))
  );
}

function coinRateAt(elapsed) {
  return COIN_BASE_RATE + coinStageAt(elapsed) * COIN_STAGE_BONUS;
}

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
    const band = Math.floor((y - P1_FARM.y) / CELL);
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
  for (const farm of [P1_FARM, P2_FARM]) {
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
      ctx.fillStyle = '#9C7B57';           // 受光边
      ctx.fillRect(0, 0, S, 1);
      ctx.fillRect(0, 0, 1, S);
      ctx.fillStyle = '#77593C';           // 背光边
      ctx.fillRect(0, S - 1, S, 1);
      ctx.fillRect(S - 1, 0, 1, S);
      ctx.fillStyle = '#6B9B4A';           // 杂草
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
      ctx.fillStyle = wet ? '#5A4033' : '#6E5146';   // 垄沟受光
      ctx.fillRect(3, 7, 32, 1);
      ctx.fillRect(3, 18, 32, 1);
      ctx.fillRect(3, 29, 32, 1);
      ctx.fillStyle = wet ? '#3A251D' : '#4E342E';   // 垄沟
      ctx.fillRect(3, 8, 32, 2);
      ctx.fillRect(3, 19, 32, 2);
      ctx.fillRect(3, 30, 32, 2);
      ctx.fillStyle = wet ? '#38251C' : '#4A322A';   // 背光边
      ctx.fillRect(0, S - 1, S, 1);
      ctx.fillRect(S - 1, 0, 1, S);
      if (wet) {
        ctx.fillStyle = 'rgba(120,190,255,0.45)';    // 水光
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

// 点到线段的距离（用于高速飞弹的扫掠命中判定）
function segPointDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

// ===== 数据结构 =====
function createField() {
  const f = [];
  for (let r = 0; r < FARM_ROWS; r++) {
    f[r] = [];
    for (let c = 0; c < FARM_COLS; c++) {
      f[r][c] = {
        tilled: false,     // 是否翻过地
        plant: null,       // 作物 id
        growth: 0,         // 已生长秒数
        maxGrowth: 0,
        watered: false,    // 当前是否湿润
        waterTimer: 0,     // 湿润剩余时间
        mature: false,     // 是否成熟
        idleTimer: 0,      // 翻好但没种地的持续时间，超过 TILL_IDLE_TIME 就荒废
      };
    }
  }
  return f;
}

function createFarmer(role, name, farmOrigin, walk) {
  return {
    role, name,
    x: (walk.minX + walk.maxX) / 2,
    y: 282,
    facing: 'down',
    aim: { x: 0, y: 1 },   // 角色朝向（鼠标点太近时的兜底方向）
    charge: 0,             // 当前蓄力秒数
    charging: false,       // 是否正在长按空格蓄力
    moving: false,
    walkFrame: 0,
    walkTimer: 0,
    hp: PLAYER_HP,
    coins: STARTING_COINS,
    farm: createField(),
    farmX: farmOrigin.x,
    farmY: farmOrigin.y,
    walk,
    seeds: { carrot: 2, corn: 2, potato: 1 },  // 种子
    veggies: {},                                // 收获的蔬菜（可投掷）
    selected: 'carrot',
    interactCd: 0,
    throwCd: 0,
    hitFlash: 0,
    dotTimer: 0,           // 辣椒灼烧剩余时间
    dotDps: 0,             // 灼烧每秒伤害
    dotAcc: 0,             // 灼烧小数累加器（保证 HP 是整数）
    tillHold: 0,           // 长按 E 翻地的进度（秒）
    tillTileKey: null,     // 进度对应的地块，换地块要重新计时
  };
}

// ===== AI =====
class AI {
  constructor(game) {
    this.game = game;
    this.task = null;       // { type:'till'|'plant'|'water'|'harvest', r, c }
    this.decisionCd = 0.5;
    this.throwCd = 4;
    this.chargeGoal = 0;    // >0 表示正在蓄力，达到该秒数后出手
    this.pendingVeggie = null;
    this.tillHold = 0;      // 长按翻地进度
    this.tillTileKey = null;
  }

  update(dt) {
    const p2 = this.game.p2;
    this.throwCd -= dt;

    if (!this.task) {
      this.decisionCd -= dt;
      if (this.decisionCd <= 0) {
        this.decisionCd = 0.6;
        this.pickTask();
      }
    } else {
      this.doTask(dt);
    }

    // 投掷：先蓄力（有明显的蓄力条预警），蓄满目标后朝玩家出手
    if (this.chargeGoal > 0) {
      p2.charging = true;
      p2.charge += dt;
      if (p2.charge >= this.chargeGoal) {
        this.aimAtPlayer();
        this.game.throwVeggie(p2, this.pendingVeggie);
        this.chargeGoal = 0;
        this.pendingVeggie = null;
        this.throwCd = 4 + Math.random() * 3;
      }
    } else if (this.throwCd <= 0) {
      const av = Object.keys(p2.veggies).filter(k => p2.veggies[k] > 0);
      if (av.length > 0) {
        this.pendingVeggie = av[Math.floor(Math.random() * av.length)];
        p2.selected = this.pendingVeggie;
        p2.charge = 0;
        // 蓄力 40% ~ 100%
        this.chargeGoal = PLANT_TYPES[this.pendingVeggie].chargeTime * (0.4 + Math.random() * 0.6);
      } else {
        this.throwCd = 1.5;
      }
    }
  }

  // 投掷前把瞄准方向指向玩家（带一点随机偏差，给玩家躲避空间）
  aimAtPlayer() {
    const p2 = this.game.p2;
    const p1 = this.game.p1;
    const dx = p1.x - p2.x;
    const dy = (p1.y - 14) - (p2.y - 18);
    const d = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.16;
    p2.aim = { x: Math.cos(ang), y: Math.sin(ang) };
    p2.facing = Math.abs(p2.aim.x) > Math.abs(p2.aim.y)
      ? (p2.aim.x > 0 ? 'right' : 'left')
      : (p2.aim.y > 0 ? 'down' : 'up');
  }

  pickTask() {
    const p2 = this.game.p2;
    const f = p2.farm;
    let best = null;
    for (let r = 0; r < FARM_ROWS; r++) {
      for (let c = 0; c < FARM_COLS; c++) {
        const t = f[r][c];
        if (t.mature) { best = { type:'harvest', r, c }; break; }
        if (!best && t.plant && !t.mature && !t.watered) best = { type:'water', r, c };
        if (!best && t.tilled && !t.plant) best = { type:'plant', r, c };
        if (!best && !t.tilled) best = { type:'till', r, c };
      }
      if (best && best.type === 'harvest') break;
    }
    this.task = best;
    if (!best) this.decisionCd = 1.0;
  }

  doTask(dt) {
    const p2 = this.game.p2;
    const t = this.task;
    const tx = p2.farmX + t.c * CELL + CELL / 2;
    const ty = p2.farmY + t.r * CELL + CELL / 2;
    const dx = tx - p2.x, dy = ty - p2.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 24) {
      const sp = AI_SPEED * dt;
      p2.x += (dx / dist) * sp;
      p2.y += (dy / dist) * sp;
      p2.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      p2.aim = { x: dx / dist, y: dy / dist };
      p2.moving = true;
      p2.walkTimer += dt;
      if (p2.walkTimer > 0.16) { p2.walkTimer = 0; p2.walkFrame ^= 1; }
      this.clampToWalk(p2);
      return;
    }

    // 到达，执行
    p2.moving = false;
    const tile = p2.farm[t.r][t.c];
    if (t.type !== 'till') { this.tillHold = 0; this.tillTileKey = null; }
    if (t.type === 'till' && !tile.tilled) {
      // 翻地同样要长按，和玩家规则一致；换地块则重新计时
      const key = `${t.r},${t.c}`;
      if (this.tillTileKey !== key) { this.tillTileKey = key; this.tillHold = 0; }
      this.tillHold += dt;
      if (this.tillHold < TILL_HOLD_TIME) return;   // 站在地里翻，进度保留
      this.tillHold = 0;
      this.tillTileKey = null;
      tile.tilled = true;
      tile.idleTimer = 0;
      audio.sfx('till', 0.45);
    } else if (t.type === 'plant') {
      let seed = PLANT_ORDER.find(p => (p2.seeds[p] || 0) > 0);
      if (!seed) {
        // 买得起就买
        const afford = PLANT_ORDER.filter(p => p2.coins >= PLANT_TYPES[p].cost);
        if (afford.length > 0) {
          const buy = afford[Math.floor(Math.random() * afford.length)];
          p2.coins -= PLANT_TYPES[buy].cost;
          p2.seeds[buy] = (p2.seeds[buy] || 0) + 1;
          seed = buy;
        }
      }
      if (seed) {
        p2.seeds[seed]--;
        tile.plant = seed;
        tile.growth = 0;
        tile.maxGrowth = PLANT_TYPES[seed].growthTime;
        tile.watered = false;
        tile.mature = false;
        tile.idleTimer = 0;
        audio.sfx('plant', 0.4);
      }
    } else if (t.type === 'water' && !tile.watered && !tile.mature) {
      tile.watered = true;
      tile.waterTimer = WATER_DURATION;
      audio.sfx('water', 0.35);
    } else if (t.type === 'harvest' && tile.mature) {
      const pid = tile.plant;
      tile.plant = null; tile.growth = 0; tile.mature = false; tile.watered = false;
      tile.idleTimer = 0;
      p2.veggies[pid] = (p2.veggies[pid] || 0) + 1;
      p2.coins += 2;
      this.game.spawnParticles(tx, ty, PLANT_TYPES[pid].color, 6);
      audio.sfx('harvest', 0.4);
    }
    this.task = null;
    this.decisionCd = 0.35;
  }

  clampToWalk(p2) {
    p2.x = Math.max(p2.walk.minX, Math.min(p2.walk.maxX, p2.x));
    p2.y = Math.max(p2.walk.minY, Math.min(p2.walk.maxY, p2.y));
  }
}

// ===== 主游戏类 =====
export class SinglePlayerGame {
  constructor(canvas, playerName) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    this.p1 = createFarmer('p1', playerName, P1_FARM, WALK_P1);
    this.p2 = createFarmer('p2', '电脑对手', P2_FARM, WALK_P2);

    this.projectiles = [];
    this.particles = [];
    this.bursts = [];     // 玉米连发队列
    this.toasts = [];
    this.keys = {};
    this.mouse = { x: this.p1.x + 220, y: this.p1.y - 10 };  // 最近一次鼠标位置（左键瞄准用）

    this.elapsed = 0;
    this.ended = false;
    this.rafId = null;
    this.lastTime = 0;
    this.coinTimer = 0;
    this.shake = 0;
    this.targetTile = null;
    this.ai = new AI(this);
    this.audio = audio;   // 方便控制台调试与测试

    console.log('SinglePlayerGame initialized (Stardew style)');
  }

  // ===== 生命周期 =====
  start() {
    this.lastTime = performance.now();
    this.toast('WASD 移动 | E 交互地块 | 长按空格蓄力 + 左键投掷 | 1-6 选择种子 | M 静音', '#FFD700');
    audio.startMusic();
    this.loop();
    console.log('Game loop started');
  }

  loop() {
    if (this.ended || this.destroyed) return;
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.05) dt = 0.05;

    this.update(dt);
    this.render();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  destroy() {
    this.destroyed = true;
    this.ended = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    audio.stopMusic();
  }

  // ===== 更新 =====
  update(dt) {
    this.elapsed += dt;
    if (this.shake > 0) this.shake -= dt;

    this.updatePlayer(dt);
    this.ai.update(dt);
    this.updateGrowth(dt);
    this.updateTilledIdle(dt);
    this.updateBursts(dt);
    this.updateDot(dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);

    // 被动金币：分 4 个阶段，每过一个阶段速度 +0.3/秒
    this.coinTimer += coinRateAt(this.elapsed) * dt;
    const wholeCoins = Math.floor(this.coinTimer);
    if (wholeCoins > 0) {
      this.coinTimer -= wholeCoins;
      this.p1.coins += wholeCoins;
      this.p2.coins += wholeCoins;
    }

    // 提示文本
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }

    // 交互目标高亮
    this.targetTile = this.getTargetTile(this.p1);

    // 长按 E 翻地
    this.updateTillHold(dt);

    // 蓄力：按住空格增加，松手后衰减（不同蔬菜蓄力时间不同）
    const selPlant = PLANT_TYPES[this.p1.selected];
    if (selPlant) {
      if (this.p1.charging) {
        this.p1.charge = Math.min(selPlant.chargeTime, this.p1.charge + dt);
      } else if (this.p1.charge > 0) {
        this.p1.charge = Math.max(0, this.p1.charge - dt * (selPlant.chargeTime / CHARGE_DECAY_TIME));
      }
    }

    // 冷却
    this.p1.interactCd = Math.max(0, this.p1.interactCd - dt);
    this.p1.throwCd = Math.max(0, this.p1.throwCd - dt);
    this.p1.hitFlash = Math.max(0, this.p1.hitFlash - dt);
    this.p2.hitFlash = Math.max(0, this.p2.hitFlash - dt);

    // 胜负
    if (this.p2.hp <= 0) this.endGame(true, false);
    else if (this.p1.hp <= 0) this.endGame(false, false);
    else if (this.elapsed >= GAME_DURATION) this.endGame(this.p1.hp >= this.p2.hp, true);
  }

  updatePlayer(dt) {
    const p = this.p1;
    let dx = 0, dy = 0;
    const k = this.keys;
    if (k['a'] || k['arrowleft']) dx -= 1;
    if (k['d'] || k['arrowright']) dx += 1;
    if (k['w'] || k['arrowup']) dy -= 1;
    if (k['s'] || k['arrowdown']) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      p.x += (dx / len) * PLAYER_SPEED * dt;
      p.y += (dy / len) * PLAYER_SPEED * dt;
      p.facing = dx !== 0 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      p.aim = { x: dx / len, y: dy / len };
      p.moving = true;
      p.walkTimer += dt;
      if (p.walkTimer > 0.16) { p.walkTimer = 0; p.walkFrame ^= 1; }
    } else {
      p.moving = false;
    }
    p.x = Math.max(WALK_P1.minX, Math.min(WALK_P1.maxX, p.x));
    p.y = Math.max(WALK_P1.minY, Math.min(WALK_P1.maxY, p.y));
  }

  updateGrowth(dt) {
    for (const farmer of [this.p1, this.p2]) {
      for (let r = 0; r < FARM_ROWS; r++) {
        for (let c = 0; c < FARM_COLS; c++) {
          const t = farmer.farm[r][c];
          if (!t.plant || t.mature) continue;
          if (t.watered) {
            t.growth += dt;
            t.waterTimer -= dt;
            if (t.waterTimer <= 0) t.watered = false;
            if (t.growth >= t.maxGrowth) {
              t.growth = t.maxGrowth;
              t.mature = true;
              t.watered = false;
            }
          }
        }
      }
    }
  }

  // 翻地需要长按 E（松开或换地块都会重新计时）
  updateTillHold(dt) {
    const p = this.p1;
    const target = this.targetTile;
    const tile = target ? p.farm[target.r][target.c] : null;
    const holding = this.keys['e'] && tile && !tile.tilled && p.interactCd <= 0;
    if (!holding) {
      p.tillHold = 0;
      p.tillTileKey = null;
      return;
    }

    // 踩着的地块变了就重新计时，避免进度跨地块累计
    const key = `${target.r},${target.c}`;
    if (p.tillTileKey !== key) { p.tillTileKey = key; p.tillHold = 0; }

    p.tillHold += dt;
    if (p.tillHold < TILL_HOLD_TIME) return;

    p.tillHold = 0;
    p.tillTileKey = null;
    p.interactCd = 0.25;
    tile.tilled = true;
    tile.idleTimer = 0;
    this.spawnParticles(
      p.farmX + target.c * CELL + CELL / 2,
      p.farmY + target.r * CELL + CELL / 2,
      '#8A6B4A', 8
    );
    audio.sfx('till');
    this.toast('🪓 翻地完成', '#D7B377');
  }

  // 翻好的地太久没种会自己荒废（变回未耕种）
  updateTilledIdle(dt) {
    for (const farmer of [this.p1, this.p2]) {
      for (let r = 0; r < FARM_ROWS; r++) {
        for (let c = 0; c < FARM_COLS; c++) {
          const t = farmer.farm[r][c];
          if (!t.tilled || t.plant) { t.idleTimer = 0; continue; }
          t.idleTimer = (t.idleTimer || 0) + dt;
          if (t.idleTimer >= TILL_IDLE_TIME) {
            t.tilled = false;
            t.idleTimer = 0;
            audio.sfx('revert', 0.7);
            this.spawnParticles(
              farmer.farmX + c * CELL + CELL / 2,
              farmer.farmY + r * CELL + CELL / 2,
              '#8A6B4A', 6
            );
          }
        }
      }
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const px = p.x, py = p.y;
      p.t += dt;
      p.life -= dt;

      // 大蒜走正弦蛇形轨迹：位置 = 出生点 + 沿方向推进 + 垂直方向的波偏移
      let nx, ny;
      if (p.sine) {
        p.dist += p.spd * dt;
        const off = Math.sin(p.t * Math.PI * 2 * p.sine.freq) * p.sine.amp;
        nx = p.sx + p.dx * p.dist - p.dy * off;
        ny = p.sy + p.dy * p.dist + p.dx * off;
      } else {
        nx = p.x + p.vx * dt;
        ny = p.y + p.vy * dt;
      }

      const target = p.from === 'p1' ? this.p2 : this.p1;

      // 命中角色（扫掠检测：蓄力后速度很快，逐帧点判定会穿透）
      let playerHit = false;
      const d = segPointDist(target.x, target.y - 14, px, py, nx, ny);
      if (d < 16 && !p.hitPlayer) {
        this.handleHit(p, target);
        playerHit = true;
      }

      p.x = nx;
      p.y = ny;

      if (playerHit) {
        if (p.pierce) {
          p.hitPlayer = true;   // 胡萝卜：穿透目标继续飞，但同一个目标只结算一次
        } else {
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // 砸到对手地里的作物：南瓜碾压路径上所有作物，其余每发最多砸 1 棵
      if (p.plantId === 'pumpkin' || !p.pierced) {
        if (this.tryHitCrop(p, target)) {
          if (p.plantId === 'garlic') {
            this.projectiles.splice(i, 1);   // 大蒜碰到作物立即消失
            continue;
          }
          if (p.plantId !== 'pumpkin') p.pierced = true;
        }
      }

      // 飞出 / 落地
      if (p.life <= 0 || p.x < -20 || p.x > CANVAS_W + 20 || p.y < HUD_H - 20 || p.y > SHOP_Y + 20) {
        this.landProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // 玉米连发队列：按蓄力逐枚射出（蓄满 5 枚）
  updateBursts(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.timer -= dt;
      if (b.timer > 0) continue;
      this.spawnCornShot(b);
      b.remaining--;
      b.timer = 0.09;
      if (b.remaining <= 0) this.bursts.splice(i, 1);
    }
  }

  spawnCornShot(b) {
    const plant = PLANT_TYPES[b.plantId];
    const spread = (Math.random() - 0.5) * 0.06;
    const cos = Math.cos(spread), sin = Math.sin(spread);
    const dx = b.dx * cos - b.dy * sin;
    const dy = b.dx * sin + b.dy * cos;
    const speed = plant.speed * 42 * b.power;
    this.projectiles.push({
      x: b.x,
      y: b.y,
      vx: dx * speed,
      vy: dy * speed,
      power: b.power,
      t: 0,
      life: 3.5,
      damage: plant.damage,
      color: plant.color,
      plantId: b.plantId,
      from: b.from,
      size: 5,
    });
  }

  // 辣椒灼烧：持续掉血（整数结算，避免 HP 出现小数）
  updateDot(dt) {
    for (const p of [this.p1, this.p2]) {
      if (p.dotTimer <= 0) continue;
      p.dotTimer -= dt;
      p.dotAcc += p.dotDps * dt;
      const whole = Math.floor(p.dotAcc);
      if (whole > 0) {
        p.dotAcc -= whole;
        p.hp = Math.max(0, p.hp - whole);
        this.spawnParticles(p.x, p.y - 16, '#FF7043', 2);
      }
      p.hitFlash = Math.max(p.hitFlash, 0.1);   // 灼烧期间持续红闪
      if (p.dotTimer <= 0) {
        p.dotTimer = 0;
        p.dotDps = 0;
        p.dotAcc = 0;
      }
    }
  }

  handleHit(proj, target) {
    // 土豆：飞行越久伤害越高（0.35/秒，最多 2 倍）
    let dmg = proj.damage;
    if (proj.plantId === 'potato') dmg = Math.round(proj.damage * Math.min(2, 1 + proj.t * 0.35));
    target.hp = Math.max(0, target.hp - dmg);
    target.hitFlash = 0.3;
    audio.sfx(target.role === 'p1' ? 'hurt' : 'hit');

    // 辣椒：命中后持续灼烧（5 伤害/秒，持续 4 秒）
    if (proj.plantId === 'pepper') {
      target.dotTimer = 4;
      target.dotDps = 5;
    }

    this.spawnParticles(proj.x, proj.y - 10, proj.color, 10);
    this.shake = 0.15;
    this.toast(`${target.role === 'p1' ? '你' : '对手'}受到 ${dmg} 伤害！`, '#FF8A80');
  }

  // 飞过对手地块时砸掉作物（自己的地不会被自己的蔬菜砸坏）
  tryHitCrop(proj, target) {
    const col = Math.floor((proj.x - target.farmX) / CELL);
    const row = Math.floor((proj.y - target.farmY) / CELL);
    if (row < 0 || row >= FARM_ROWS || col < 0 || col >= FARM_COLS) return false;
    const tile = target.farm[row][col];
    if (!tile.plant) return false;

    const pid = tile.plant;
    tile.plant = null;
    tile.growth = 0;
    tile.mature = false;
    tile.watered = false;
    tile.idleTimer = 0;   // 被砸空的地重新开始计算荒废时间
    // 辣椒烧毁地块：必须重新翻地才能再种
    if (proj.plantId === 'pepper') tile.tilled = false;
    this.spawnParticles(proj.x, proj.y, PLANT_TYPES[pid].color, 8);
    audio.sfx('smash');
    this.toast(`摧毁了对手的${PLANT_TYPES[pid].name}！`, '#81C784');
    return true;
  }

  landProjectile(proj) {
    this.spawnParticles(proj.x, proj.y, proj.color, 5);
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        life: 0.3 + Math.random() * 0.3,
        color,
        size: 2 + Math.random() * 2,
      });
    }
  }

  toast(text, color = '#fff') {
    this.toasts.push({ text, color, life: 1.8, maxLife: 1.8 });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  // ===== 交互 =====
  // 交互目标就是角色脚下踩着的那块地
  getTargetTile(farmer) {
    const col = Math.floor((farmer.x - farmer.farmX) / CELL);
    const row = Math.floor((farmer.y - farmer.farmY) / CELL);
    if (row >= 0 && row < FARM_ROWS && col >= 0 && col < FARM_COLS) return { r: row, c: col };
    return null;
  }

  tileAction(tile) {
    if (!tile.tilled) return '翻地';
    if (!tile.plant) return '播种';
    if (tile.mature) return '收获';
    if (!tile.watered) return '浇水';
    return null;
  }

  tryInteract() {
    const p = this.p1;
    if (p.interactCd > 0) return;
    const target = this.targetTile;
    if (!target) {
      this.toast('站到自家农田的地块上按 E', '#FFD700');
      return;
    }
    const tile = p.farm[target.r][target.c];
    const tx = p.farmX + target.c * CELL + CELL / 2;
    const ty = p.farmY + target.r * CELL + CELL / 2;

    if (!tile.tilled) {
      this.toast('长按 E 翻地', '#D7B377');
    } else if (!tile.plant) {
      const pid = p.selected;
      if ((p.seeds[pid] || 0) > 0) {
        p.seeds[pid]--;
        tile.plant = pid;
        tile.growth = 0;
        tile.maxGrowth = PLANT_TYPES[pid].growthTime;
        tile.watered = false;
        tile.mature = false;
        tile.idleTimer = 0;
        p.interactCd = 0.25;
        this.spawnParticles(tx, ty, '#8BC34A', 6);
        audio.sfx('plant');
        this.toast(`🌱 种下${PLANT_TYPES[pid].name}（按 E 浇水）`, '#8BC34A');
      } else {
        audio.sfx('deny');
        this.toast(`没有${PLANT_TYPES[pid].name}种子，点下方按钮购买`, '#FF8A80');
      }
    } else if (tile.mature) {
      const pid = tile.plant;
      tile.plant = null;
      tile.growth = 0;
      tile.mature = false;
      tile.watered = false;
      tile.idleTimer = 0;   // 收完的地重新开始计算荒废时间
      p.veggies[pid] = (p.veggies[pid] || 0) + 1;
      p.coins += 2;
      p.interactCd = 0.25;
      this.spawnParticles(tx, ty, PLANT_TYPES[pid].color, 10);
      audio.sfx('harvest');
      this.toast(`🥕 收获${PLANT_TYPES[pid].name}！左键投掷`, PLANT_TYPES[pid].color);
    } else if (!tile.watered) {
      tile.watered = true;
      tile.waterTimer = WATER_DURATION;
      p.interactCd = 0.25;
      this.spawnParticles(tx, ty, '#64B5F6', 8);
      audio.sfx('water');
      this.toast('💧 浇水完成', '#64B5F6');
    } else {
      this.toast('作物正在生长中...', '#AAA');
    }
  }

  // 投掷方向 = 角色当前瞄准方向（跟随移动方向），不再自动追踪对手
  getAimDir(farmer) {
    const a = farmer.aim;
    if (a && (a.x !== 0 || a.y !== 0)) {
      const len = Math.hypot(a.x, a.y) || 1;
      return { x: a.x / len, y: a.y / len };
    }
    if (farmer.facing === 'up') return { x: 0, y: -1 };
    if (farmer.facing === 'down') return { x: 0, y: 1 };
    if (farmer.facing === 'left') return { x: -1, y: 0 };
    return { x: 1, y: 0 };
  }

  // dir 省略时退回角色当前朝向；威力由蓄力进度决定（未蓄力 1 倍，满蓄力 MAX_POWER 倍）
  throwVeggie(farmer, plantId, dir) {
    if (!farmer.veggies[plantId] || farmer.veggies[plantId] <= 0) return;
    farmer.veggies[plantId]--;
    if (farmer.veggies[plantId] <= 0) delete farmer.veggies[plantId];
    farmer.throwCd = 0.5;

    const plant = PLANT_TYPES[plantId];
    const ratio = Math.min(1, (farmer.charge || 0) / plant.chargeTime);
    const power = 1 + (MAX_POWER - 1) * ratio;

    const d = dir || this.getAimDir(farmer);
    const len = Math.hypot(d.x, d.y) || 1;
    const dx = d.x / len, dy = d.y / len;

    farmer.charge = 0;
    farmer.charging = false;
    farmer.aim = { x: dx, y: dy };
    farmer.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');

    const sx = farmer.x, sy = farmer.y - 18;

    // 玉米：按蓄力连发 1~5 枚（蓄满 5 枚），交给连发队列逐枚射出
    if (plantId === 'corn') {
      const shots = 1 + Math.floor(ratio * 4);
      this.bursts.push({
        plantId,
        from: farmer.role,
        x: sx, y: sy,
        dx, dy,
        power,
        remaining: shots,
        timer: 0,
      });
      this.spawnParticles(sx, sy, plant.color, 4);
      audio.sfx('throw');
      return;
    }

    // 南瓜：滚得慢，蓄力对速度的加成封顶 1.5 倍
    const speedMul = plantId === 'pumpkin' ? Math.min(power, 1.5) : power;
    const speed = plant.speed * 42 * speedMul;

    const proj = {
      x: sx,
      y: sy,
      vx: dx * speed,
      vy: dy * speed,
      power,
      t: 0,
      life: 3.5,
      damage: plant.damage,
      color: plant.color,
      plantId,
      from: farmer.role,
      size: plantId === 'pumpkin' ? 12 : 5,
    };

    // 胡萝卜：穿透目标继续飞
    if (plantId === 'carrot') proj.pierce = true;

    // 大蒜：正弦蛇形轨迹（碰到作物或玩家都会消失）
    if (plantId === 'garlic') {
      proj.spd = speed;
      proj.sx = sx;
      proj.sy = sy;
      proj.dx = dx;
      proj.dy = dy;
      proj.dist = 0;
      proj.sine = { amp: 26, freq: 2.2 };
    }

    this.projectiles.push(proj);

    this.spawnParticles(sx, sy, plant.color, 4);
    audio.sfx('throw');
  }

  // 朝鼠标点击位置投掷（左键）
  throwAt(mx, my) {
    const p = this.p1;
    if (this.ended || p.throwCd > 0) return;

    let pid = null;
    if ((p.veggies[p.selected] || 0) > 0) pid = p.selected;
    else pid = Object.keys(p.veggies).find(k => p.veggies[k] > 0);
    if (!pid) {
      this.toast('没有蔬菜可投掷，先收获成熟作物', '#FF8A80');
      return;
    }

    let dx = mx - p.x;
    let dy = my - (p.y - 14);
    let d = Math.hypot(dx, dy);
    if (d < 6) {
      const f = this.getAimDir(p);
      dx = f.x; dy = f.y; d = 1;
    }
    this.throwVeggie(p, pid, { x: dx / d, y: dy / d });
  }

  // ===== 商店 =====
  buySeed(pid) {
    const p = this.p1;
    p.selected = pid;
    const plant = PLANT_TYPES[pid];
    if (p.coins >= plant.cost) {
      p.coins -= plant.cost;
      p.seeds[pid] = (p.seeds[pid] || 0) + 1;
      audio.sfx('buy');
      this.toast(`购买了${plant.name}种子（💰${plant.cost}）`, '#FFD700');
    } else {
      audio.sfx('deny');
      this.toast('金币不足！', '#FF8A80');
    }
  }

  handleShopClick(x, y) {
    const btnW = 50, btnH = 26, gap = 1, x0 = 10, y0 = SHOP_Y + 6;
    for (let i = 0; i < PLANT_ORDER.length; i++) {
      const bx = x0 + i * (btnW + gap);
      if (x >= bx && x < bx + btnW && y >= y0 && y < y0 + btnH) {
        this.buySeed(PLANT_ORDER[i]);
        return true;
      }
    }
    return false;
  }

  // ===== 键盘 =====
  handleKey(k) {
    if (k === 'm') {
      const muted = audio.toggleMute();
      this.toast(muted ? '🔇 已静音' : '🔊 音乐已开启', '#FFD700');
      return;
    }
    if (this.ended) return;
    if (k >= '1' && k <= '6') {
      const pid = PLANT_ORDER[parseInt(k) - 1];
      this.p1.selected = pid;
      audio.sfx('click');
      this.toast(`选中 ${PLANT_TYPES[pid].name}`, PLANT_TYPES[pid].color);
      return;
    }
    if (k === 'e') this.tryInteract();
  }

  // ===== 结束 =====
  endGame(p1Won, timeUp) {
    if (this.ended) return;
    this.ended = true;

    const goTitle = document.getElementById('gameover-title');
    const goMsg = document.getElementById('gameover-message');
    const goOverlay = document.getElementById('gameover-overlay');

    if (timeUp) {
      if (goTitle) goTitle.textContent = p1Won ? '⏰ 时间到 - 你赢了！' : '⏰ 时间到 - 你输了...';
    } else {
      if (goTitle) goTitle.textContent = p1Won ? '🎉 你赢了！' : '💀 你输了...';
    }
    if (goMsg) {
      goMsg.textContent = `剩余 HP — 你: ${this.p1.hp} / 对手: ${this.p2.hp}　|　收获蔬菜: ${this.countVeggies(this.p1)} 个`;
    }
    if (goOverlay) goOverlay.style.display = 'flex';
    audio.sfx(p1Won ? 'win' : 'lose');
    console.log('Game ended, winner:', p1Won ? 'p1' : 'p2');
  }

  countVeggies(farmer) {
    return Object.values(farmer.veggies).reduce((a, b) => a + b, 0);
  }

  // ===== 渲染 =====
  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    }
    ctx.clearRect(-4, -4, CANVAS_W + 8, CANVAS_H + 8);

    this.drawGround(ctx);
    this.drawFarm(ctx, this.p1);
    this.drawFarm(ctx, this.p2);
    this.drawTargetHighlight(ctx);

    this.drawFarmer(ctx, this.p2);
    this.drawFarmer(ctx, this.p1);
    this.drawChargeBar(ctx, this.p2, Math.round(this.p2.x), Math.round(this.p2.y));
    this.drawChargeBar(ctx, this.p1, Math.round(this.p1.x), Math.round(this.p1.y));
    this.drawAimIndicator(ctx);

    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    ctx.restore();

    ctx.drawImage(vignetteTex, 0, 0);   // 暗角（在 HUD 之下，保证文字清晰）
    this.drawHUD(ctx);
    this.drawShop(ctx);
    this.drawToasts(ctx);
  }

  drawGround(ctx) {
    ctx.drawImage(groundTex, 0, 0);
  }


  drawFarm(ctx, farmer) {
    const fx = farmer.farmX, fy = farmer.farmY;
    const w = FARM_COLS * CELL, h = FARM_ROWS * CELL;

    // 土地底色已烘焙进地面贴图，这里只画动态内容
    // 标签
    ctx.fillStyle = farmer.role === 'p1' ? '#E3F2FD' : '#FFEBEE';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(farmer.role === 'p1' ? '你的农场' : '对手农场', fx + w / 2, fy - 10);
    ctx.textAlign = 'start';

    for (let r = 0; r < FARM_ROWS; r++) {
      for (let c = 0; c < FARM_COLS; c++) {
        const x = fx + c * CELL;
        const y = fy + r * CELL;
        const tile = farmer.farm[r][c];

        // 地块贴图（三种状态预渲染）
        const tt = !tile.tilled ? tileTex.untilled : (tile.watered ? tileTex.watered : tileTex.tilled);
        ctx.drawImage(tt, x + 1, y + 1);

        // 翻好但一直没种：快到荒废时间时闪褐色警示
        if (tile.tilled && !tile.plant) {
          const idle = tile.idleTimer || 0;
          if (idle > TILL_IDLE_TIME * 0.6) {
            const pulse = 0.5 + Math.sin(performance.now() / 140) * 0.5;
            ctx.fillStyle = `rgba(90,60,25,${0.18 + pulse * 0.22})`;
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
            ctx.fillStyle = `rgba(255,190,90,${0.55 + pulse * 0.45})`;
            ctx.font = 'bold 9px monospace';
            ctx.fillText('⌛', x + 3, y + 12);
          }
        }

        // 作物
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
            // 缺水提示
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
    if (!this.targetTile) return;
    const t = this.targetTile;
    const tile = this.p1.farm[t.r][t.c];
    const x = this.p1.farmX + t.c * CELL;
    const y = this.p1.farmY + t.r * CELL;
    const pulse = 0.5 + Math.sin(performance.now() / 200) * 0.3;

    ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);

    const action = this.tileAction(tile);
    if (action) {
      const label = (tile.tilled ? 'E ' : '长按E ') + action;
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

    // 长按翻地的进度条
    if (!tile.tilled && this.p1.tillHold > 0) {
      const prog = Math.min(1, this.p1.tillHold / TILL_HOLD_TIME);
      const bw = CELL - 8, bh = 5;
      const bx = x + 4, by = y + CELL - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#D7B377';
      ctx.fillRect(bx, by, bw * prog, bh);
    }
  }

  drawFarmer(ctx, farmer) {
    const x = Math.round(farmer.x);
    const y = Math.round(farmer.y);
    const isP1 = farmer.role === 'p1';
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

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 受击闪红
    const flashing = farmer.hitFlash > 0 && Math.floor(performance.now() / 60) % 2 === 0;

    // 腿
    const legOff = farmer.moving ? (farmer.walkFrame === 1 ? 1 : -1) : 0;
    ctx.fillStyle = pants;
    ctx.fillRect(-4 + legOff, -5, 3, 5);
    ctx.fillRect(1 - legOff, -5, 3, 5);
    // 鞋
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
    // 背带裤
    ctx.fillStyle = pants;
    ctx.fillRect(-5, -8, 10, 4);
    ctx.fillRect(-4, -14, 2, 7);
    ctx.fillRect(2, -14, 2, 7);
    ctx.fillStyle = pantsDark;
    ctx.fillRect(-5, -5, 10, 1);

    // 手臂
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

    // 脸
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
    const hasVeg = (farmer.veggies[farmer.selected] || 0) > 0;
    if (hasVeg) {
      const tex = itemTextures[farmer.selected];
      if (tex) {
        const hx = farmer.facing === 'left' ? -14 : 5;
        ctx.drawImage(tex, hx, -19, 9, 9);
      }
    }

    ctx.restore();

    // 名字
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isP1 ? '#BBDEFB' : '#FFCDD2';
    ctx.fillText(farmer.name, x, y - 32);
    ctx.textAlign = 'start';
  }

  // 背包里有蔬菜时，用渐隐的小点显示"左键会朝哪扔"（指向鼠标位置）
  drawAimIndicator(ctx) {
    const p = this.p1;
    if (this.ended || !this.mouse) return;
    const hasVeg = Object.values(p.veggies).some(v => v > 0);
    if (!hasVeg) return;

    let dx = this.mouse.x - p.x;
    let dy = this.mouse.y - (p.y - 16);
    const len = Math.hypot(dx, dy);
    if (len < 6) {
      const f = this.getAimDir(p);
      dx = f.x; dy = f.y;
    } else {
      dx /= len; dy /= len;
    }

    // 蓄力越满，指示点越远（预示射程）
    const sel = PLANT_TYPES[p.selected];
    const ratio = sel ? Math.min(1, p.charge / sel.chargeTime) : 0;
    const spread = 1 + ratio * 1.5;
    const full = ratio >= 1;

    ctx.fillStyle = full ? '#FF5252' : '#FFD700';
    for (let i = 1; i <= 3; i++) {
      const d = (12 + i * 9) * spread;
      const px = p.x + dx * d;
      const py = (p.y - 16) + dy * d;
      ctx.globalAlpha = 0.75 - i * 0.18;
      ctx.beginPath();
      ctx.arc(px, py, 2.6 - i * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 蓄力条（角色头顶）
  drawChargeBar(ctx, farmer, x, y) {
    const charge = farmer.charge || 0;
    if (charge <= 0 && !farmer.charging) return;
    const sel = PLANT_TYPES[farmer.selected] || PLANT_TYPES.carrot;
    const ratio = Math.min(1, charge / sel.chargeTime);
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
    for (const p of this.projectiles) {
      const bob = Math.sin(p.t * 12) * 1.5;
      // 土豆：飞行越久涨得越大（1 倍 → 2 倍）；南瓜：巨型滚动弹
      const scale = p.plantId === 'potato' ? Math.min(2, 1 + p.t * 0.35)
                  : p.plantId === 'pumpkin' ? 2 : 1;
      const w = 18 * scale, h = 18 * scale;
      // 地面阴影（南瓜的 size 本身就更大）
      const shScale = p.plantId === 'potato' ? scale : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 10, (p.size * 0.8) * shScale, (p.size * 0.4) * shScale, 0, 0, Math.PI * 2);
      ctx.fill();
      // 蔬菜本体（用成熟形态的像素图，飞出去也认得出是什么菜）
      const tex = itemTextures[p.plantId];
      if (tex) {
        ctx.drawImage(tex, Math.round(p.x - w / 2), Math.round(p.y - 15 + bob - (h - 18) / 2), w, h);
      }
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawHUD(ctx) {
    // 顶部栏
    ctx.fillStyle = 'rgba(20,30,15,0.85)';
    ctx.fillRect(0, 0, CANVAS_W, HUD_H);
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, HUD_H - 2, CANVAS_W, 2);

    // 玩家 HP
    this.drawHPBar(ctx, 8, 6, this.p1, false);
    // 对手 HP
    this.drawHPBar(ctx, CANVAS_W - 8 - 120, 6, this.p2, true);

    // 计时器
    const rem = Math.max(0, GAME_DURATION - this.elapsed);
    const m = Math.floor(rem / 60);
    const s = Math.floor(rem % 60);
    ctx.fillStyle = rem < 30 ? '#FF5252' : '#FFF';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${m}:${s.toString().padStart(2, '0')}`, CANVAS_W / 2, 19);
    ctx.textAlign = 'start';

    // 金币阶段提示（每过一个阶段被动金币 +0.3/秒）
    const stage = coinStageAt(this.elapsed) + 1;
    const rate = coinRateAt(this.elapsed);
    ctx.fillStyle = '#FFD54F';
    ctx.font = '8px monospace';
    ctx.fillText(`阶段 ${stage}/${COIN_STAGE_COUNT} · 金币 +${rate.toFixed(1)}/秒`, CANVAS_W / 2 + 34, 19);

    // 静音状态（M 键切换）
    ctx.font = '10px monospace';
    ctx.fillText(audio.isMuted() ? '\u{1F507}' : '\u{1F50A}', CANVAS_W - 8 - 120 - 18, 19);
  }

  drawHPBar(ctx, x, y, farmer, alignRight) {
    const w = 120, h = 9;
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, h);
    const pct = farmer.hp / PLAYER_HP;
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
    // 底部栏
    ctx.fillStyle = 'rgba(20,30,15,0.9)';
    ctx.fillRect(0, SHOP_Y, CANVAS_W, CANVAS_H - SHOP_Y);
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, SHOP_Y, CANVAS_W, 2);

    const p = this.p1;
    const btnW = 50, btnH = 26, gap = 1, x0 = 10, y0 = SHOP_Y + 6;

    for (let i = 0; i < PLANT_ORDER.length; i++) {
      const pid = PLANT_ORDER[i];
      const plant = PLANT_TYPES[pid];
      const bx = x0 + i * (btnW + gap);
      const canAfford = p.coins >= plant.cost;
      const isSel = p.selected === pid;
      const seedCount = p.seeds[pid] || 0;

      ctx.fillStyle = isSel ? 'rgba(255,215,0,0.25)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(bx, y0, btnW, btnH);
      ctx.strokeStyle = isSel ? '#FFD700' : canAfford ? '#666' : '#444';
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(bx, y0, btnW, btnH);

      // 蔬菜图标（买不起时压暗）
      const tex = itemTextures[pid];
      if (tex) {
        ctx.globalAlpha = canAfford ? 1 : 0.35;
        ctx.drawImage(tex, bx + 3, y0 + 3, 9, 9);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = canAfford ? '#EEE' : '#777';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`${i + 1}.${plant.name}`, bx + 14, y0 + 9);

      ctx.fillStyle = canAfford ? '#FFD700' : '#777';
      ctx.font = '8px monospace';
      ctx.fillText(`💰${plant.cost} x${seedCount}`, bx + 3, y0 + 20);
    }

    // 蔬菜背包（可投掷）
    const vx0 = x0 + PLANT_ORDER.length * (btnW + gap) + 8;
    ctx.fillStyle = '#AAA';
    ctx.font = '8px monospace';
    ctx.fillText('背包(左键投掷):', vx0, y0 + 9);

    let vx = vx0;
    const vy = y0 + 13;
    for (const pid of PLANT_ORDER) {
      const count = p.veggies[pid] || 0;
      if (count <= 0) continue;
      const isSel = p.selected === pid;
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

// ===== 入口 =====
console.log('SP game module loaded (Stardew style)');

const canvas = document.getElementById('game-canvas');
const lobbyOverlay = document.getElementById('lobby-overlay');
const gameOverOverlay = document.getElementById('gameover-overlay');
const playerNameInput = document.getElementById('player-name');

if (!canvas) console.error('Canvas not found!');
if (playerNameInput) playerNameInput.value = '玩家' + Math.floor(Math.random() * 1000);

let game = null;

const spBtn = document.getElementById('single-player-btn');
console.log('Single player button found:', !!spBtn);

if (spBtn) {
  spBtn.addEventListener('click', () => {
    console.log('=== SINGLE PLAYER BUTTON CLICKED ===');
    try {
      const name = playerNameInput ? (playerNameInput.value.trim() || '测试玩家') : '测试玩家';
      lobbyOverlay.style.display = 'none';
      if (game) game.destroy();
      game = new SinglePlayerGame(canvas, name);
      window.__game = game;
      game.start();
      console.log('=== GAME STARTED SUCCESSFULLY ===');
    } catch (err) {
      console.error('=== ERROR STARTING SINGLE PLAYER ===');
      console.error(err);
      alert('单人模式启动失败: ' + err.message);
      if (lobbyOverlay) lobbyOverlay.style.display = 'flex';
    }
  });
}

// 键盘
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
    e.preventDefault();
  }
  if (!game || game.ended) return;
  game.keys[k] = true;
  if (k === ' ') game.p1.charging = true;   // 长按空格蓄力
  if (!e.repeat) game.handleKey(k);
});

window.addEventListener('keyup', (e) => {
  if (!game) return;
  const k = e.key.toLowerCase();
  game.keys[k] = false;
  if (k === ' ') game.p1.charging = false;  // 松手保留已有蓄力
});

// 窗口失焦时清空按键，避免按键卡住
window.addEventListener('blur', () => {
  if (game) {
    game.keys = {};
    game.p1.charging = false;
  }
});

// 鼠标：左键朝鼠标位置投掷，右键点底部购买种子
function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
  if (!game || game.ended) return;
  game.mouse = canvasPos(e);
});

canvas.addEventListener('mousedown', (e) => {
  if (!game || game.ended) return;
  const { x, y } = canvasPos(e);
  game.mouse = { x, y };

  if (e.button === 0) {          // 左键：朝点击位置发射
    game.throwAt(x, y);
    return;
  }
  if (e.button === 2 && y >= SHOP_Y) {   // 右键：购买种子
    e.preventDefault();
    game.handleShopClick(x, y);
  }
});

// 重新开始
const restartBtn = document.getElementById('restart-btn');
if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    location.reload();
  });
}

console.log('SP game setup complete');
