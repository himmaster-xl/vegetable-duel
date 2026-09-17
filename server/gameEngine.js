import {
  GRID_COLS, GRID_ROWS, PLAYER_HP, STARTING_COINS, GAME_DURATION,
  PLANT_TYPES, PLANT_ORDER,
} from '../src/constants.js';

const CELL = 40;
const P1_FARM = { x: 40, y: 52 };
const P2_FARM = { x: 360, y: 52 };
const WALK = {
  p1: { minX: 24, maxX: 304, minY: 52, maxY: 288 },
  p2: { minX: 336, maxX: 616, minY: 52, maxY: 288 },
};
const TICK_MS = 40;           // 25 fps 服务端模拟
const WATER_DURATION = 6;     // 一次浇水维持 6 秒生长
const INTERACT_RANGE = 70;    // 角色到地块中心允许的最大交互距离
const ACTION_CD = 220;        // 操作冷却 ms
const THROW_CD = 400;         // 投掷冷却 ms
const MAX_POWER = 3;          // 满蓄力速度倍数
const TILL_IDLE_TIME = 15;    // 翻好的地多久没种就自动变回未耕种（秒）
const TILL_HOLD_TIME = 0.5;   // 翻地需要长按 E 的秒数
const COIN_BASE_RATE = 1;     // 基础被动金币（枚/秒）
const COIN_STAGE_COUNT = 4;   // 金币速度分 4 个阶段
const COIN_STAGE_BONUS = 0.3; // 每过一个阶段金币速度 +0.3/秒

// 当前被动金币速度：基础速度起步，每过一个阶段 +0.3
function coinRateAt(elapsed) {
  const stage = Math.min(
    COIN_STAGE_COUNT - 1,
    Math.floor(elapsed / (GAME_DURATION / COIN_STAGE_COUNT))
  );
  return COIN_BASE_RATE + stage * COIN_STAGE_BONUS;
}

