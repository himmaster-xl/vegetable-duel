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

    // 被动金币：每秒 +1
    this.coinAcc += dt;
    if (this.coinAcc >= 1) {
      this.coinAcc -= 1;
      this.players.p1.coins += 1;
      this.players.p2.coins += 1;
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

    // 飞弹
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const nx = proj.x + proj.vx * dt;
      const ny = proj.y + proj.vy * dt;
      proj.t = (proj.t || 0) + dt;
      proj.life -= dt;

      const target = this.players[proj.from === 'p1' ? 'p2' : 'p1'];
      // 扫掠判定：蓄力后速度可达 3 倍，一帧位移 30px 左右，逐帧点判定会穿透
      const d = segPointDist(target.x, target.y - 14, proj.x, proj.y, nx, ny);
      if (d < 18) {
        target.hp = Math.max(0, target.hp - proj.damage);
        this.spawnParticles(nx, ny - 10, proj.color, 10);
        this.projectiles.splice(i, 1);
        continue;
      }

      proj.x = nx;
      proj.y = ny;

      // 飞行途中砸到对手地里的作物（每发最多砸掉 1 棵）
      if (!proj.pierced && this.tryHitCrop(proj, target)) proj.pierced = true;

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
    return true;
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

  move(playerId, x, y, facing, charge) {
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
    const speed = plant.speed * 42 * pw;

    this.projectiles.push({
      x: p.x,
      y: p.y - 18,
      vx: dx * speed,
      vy: dy * speed,
      power: pw,
      t: 0,
      life: 3.5,
      damage: plant.damage,
      color: plant.color,
      plantId: pid,
      from: p.role,
      size: pid === 'pumpkin' ? 7 : 5,
    });
    return { ok: true };
  }

  // 统一入口
  action(playerRole, action, params) {
    switch (action) {
      case 'move': return this.move(playerRole, params.x, params.y, params.facing, params.charge);
      case 'buy': return this.buySeed(playerRole, params.plantId);
      case 'till': return this.till(playerRole, params.row, params.col);
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
