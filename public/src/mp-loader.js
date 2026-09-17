// ============================================
// 蔬菜大作战 - 多人联机模式加载器
// 仅在用户选择联机时加载
// ============================================

import { MPGame } from './mp-game.js?v=8';

const lobbyOverlay = document.getElementById('lobby-overlay');
const waitingOverlay = document.getElementById('waiting-overlay');
const gameOverOverlay = document.getElementById('gameover-overlay');
const canvas = document.getElementById('game-canvas');

console.log('MP Loader loaded');

let currentGame = null;

function showWaiting(roomId) {
  const text = document.getElementById('waiting-text');
  const room = document.getElementById('waiting-room');
  const urlEl = document.getElementById('waiting-url');
  if (text) text.textContent = '等待对手加入...（把房间号告诉对手）';
  if (room) room.textContent = roomId ? `房间号: ${roomId}` : '';
  if (urlEl) {
    fetch('/api/lan').then(r => r.json()).then(data => {
      const addrs = (data && data.addresses) || [];
      if (!addrs.length) { urlEl.textContent = ''; return; }
      const port = data.port;
      const isLan = (n) => /wlan|wi-?fi|无线|以太网|ethernet/i.test(n);
      const lan = addrs.filter(a => isLan(a.name));
      const other = addrs.filter(a => !isLan(a.name));
      const lines = [];
      if (lan.length) lines.push(`同一 Wi-Fi / 热点下，朋友用浏览器打开: ${lan.map(a => `http://${a.address}:${port}/`).join(' 或 ')}`);
      if (other.length) lines.push(`异地联机（双方都装 Radmin VPN 并加入同一网络）: ${other.map(a => `http://${a.address}:${port}/`).join(' 或 ')}`);
      lines.push('打开后输入上面的房间号');
      urlEl.innerHTML = lines.join('<br>');
    }).catch(() => { urlEl.textContent = ''; });
  }
  lobbyOverlay.style.display = 'none';
  waitingOverlay.style.display = 'flex';
}

function hideWaiting() {
  waitingOverlay.style.display = 'none';
}

function startMP(name, roomId) {
  if (currentGame) currentGame.destroy();
  currentGame = new MPGame(canvas);
  window.__mpGame = currentGame;

  currentGame.onJoined = (msg) => {
    // 服务器先广播 state 再发 joined，若已开始则不要再显示等待界面
    if (!currentGame.started) showWaiting(msg.roomId);
  };
  currentGame.onReady = () => {
    hideWaiting();
  };

  currentGame.start(name, roomId).catch((err) => {
    console.error('连接失败:', err);
    alert('连接服务器失败: ' + err.message);
    waitingOverlay.style.display = 'none';
    lobbyOverlay.style.display = 'flex';
  });
}

// 创建房间（双人联机按钮）
document.getElementById('multi-player-btn')?.addEventListener('click', () => {
  console.log('Creating multiplayer room...');
  const name = document.getElementById('player-name')?.value.trim() || '玩家1';
  startMP(name, null);
});

// 加入房间
document.getElementById('join-room-btn')?.addEventListener('click', () => {
  console.log('Joining multiplayer room...');
  const name = document.getElementById('player-name')?.value.trim() || '玩家2';
  const roomId = document.getElementById('room-id-input')?.value.trim();
  if (!roomId) {
    alert('请输入房间号');
    return;
  }
  startMP(name, roomId);
});

// 重新开始
document.getElementById('restart-btn')?.addEventListener('click', () => {
  if (currentGame) currentGame.destroy();
  if (gameOverOverlay) gameOverOverlay.style.display = 'none';
  location.reload();
});

// 键盘 (多人联机)
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
    e.preventDefault();
  }
  if (!currentGame || currentGame.ended) return;
  currentGame.keys[k] = true;
  if (k === ' ') currentGame.charging = true;   // 长按空格蓄力
  if (!e.repeat) currentGame.handleKey(k);
});

window.addEventListener('keyup', (e) => {
  if (!currentGame) return;
  const k = e.key.toLowerCase();
  currentGame.keys[k] = false;
  if (k === ' ') currentGame.charging = false;  // 松手保留已有蓄力
});

window.addEventListener('blur', () => {
  if (currentGame) {
    currentGame.keys = {};
    currentGame.charging = false;
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
  if (!currentGame || currentGame.ended) return;
  currentGame.mouse = canvasPos(e);
});

canvas.addEventListener('mousedown', (e) => {
  if (!currentGame || currentGame.ended) return;
  const { x, y } = canvasPos(e);
  currentGame.mouse = { x, y };

  if (e.button === 0) {          // 左键：朝点击位置发射
    currentGame.throwAt(x, y);
    return;
  }
  const SHOP_Y = 302;
  if (e.button === 2 && y >= SHOP_Y) {   // 右键：购买种子
    e.preventDefault();
    currentGame.handleShopClick(x, y);
  }
});

console.log('MP Loader ready');
