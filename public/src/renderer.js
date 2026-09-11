import { GRID_COLS, GRID_ROWS, PLANT_TYPES, PLANT_ORDER, CELL_SIZE } from './constants.js';

const CANVAS_W = 640;
const CANVAS_H = 360;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.scale = 1;
    // 固定画布尺寸，用 CSS 缩放适配屏幕
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.style.imageRendering = 'pixelated';

    this.mouseX = 0;
    this.mouseY = 0;
    this.hoverCell = null;

    // 生长阶段纹理缓存
    this.textures = {};
    this.generateTextures();
  }

  resize() {
    const container = this.canvas.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    const ratio = Math.min(w / CANVAS_W, h / CANVAS_H);

    this.canvas.width = CANVAS_W * this.scale;
    this.canvas.height = CANVAS_H * this.scale;
    this.canvas.style.width = `${CANVAS_W * ratio}px`;
    this.canvas.style.height = `${CANVAS_H * ratio}px`;

    this.offsetX = Math.floor((w - CANVAS_W * ratio) / 2);
    this.offsetY = Math.floor((h - CANVAS_H * ratio) / 2);
  }

  generateTextures() {
    // 为每种蔬菜生成3个生长阶段（发芽/成长/成熟）
    for (const plantId of PLANT_ORDER) {
      const plant = PLANT_TYPES[plantId];
      if (!plant) continue;

      this.textures[plantId] = [];
      for (let stage = 0; stage < 3; stage++) {
        const size = 32;
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const pixelSize = size / 9;
        const pixels = plant.pixelColor;

        // 根据阶段调整透明度
        const alpha = stage === 0 ? 0.3 : stage === 1 ? 0.6 : 1.0;
        const shrink = stage === 0 ? 2 : stage === 1 ? 1 : 0;

        for (let y = shrink; y < 9 - shrink; y++) {
          for (let x = shrink; x < 9 - shrink; x++) {
            if (pixels[y][x] === 'O') {
              if (stage === 2) {
                // 成熟：主体色
                ctx.fillStyle = plant.color;
                ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
              } else {
                // 未成熟：绿色系
                ctx.fillStyle = plant.leafColor;
                ctx.globalAlpha = alpha;
                ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                ctx.globalAlpha = 1;
              }
            }
          }
        }

        // 成熟时加个光晕
        if (stage === 2) {
          ctx.fillStyle = 'rgba(255,255,200,0.3)';
          ctx.beginPath();
          ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
          ctx.fill();
        }

        this.textures[plantId].push(c);
      }
    }
  }

  render(state, role, isMouseDown) {
    const ctx = this.ctx;
    const s = this.scale;

    ctx.clearRect(0, 0, CANVAS_W * s, CANVAS_H * s);
    ctx.save();
    ctx.scale(s, s);

    this.drawBackground();
    this.drawField(state, 'p1');
    this.drawField(state, 'p2');
    this.drawProjectiles(state);
    this.drawParticles(state);
    this.drawUI(state, role);

    ctx.restore();
  }

  drawBackground() {
    const ctx = this.ctx;

    // 天空
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, CANVAS_W, 30);

    // 草地
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, 30, CANVAS_W, 330);

    // 地面纹理（像素风格）
    ctx.fillStyle = '#388E3C';
    for (let x = 0; x < CANVAS_W; x += 20) {
      for (let y = 30; y < 360; y += 20) {
        if ((x + y) % 40 === 0) {
          ctx.fillRect(x, y, 1, 20);
        }
        if ((x + y * 2) % 60 === 0) {
          ctx.fillRect(x, y, 20, 1);
        }
      }
    }

    // 中间分割线
    ctx.fillStyle = '#2E7D32';
    ctx.fillRect(318, 30, 4, 180);
  }

  drawField(state, playerKey) {
    const ctx = this.ctx;
    const player = state.players[playerKey];
    const isOpponent = playerKey !== this._lastRole && role;

    const offsetX = playerKey === 'p1' ? 0 : 320;
    const offsetY = 30;
    const isOpponent = playerKey !== this._lastRole;

    // 地块背景
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const x = offsetX + c * CELL_SIZE;
        const y = offsetY + r * CELL_SIZE;

        const cell = player.field[r][c];

        // 地块底色
        if (cell.plant) {
          ctx.fillStyle = '#5D4037';
        } else {
          ctx.fillStyle = '#6D4C41';
        }
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

        // 地块边框
        ctx.strokeStyle = '#4E342E';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

        // 绘制植物
        if (cell.plant) {
          const plant = PLANT_TYPES[cell.plant];
          const progress = cell.growth / cell.maxGrowth;
          let stage = 0;
          if (progress >= 1) stage = 2; // 成熟
          else if (progress >= 0.33) stage = 1; // 成长中
          else stage = 0; // 刚发芽

          const texture = this.textures[cell.plant]?.[stage];
          if (texture) {
            const texSize = 32;
            const drawX = x + (CELL_SIZE - texSize) / 2;
            const drawY = y + (CELL_SIZE - texSize) / 2;

            if (stage === 2) {
              // 成熟植物有发光效果
              ctx.fillStyle = 'rgba(255,255,100,0.2)';
              ctx.beginPath();
              ctx.arc(drawX + texSize/2, drawY + texSize/2, texSize/2 + 4, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.drawImage(texture, drawX, drawY, texSize, texSize);

            // 成熟标记
            if (stage === 2) {
              ctx.fillStyle = '#FFD700';
              ctx.font = '10px monospace';
              ctx.fillText('★', x + CELL_SIZE - 12, y + 10);
            }
          }
        } else {
          // 空地块：画个小十字表示可种植
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1;
          const cx = x + CELL_SIZE / 2;
          const cy = y + CELL_SIZE / 2;
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy);
          ctx.lineTo(cx + 4, cy);
          ctx.moveTo(cx, cy - 4);
          ctx.lineTo(cx, cy + 4);
          ctx.stroke();
        }
      }
    }

    // 玩家标签
    ctx.fillStyle = playerKey === 'p1' ? '#2196F3' : '#F44336';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${player.name}`, offsetX + 4, offsetY - 5);
  }

  drawProjectiles(state) {
    const ctx = this.ctx;

    for (const proj of state.projectiles) {
      // projectile 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(proj.x + 1, proj.y + 1, proj.size, 0, Math.PI * 2);
      ctx.fill();

      // projectile 本体
      ctx.fillStyle = proj.color;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.size, 0, Math.PI * 2);
      ctx.fill();

      // projectile 高光
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(proj.x - 1, proj.y - 1, proj.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(state) {
    const ctx = this.ctx;

    for (const part of state.particles) {
      ctx.globalAlpha = part.life * 2;
      ctx.fillStyle = part.color;
      ctx.fillRect(part.x - part.size/2, part.y - part.size/2, part.size, part.size);
    }
    ctx.globalAlpha = 1;
  }

  drawUI(state, role) {
    const ctx = this.ctx;

    // 计时器
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    const remaining = Math.max(0, 180 - state.elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, CANVAS_W / 2, 20);
    ctx.textAlign = 'start';

    // 玩家信息
    for (const [key, player] of Object.entries(state.players)) {
      const offsetX = key === 'p1' ? 4 : 324;
      const alpha = key === role ? 1 : 0.7;
      ctx.globalAlpha = alpha;

      // HP 条
      const barX = offsetX;
      const barY = 0;
      const barW = 140;
      const barH = 10;

      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);

      const hpPercent = player.hp / 100;
      ctx.fillStyle = hpPercent > 0.5 ? '#4CAF50' : hpPercent > 0.25 ? '#FF9800' : '#F44336';
      ctx.fillRect(barX, barY, barW * hpPercent, barH);

      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      // HP 文字
      ctx.fillStyle = '#FFF';
      ctx.font = '9px monospace';
      ctx.fillText(`HP: ${player.hp}/${100}`, barX + 2, barY + 8);

      // 金币
      ctx.font = '10px monospace';
      ctx.fillText(`💰 ${player.coins}`, barX, barY + barH + 12);

      // 库存
      if (key === role) {
        let inventoryY = barY + barH + 24;
        ctx.font = '9px monospace';
        for (const plantId of PLANT_ORDER) {
          const plant = PLANT_TYPES[plantId];
          const count = player.inventory?.[plantId] || 0;
          if (count > 0) {
            ctx.fillStyle = plant.color;
            ctx.fillText(`${plant.name} x${count}`, barX, inventoryY);
            inventoryY += 11;
          }
        }
      }

      ctx.globalAlpha = 1;
    }

    // 对手信息（右侧顶部）
    const opponent = state.players[role === 'p1' ? 'p2' : 'p1'];
    if (opponent) {
      const oppX = 480;
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`对手: ${opponent.name}`, oppX, 3);

      const hpPercent = opponent.hp / 100;
      ctx.fillStyle = hpPercent > 0.5 ? '#4CAF50' : hpPercent > 0.25 ? '#FF9800' : '#F44336';
      ctx.fillRect(oppX, 10, 140, 8);
      ctx.fillStyle = '#333';
      ctx.fillRect(oppX, 10, 140, 8);
      ctx.fillStyle = hpPercent > 0.5 ? '#4CAF50' : hpPercent > 0.25 ? '#FF9800' : '#F44336';
      ctx.fillRect(oppX, 10, 140 * hpPercent, 8);
      ctx.strokeStyle = '#FFF';
      ctx.strokeRect(oppX, 10, 140, 8);

      ctx.fillStyle = '#FFD700';
      ctx.font = '9px monospace';
      ctx.fillText(`💰 ${opponent.coins}`, oppX, 30);
    }

    // 游戏结束
    if (state.state === 'ended' && state.winner) {
      const winner = state.players[state.winner];
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, CANVAS_H / 2 - 30, CANVAS_W, 60);

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${winner.name} 获胜！`, CANVAS_W / 2, CANVAS_H / 2 + 8);
      ctx.textAlign = 'start';
    } else if (state.state === 'ended' && !state.winner) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, CANVAS_H / 2 - 30, CANVAS_W, 60);

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('平局！', CANVAS_W / 2, CANVAS_H / 2 + 8);
      ctx.textAlign = 'start';
    }
  }
}