// 点到线段的距离（用于高速飞弹的扫掠命中判定）
function segPointDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function createField() {
  const f = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    f[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      f[r][c] = {
        tilled: false,
        plant: null,
        growth: 0,
        maxGrowth: 0,
        watered: false,
        waterTimer: 0,
        mature: false,
        idleTimer: 0,   // 翻好但没种地的持续时间，超过 TILL_IDLE_TIME 就荒废
      };
    }
  }
  return f;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class GameEngine {
  constructor(gameId, player1, player2) {
    this.gameId = gameId;
    this.state = 'waiting';

    this.players = {
      p1: this.createPlayer(player1, 'p1'),
      p2: this.createPlayer(player2, 'p2'),
    };

    this.projectiles = [];
    this.particles = [];
    this.bursts = [];     // 玉米连发队列
    this.elapsed = 0;
    this.lastTick = Date.now();
    this.coinAcc = 0;
    this.winner = null;

    this.interval = null;
  }

  createPlayer(player, role) {
    const walk = WALK[role];
    return {
      id: player.id,
      name: player.name,
      role,
      x: Math.round((walk.minX + walk.maxX) / 2),
      y: 282,
      facing: 'down',
      hp: PLAYER_HP,
      coins: STARTING_COINS,
      field: createField(),
      seeds: { carrot: 2, corn: 2, potato: 1 },
      veggies: {},
      charge: 0,          // 蓄力进度 0~1（客户端上报，用于给对手显示蓄力条）
      dotTimer: 0,        // 辣椒灼烧剩余时间
      dotDps: 0,          // 灼烧每秒伤害
      dotAcc: 0,          // 灼烧伤害的小数累加器（保证 HP 是整数）
      tillHold: 0,        // 长按 E 翻地的进度（秒）
      tillHoldKey: null,  // 进度对应的地块，换地块要重新计时
      tillTarget: null,   // 客户端上报的正在按住的地块
      tillTargetAt: 0,    // 最近一次上报时间（用于判断是否还在按住）
      lastActionAt: 0,
      lastMoveAt: 0,
    };
  }

  start() {
    this.state = 'playing';
    this.lastTick = Date.now();
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.state = 'ended';
  }

  farmOrigin(role) {
    return role === 'p1' ? P1_FARM : P2_FARM;
  }

  tick() {
    if (this.state !== 'playing') return;

    const now = Date.now();
    let dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (dt > 0.1) dt = 0.1;
    this.elapsed += dt;

    // 被动金币：分 4 个阶段，每过一个阶段速度 +0.3/秒
    this.coinAcc += coinRateAt(this.elapsed) * dt;
    const wholeCoins = Math.floor(this.coinAcc);
    if (wholeCoins > 0) {
      this.coinAcc -= wholeCoins;
      this.players.p1.coins += wholeCoins;
      this.players.p2.coins += wholeCoins;
    }

    // 翻好的地太久没种会自己荒废（变回未耕种）
    for (const p of Object.values(this.players)) {
      const origin = this.farmOrigin(p.role);
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const t = p.field[r][c];
          if (!t.tilled || t.plant) { t.idleTimer = 0; continue; }
          t.idleTimer = (t.idleTimer || 0) + dt;
          if (t.idleTimer >= TILL_IDLE_TIME) {
            t.tilled = false;
            t.idleTimer = 0;
            this.spawnParticles(
              origin.x + c * CELL + CELL / 2,
              origin.y + r * CELL + CELL / 2,
              '#8A6B4A', 6
            );
          }
        }
      }
    }

    // 生长（只有浇水后才生长）
    for (const p of Object.values(this.players)) {
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const t = p.field[r][c];
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

    // 长按 E 翻地：客户端持续上报按住的地块，服务端自己累计时间
    for (const p of Object.values(this.players)) {
      const tt = p.tillTarget;
      const fresh = tt && (now - (p.tillTargetAt || 0)) < 250;
      if (!fresh) { p.tillHold = 0; p.tillHoldKey = null; continue; }
      const tile = p.field[tt.row] && p.field[tt.row][tt.col];
      if (!tile || tile.tilled || !this.nearTile(p, tt.row, tt.col)) {
        p.tillHold = 0;
        p.tillHoldKey = null;
        continue;
      }
      // 换到别的地块就重新计时，避免进度跨地块累计
      const key = `${tt.row},${tt.col}`;
      if (p.tillHoldKey !== key) { p.tillHoldKey = key; p.tillHold = 0; }
      p.tillHold += dt;
      if (p.tillHold >= TILL_HOLD_TIME) {
        p.tillHold = 0;
        p.tillHoldKey = null;
        this.till(p.role, tt.row, tt.col);   // 复用同一套校验与粒子
      }
    }

    // 玉米连发队列（按蓄力连发 1~5 枚）
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.timer -= dt;
      if (b.timer > 0) continue;
      this.spawnCornShot(b);
      b.remaining--;
      b.timer = 0.09;
      if (b.remaining <= 0) this.bursts.splice(i, 1);
    }

    // 辣椒灼烧：持续掉血（按整数结算，避免 HP 出现小数）
    for (const p of Object.values(this.players)) {
      if (p.dotTimer <= 0) continue;
      p.dotTimer -= dt;
      p.dotAcc += p.dotDps * dt;
      const whole = Math.floor(p.dotAcc);
      if (whole > 0) {
        p.dotAcc -= whole;
        p.hp = Math.max(0, p.hp - whole);
        this.spawnParticles(p.x, p.y - 16, '#FF7043', 2);
      }
      if (p.dotTimer <= 0) {
        p.dotTimer = 0;
        p.dotDps = 0;
        p.dotAcc = 0;
      }
    }

    // 飞弹
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.t = (proj.t || 0) + dt;
      proj.life -= dt;

      // 大蒜走正弦蛇形轨迹：位置 = 出生点 + 沿方向推进 + 垂直方向的波偏移
      let nx, ny;
      if (proj.sine) {
        proj.dist += proj.spd * dt;
        const off = Math.sin(proj.t * Math.PI * 2 * proj.sine.freq) * proj.sine.amp;
        nx = proj.sx + proj.dx * proj.dist - proj.dy * off;
        ny = proj.sy + proj.dy * proj.dist + proj.dx * off;
      } else {
        nx = proj.x + proj.vx * dt;
        ny = proj.y + proj.vy * dt;
      }

      const target = this.players[proj.from === 'p1' ? 'p2' : 'p1'];
      // 扫掠判定：蓄力后速度可达 3 倍，一帧位移 30px 左右，逐帧点判定会穿透
      let playerHit = false;
      const d = segPointDist(target.x, target.y - 14, proj.x, proj.y, nx, ny);
      if (d < 18 && !proj.hitPlayer) {
        // 土豆：飞行越久伤害越高（0.35/秒，最多 2 倍）
        let dmg = proj.damage;
        if (proj.plantId === 'potato') {
          dmg = Math.round(proj.damage * Math.min(2, 1 + proj.t * 0.35));
        }
        target.hp = Math.max(0, target.hp - dmg);

        // 辣椒：命中玩家后持续灼烧（5 伤害/秒，持续 4 秒）
        if (proj.plantId === 'pepper') {
          target.dotTimer = 4;
          target.dotDps = 5;
        }

        this.spawnParticles(proj.x, proj.y - 10, proj.color, 10);
        playerHit = true;
      }

      proj.x = nx;
      proj.y = ny;

      if (playerHit) {
        if (proj.pierce) {
          proj.hitPlayer = true;   // 胡萝卜：穿透目标继续飞，但同一个目标只结算一次
        } else {
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // 砸到对手地里的作物：南瓜碾压路径上所有作物，其余每发最多砸 1 棵
      if (proj.plantId === 'pumpkin' || !proj.pierced) {
        if (this.tryHitCrop(proj, target)) {
          if (proj.plantId === 'garlic') {
            this.projectiles.splice(i, 1);   // 大蒜碰到作物立即消失
            continue;
          }
          if (proj.plantId !== 'pumpkin') proj.pierced = true;
        }
      }

      if (proj.life <= 0 || proj.x < -20 || proj.x > 660 || proj.y < 8 || proj.y > 322) {
        this.spawnParticles(proj.x, proj.y, proj.color, 5);
        this.projectiles.splice(i, 1);
      }
    }

    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.life -= dt;
      if (part.life <= 0) this.particles.splice(i, 1);
    }

    // 胜负
    const p1Dead = this.players.p1.hp <= 0;
    const p2Dead = this.players.p2.hp <= 0;
    const timeUp = this.elapsed >= GAME_DURATION;
    if (p1Dead || p2Dead || timeUp) {
      this.endGame(p1Dead, p2Dead, timeUp);
    }
  }

  // 飞过对手地块时砸掉作物（自己的地不会被自己的蔬菜砸坏）
  tryHitCrop(proj, target) {
    const origin = this.farmOrigin(target.role);
    const col = Math.floor((proj.x - origin.x) / CELL);
    const row = Math.floor((proj.y - origin.y) / CELL);
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return false;
    const tile = target.field[row][col];
    if (!tile.plant) return false;

    this.spawnParticles(proj.x, proj.y, PLANT_TYPES[tile.plant].color, 8);
    tile.plant = null;
    tile.growth = 0;
    tile.mature = false;
    tile.watered = false;
    tile.idleTimer = 0;   // 被砸空的地重新开始计算荒废时间
    // 辣椒烧毁地块：必须重新翻地才能再种
    if (proj.plantId === 'pepper') tile.tilled = false;
    return true;
  }

  // 玉米连发：从队列里射出一枚（同方向带一点随机散布）
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

  // ===== 玩家操作 =====

  move(playerId, x, y, facing, charge, till) {
    const p = this.players[playerId];
    if (!p || this.state !== 'playing') return { ok: false, reason: '无效' };
    if (typeof x !== 'number' || typeof y !== 'number' ||
        !isFinite(x) || !isFinite(y)) {
      return { ok: false, reason: '无效坐标' };
    }
    const w = WALK[p.role];
    p.x = clamp(x, w.minX, w.maxX);
    p.y = clamp(y, w.minY, w.maxY);
    if (['up', 'down', 'left', 'right'].includes(facing)) p.facing = facing;
    // 蓄力进度（0~1，仅用于给对手显示蓄力条）
    const c = Number(charge);
    p.charge = isFinite(c) ? clamp(c, 0, 1) : 0;
    // 长按翻地：客户端随移动一起上报当前按住的地块，null 表示没按
    const target = till && Number.isInteger(till.row) && Number.isInteger(till.col)
      ? { row: till.row, col: till.col }
      : null;
    p.tillTarget = target;
    p.tillTargetAt = target ? Date.now() : 0;
    return { ok: true };
  }

  nearTile(p, row, col) {
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return false;
    const origin = this.farmOrigin(p.role);
    const cx = origin.x + col * CELL + CELL / 2;
    const cy = origin.y + row * CELL + CELL / 2;
    return Math.hypot(p.x - cx, p.y - cy) <= INTERACT_RANGE;
  }

  canAct(p, cd) {
    const now = Date.now();
    if (now - p.lastActionAt < cd) return false;
    p.lastActionAt = now;
    return true;
  }

  buySeed(playerId, plantId) {
    const p = this.players[playerId];
    if (!p) return { ok: false, reason: '玩家不存在' };
    if (this.state !== 'playing') return { ok: false, reason: '游戏未开始' };
    const plant = PLANT_TYPES[plantId];
    if (!plant) return { ok: false, reason: '未知蔬菜' };
    if (p.coins < plant.cost) return { ok: false, reason: '金币不足' };
    p.coins -= plant.cost;
    p.seeds[plantId] = (p.seeds[plantId] || 0) + 1;
    return { ok: true };
  }

  till(playerId, row, col) {
    const p = this.players[playerId];
    if (!p) return { ok: false, reason: '玩家不存在' };
    if (this.state !== 'playing') return { ok: false, reason: '游戏未开始' };
    if (!this.nearTile(p, row, col)) return { ok: false, reason: '距离太远' };
    if (!this.canAct(p, ACTION_CD)) return { ok: false, reason: '操作太快' };

    const tile = p.field[row][col];
    if (tile.tilled) return { ok: false, reason: '已经翻过地了' };
    tile.tilled = true;
    tile.idleTimer = 0;
    this.spawnParticles(
      this.farmOrigin(p.role).x + col * CELL + CELL / 2,
      this.farmOrigin(p.role).y + row * CELL + CELL / 2,
      '#8A6B4A', 8
    );
    return { ok: true };
  }

  plant(playerId, row, col, plantId) {
    const p = this.players[playerId];
    if (!p) return { ok: false, reason: '玩家不存在' };
    if (this.state !== 'playing') return { ok: false, reason: '游戏未开始' };
    if (!this.nearTile(p, row, col)) return { ok: false, reason: '距离太远' };
    if (!this.canAct(p, ACTION_CD)) return { ok: false, reason: '操作太快' };

    const tile = p.field[row][col];
    if (!tile.tilled) return { ok: false, reason: '需要先翻地' };
    if (tile.plant) return { ok: false, reason: '已有作物' };

    const plant = PLANT_TYPES[plantId];
    if (!plant) return { ok: false, reason: '未知蔬菜' };
    if ((p.seeds[plantId] || 0) <= 0) return { ok: false, reason: '种子不足' };

    p.seeds[plantId]--;
    tile.plant = plantId;
    tile.growth = 0;
    tile.maxGrowth = plant.growthTime;
    tile.watered = false;
    tile.mature = false;
    tile.idleTimer = 0;
    return { ok: true };
  }

  water(playerId, row, col) {
    const p = this.players[playerId];
    if (!p) return { ok: false, reason: '玩家不存在' };
    if (this.state !== 'playing') return { ok: false, reason: '游戏未开始' };
    if (!this.nearTile(p, row, col)) return { ok: false, reason: '距离太远' };
    if (!this.canAct(p, ACTION_CD)) return { ok: false, reason: '操作太快' };

    const tile = p.field[row][col];
    if (!tile.plant) return { ok: false, reason: '没有作物' };
    if (tile.mature) return { ok: false, reason: '已经成熟' };
    if (tile.watered) return { ok: false, reason: '已经浇过水了' };

    tile.watered = true;
    tile.waterTimer = WATER_DURATION;
    return { ok: true };
  }

  harvest(playerId, row, col) {
    const p = this.players[playerId];
    if (!p) return { ok: false, reason: '玩家不存在' };
    if (this.state !== 'playing') return { ok: false, reason: '游戏未开始' };
    if (!this.nearTile(p, row, col)) return { ok: false, reason: '距离太远' };
    if (!this.canAct(p, ACTION_CD)) return { ok: false, reason: '操作太快' };

    const tile = p.field[row][col];
    if (!tile.plant) return { ok: false, reason: '没有作物' };
    if (!tile.mature) return { ok: false, reason: '还没成熟' };

    const pid = tile.plant;
    tile.plant = null;
    tile.growth = 0;
    tile.mature = false;
    tile.watered = false;
    tile.idleTimer = 0;   // 收完的地重新开始计算荒废时间
    p.veggies[pid] = (p.veggies[pid] || 0) + 1;
    p.coins += 2;
    return { ok: true, plantId: pid };
  }

  throwVeggie(playerId, plantId, dirX, dirY, power) {
    const p = this.players[playerId];
    if (!p) return { ok: false, reason: '玩家不存在' };
    if (this.state !== 'playing') return { ok: false, reason: '游戏未开始' };

    // 蓄力威力：1 倍（未蓄力）~ MAX_POWER 倍（满蓄力）
    let pw = Number(power);
    if (!isFinite(pw) || pw < 1) pw = 1;
    pw = Math.min(MAX_POWER, pw);

    let pid = plantId;
    if (!pid || !(p.veggies[pid] > 0)) {
      pid = Object.keys(p.veggies).find(k => p.veggies[k] > 0);
    }
    if (!pid) return { ok: false, reason: '没有蔬菜可投掷' };
    if (!this.canAct(p, THROW_CD)) return { ok: false, reason: '投掷太快' };

    p.veggies[pid]--;
    if (p.veggies[pid] <= 0) delete p.veggies[pid];
    p.charge = 0;   // 出手后蓄力清空

    // 投掷方向：客户端上报的鼠标方向，非法时退回角色朝向
    let dx = Number(dirX), dy = Number(dirY);
    const valid = isFinite(dx) && isFinite(dy) && (dx !== 0 || dy !== 0);
    if (!valid) {
      if (p.facing === 'up') { dx = 0; dy = -1; }
      else if (p.facing === 'down') { dx = 0; dy = 1; }
      else if (p.facing === 'left') { dx = -1; dy = 0; }
      else { dx = 1; dy = 0; }
    }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;

    const plant = PLANT_TYPES[pid];
    const sx = p.x, sy = p.y - 18;

    // 玉米：按蓄力连发 1~5 枚（蓄满 5 枚），交给连发队列逐枚射出
    if (pid === 'corn') {
      const ratio = Math.min(1, (pw - 1) / (MAX_POWER - 1));
      const shots = 1 + Math.floor(ratio * 4);
      this.bursts.push({
        plantId: pid,
        from: p.role,
        x: sx, y: sy,
        dx, dy,
        power: pw,
        remaining: shots,
        timer: 0,
      });
      return { ok: true, shots };
    }

    // 南瓜：滚得慢，蓄力对速度的加成封顶 1.5 倍
    const speedMul = pid === 'pumpkin' ? Math.min(pw, 1.5) : pw;
    const speed = plant.speed * 42 * speedMul;

    const proj = {
      x: sx,
      y: sy,
      vx: dx * speed,
      vy: dy * speed,
      power: pw,
      t: 0,
      life: 3.5,
      damage: plant.damage,
      color: plant.color,
      plantId: pid,
      from: p.role,
      size: pid === 'pumpkin' ? 12 : 5,
    };

    // 胡萝卜：穿透目标继续飞
    if (pid === 'carrot') proj.pierce = true;

    // 大蒜：正弦蛇形轨迹（碰到作物或玩家都会消失）
    if (pid === 'garlic') {
      proj.spd = speed;
      proj.sx = sx;
      proj.sy = sy;
      proj.dx = dx;
      proj.dy = dy;
      proj.dist = 0;
      proj.sine = { amp: 26, freq: 2.2 };
    }

    this.projectiles.push(proj);
    return { ok: true };
  }

  // 统一入口
  action(playerRole, action, params) {
    switch (action) {
      case 'move': return this.move(playerRole, params.x, params.y, params.facing, params.charge, params.till);
      case 'buy': return this.buySeed(playerRole, params.plantId);
      case 'till': return { ok: false, reason: '翻地需要长按 E' };
      case 'plant': return this.plant(playerRole, params.row, params.col, params.plantId);
      case 'water': return this.water(playerRole, params.row, params.col);
      case 'harvest': return this.harvest(playerRole, params.row, params.col);
      case 'throw': return this.throwVeggie(playerRole, params.plantId, params.dirX, params.dirY, params.power);
      default: return { ok: false, reason: '未知操作' };
    }
  }

  endGame(p1Dead, p2Dead, timeUp) {
    this.stop();

    if (timeUp) {
      if (this.players.p1.hp > this.players.p2.hp) this.winner = 'p1';
      else if (this.players.p2.hp > this.players.p1.hp) this.winner = 'p2';
    } else if (p1Dead && !p2Dead) this.winner = 'p2';
    else if (p2Dead && !p1Dead) this.winner = 'p1';
  }

  getState() {
    const pack = (p) => ({
      id: p.id,
      name: p.name,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      facing: p.facing,
      hp: p.hp,
      coins: p.coins,
      field: p.field,
      seeds: p.seeds,
      veggies: p.veggies,
      charge: Math.round((p.charge || 0) * 100) / 100,
      dot: Math.round((p.dotTimer || 0) * 10) / 10,
      tillHold: Math.round((p.tillHold || 0) * 100) / 100,
      tillTarget: p.tillTarget || null,
    });

    return {
      state: this.state,
      elapsed: Math.round(this.elapsed * 10) / 10,
      winner: this.winner,
      players: {
        p1: pack(this.players.p1),
        p2: pack(this.players.p2),
      },
      projectiles: this.projectiles.map(pr => ({
        x: Math.round(pr.x * 10) / 10,
        y: Math.round(pr.y * 10) / 10,
        t: pr.t || 0,
        color: pr.color,
        plantId: pr.plantId,
        size: pr.size,
      })),
      particles: this.particles.map(pt => ({
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        life: Math.round(pt.life * 100) / 100,
        color: pt.color,
        size: pt.size,
      })),
    };
  }
}
