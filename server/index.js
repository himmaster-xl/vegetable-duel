import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameEngine } from './gameEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use((req, res, next) => {
  if (req.url.match(/\.(js|css|html)$/) || req.url === '/') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});
app.use(express.static(join(__dirname, '../public')));

// 局域网联机地址：供大厅显示，方便房主分享给朋友
app.get('/api/lan', (req, res) => {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (/vmware|vmnet|virtualbox|bluetooth|蓝牙|loopback/i.test(name)) continue;
      addrs.push({ name, address: net.address });
    }
  }
  const score = (n) => (/wlan|wi-?fi|无线|以太网|ethernet/i.test(n) ? 0 : 1);
  addrs.sort((a, b) => score(a.name) - score(b.name));
  res.json({ port: PORT, addresses: addrs });
});

// 房间管理
const rooms = new Map();
let gameCounter = 0;
// 玩家到房间的映射
const playerRooms = new Map();

wss.on('connection', (ws) => {
  let playerId = null;
  let roomId = null;

  function genId() {
    return 'p_' + (++gameCounter) + '_' + Date.now().toString(36);
  }

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join': {
        playerId = genId();
        if (msg.roomId && rooms.has(msg.roomId)) {
          // 加入已有房间
          const room = rooms.get(msg.roomId);
          if (room.p1 && !room.p2) {
            roomId = room.roomId;
            playerRooms.set(playerId, roomId);
            room.p2 = { id: playerId, name: msg.name || '玩家2', ws };
            if (room.p1.ws.readyState === 1 && room.p2.ws.readyState === 1) {
              room.engine = new GameEngine(room.roomId, room.p1, room.p2);
              room.engine.start();
              // 先下发身份，再开始同步状态，避免客户端在拿到 role 前收到 state
              ws.send(JSON.stringify({ type: 'joined', id: playerId, role: 'p2', roomId: msg.roomId }));
              room.p1.ws.send(JSON.stringify({ type: 'joined', id: room.p1.id, role: 'p1', roomId: msg.roomId }));
              broadcastState(room);
              room.broadcastTimer = setInterval(() => {
                if (!room.engine || room.engine.state === 'ended') {
                  clearInterval(room.broadcastTimer);
                  room.broadcastTimer = null;
                  broadcastState(room);
                  return;
                }
                broadcastState(room);
              }, 40);
            }
          } else {
            ws.send(JSON.stringify({ type: 'error', message: '房间已满或不存在' }));
          }
        } else {
          // 创建新房间
          roomId = msg.roomId || 'room_' + Date.now().toString(36);
          const room = { roomId, p1: { id: playerId, name: msg.name || '玩家1', ws }, p2: null, engine: null };
          rooms.set(roomId, room);
          playerRooms.set(playerId, roomId);
          ws.send(JSON.stringify({ type: 'joined', id: playerId, role: 'p1', roomId }));
        }
        break;
      }

      case 'action': {
        if (!roomId || !rooms.has(roomId)) {
          ws.send(JSON.stringify({ type: 'error', message: '不在游戏中' }));
          break;
        }
        const room = rooms.get(roomId);
        if (!room || !room.engine) {
          ws.send(JSON.stringify({ type: 'error', message: '游戏尚未开始' }));
          break;
        }

        const { action, ...params } = msg;
        const playerRole = ws === room.p1?.ws ? 'p1' : 'p2';

        const result = room.engine.action(playerRole, action, params);

        // move 不回报错误也不广播（高频，由定时广播统一发送）
        if (action === 'move') break;

        if (!result.ok && result.reason) {
          ws.send(JSON.stringify({ type: 'error', message: result.reason }));
        }

        broadcastState(room);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (playerId) playerRooms.delete(playerId);
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      if (room.p1?.ws === ws) room.p1 = null;
      if (room.p2?.ws === ws) room.p2 = null;

      if (room.broadcastTimer) {
        clearInterval(room.broadcastTimer);
        room.broadcastTimer = null;
      }

      const other = room.p1?.ws === ws ? room.p2 : room.p1;
      if (other && room.engine && (room.p1 === null || room.p2 === null)) {
        room.engine.endGame(room.p1 === null, room.p2 === null, false);
        if (other.ws.readyState === 1) {
          other.ws.send(JSON.stringify({ type: 'gameOver', winner: room.engine.winner }));
        }
        broadcastState(room);
        room.engine.stop();
      }

      if ((!room.p1 && !room.p2) || room.engine?.state === 'ended') {
        rooms.delete(roomId);
      }
    }
  });
});

function broadcastState(room) {
  if (!room.engine) return;
  const state = room.engine.getState();
  const data = JSON.stringify({ type: 'state', state });

  if (room.p1?.ws?.readyState === 1) room.p1.ws.send(data);
  if (room.p2?.ws?.readyState === 1) room.p2.ws.send(data);
}

server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  局域网(${name}): http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('把上面的局域网地址发给朋友，同一网络下用浏览器打开即可一起玩');
});
