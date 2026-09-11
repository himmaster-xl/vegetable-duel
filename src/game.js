import { Network } from './network.js';
import { Renderer } from './renderer.js';
import { PLANT_ORDER, PLANT_TYPES } from './constants.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.net = new Network();
    this.renderer = new Renderer(canvas);

    // 游戏状态
    this.state = null;
    this.role = null;
    this.roomId = null;

    // UI 状态
    this.showShop = false;
    this.selectedSeed = null;  // 当前选中的种子类型
    this.shopSelectedPlant = null;

    // 操作冷却
    this.lastActionTime = 0;
  }

  async start(playerName, roomId = null) {
    await this.net.connect();
    this.setupHandlers();

    // 发送加入请求
    if (roomId) {
      this.net.join(playerName, roomId);
    } else {
      this.net.join(playerName);
    }
  }

  setupHandlers() {
    this.net.on('joined', (msg) => {
      this.role = msg.role;
      this.roomId = msg.roomId;
    });

    this.net.on('state', (msg) => {
      this.state = msg.state;
      this.renderer._lastRole = this.role;
    });

    this.net.on('error', (msg) => {
      console.warn('服务器错误:', msg.message);
    });
  }

  run() {
    const loop = () => {
      this.update();
      requestAnimationFrame(loop);
    };
    loop();
  }

  update() {
    if (!this.state) return;

    if (this.state.state === 'waiting') {
      this.drawLobby();
    } else if (this.state.state === 'playing' || this.state.state === 'ended') {
      this.renderer.render(this.state, this.role);
      this.drawShop();
    }
  }

  // ===== 渲染 =====

  drawLobby() {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#2E7D32';
    ctx.fillRect(0, 0, 640, 360);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🥬 蔬菜大作战', 320, 100);

    ctx.fillStyle = '#FFF';
    ctx.font = '14px monospace';
    ctx.fillText(`你的身份: ${this.role === 'p1' ? '左侧玩家 (蓝色)' : '右侧玩家 (红色)'}`, 320, 150);
    ctx.fillText(`房间: ${this.roomId}`, 320, 180);
    ctx.fillText('等待对手加入...', 320, 210);

    ctx.textAlign = 'start';
  }

  drawShop() {
    const ctx = this.renderer.ctx;
    const player = this.state.players[this.role];
    if (!player) return;

    // 商店背景
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 300, 200, 60);

    // 种子按钮
    const startX = 10;
    const btnWidth = 80;
    const btnHeight = 20;
    const gap = 2;

    for (let i = 0; i < PLANT_ORDER.length; i++) {
      const plantId = PLANT_ORDER[i];
      const plant = PLANT_TYPES[plantId];
      const btnX = startX + i * (btnWidth + gap);
      const btnY = 322;

      const canAfford = player.coins >= plant.cost;
      const isSelected = this.shopSelectedPlant === plantId;

      ctx.fillStyle = isSelected ? 'rgba(255,215,0,0.3)' : canAfford ? 'rgba(255,255,255,0.2)' : 'rgba(100,100,100,0.3)';
      ctx.fillRect(btnX, btnY, btnWidth, btnHeight);

      ctx.strokeStyle = isSelected ? '#FFD700' : '#666';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(btnX, btnY, btnWidth, btnHeight);

      ctx.fillStyle = canAfford ? plant.color : '#666';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`${plant.name}`, btnX + 2, btnY + 8);

      ctx.fillStyle = canAfford ? '#FFD700' : '#666';
      ctx.font = '8px monospace';
      ctx.fillText(`💰${plant.cost}`, btnX + 2, btnY + 17);
    }

    // 选中种子提示
    if (this.selectedSeed) {
      const plant = PLANT_TYPES[this.selectedSeed];
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`已选: ${plant.name} - 点击地块种植`, 10, 352);
    }

    // 操作提示
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px monospace';
    ctx.fillText('点击成熟植物★发射 | 点击空地块种植', 210, 352);
  }

  // ===== 输入处理 =====

  handleClick(x, y) {
    if (!this.state || this.state.state !== 'playing') return;

    // 检查点击是否在左侧场地 (p1)
    if (y >= 30 && y < 30 + 3 * 40 && x >= 0 && x < 5 * 40) {
      const col = Math.floor(x / 40);
      const row = Math.floor((y - 30) / 40);
      if (row >= 0 && row < 3 && col >= 0 && col < 5) {
        if (this.role === 'p1') {
          this.handleFieldClick('p1', row, col, x, y);
          return;
        }
      }
    }

    // 检查点击是否在右侧场地 (p2)
    if (y >= 30 && y < 30 + 3 * 40 && x >= 320 && x < 320 + 5 * 40) {
      const col = Math.floor((x - 320) / 40);
      const row = Math.floor((y - 30) / 40);
      if (row >= 0 && row < 3 && col >= 0 && col < 5) {
        if (this.role === 'p2') {
          this.handleFieldClick('p2', row, col, x, y);
          return;
        }
      }
    }
  }

  handleFieldClick(playerRole, row, col, clickX, clickY) {
    if (playerRole !== this.role) return;

    const cell = this.state.players[playerRole].field[row][col];
    if (!cell) return;

    // 如果有选中的种子，尝试种植
    if (this.selectedSeed && cell.plant === null) {
      this.net.plant(row, col, this.selectedSeed);
      this.selectedSeed = null;
      return;
    }

    // 如果是成熟的植物，尝试发射
    if (cell.plant && cell.growth >= cell.maxGrowth) {
      // 计算发射方向
      const startX = col * 40 + 20 + (playerRole === 'p2' ? 320 : 0);
      const startY = row * 40 + 30 + 20;

      // 瞄准方向：鼠标位置
      let targetX = clickX;
      let targetY = clickY;

      // 限制发射方向（不能向后射）
      if (playerRole === 'p1' && targetX < startX) targetX = startX + 50;
      if (playerRole === 'p2' && targetX > startX) targetX = startX - 50;
      targetY = Math.max(30, Math.min(30 + 3 * 40, targetY));

      this.net.fire(row, col, targetX, targetY);
      return;
    }

    // 未成熟的植物：选中提示
    if (cell.plant) {
      this.selectedSeed = null;
    }
  }

  // 商店购买
  handleShopClick(x, y) {
    const btnWidth = 80;
    const btnHeight = 20;
    const gap = 2;

    for (let i = 0; i < PLANT_ORDER.length; i++) {
      const plantId = PLANT_ORDER[i];
      const btnX = 10 + i * (btnWidth + gap);
      const btnY = 322;

      if (x >= btnX && x < btnX + btnWidth && y >= btnY && y < btnY + btnHeight) {
        this.net.buy(plantId);
        this.shopSelectedPlant = plantId;
        this.selectedSeed = plantId;
        return;
      }
    }
  }
}
