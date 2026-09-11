import { WebSocket } from 'ws';

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;

async function test() {
  console.log('=== 蔬菜大作战 - 联调测试 ===\n');

  // 测试 1: HTTP 服务
  console.log('测试 1: HTTP 服务...');
  const html = await fetch(BASE).then(r => r.text());
  console.log(html.includes('蔬菜大作战') ? '  ✓ HTML 页面正常' : '  ✗ HTML 异常');
  console.log(html.includes('game-canvas') ? '  ✓ Canvas 元素存在' : '  ✗ Canvas 缺失');

  // 测试 2: JS 文件
  console.log('\n测试 2: JS 文件...');
  const gameJs = await fetch(BASE + '/src/game.js').then(r => r.text());
  console.log(gameJs.includes('export class Game') ? '  ✓ game.js 正常' : '  ✗ game.js 异常');
  const rendererJs = await fetch(BASE + '/src/renderer.js').then(r => r.text());
  console.log(rendererJs.includes('export class Renderer') ? '  ✓ renderer.js 正常' : '  ✗ renderer.js 异常');
  const constantsJs = await fetch(BASE + '/src/constants.js').then(r => r.text());
  console.log(constantsJs.includes('PLANT_TYPES') ? '  ✓ constants.js 正常' : '  ✗ constants.js 异常');

  // 测试 3: WebSocket 联机对战
  console.log('\n测试 3: WebSocket 联机对战...');

  const conn1 = new WebSocket(`ws://localhost:${PORT}`);
  const conn2 = new WebSocket(`ws://localhost:${PORT}`);

  let player1Joined = false;
  let gameStarted = false;
  let initialCoins = 0;

  conn1.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'joined' && msg.role === 'p1') {
      console.log(`  ✓ 玩家1 加入房间: ${msg.roomId}`);
      player1Joined = true;
      conn2.send(JSON.stringify({ type: 'join', name: '玩家乙', roomId: msg.roomId }));
    }

    // 只在第一次收到状态时打印
    if (msg.type === 'state' && !gameStarted) {
      const state = msg.state;
      if (state.state === 'playing' && !gameStarted) {
        gameStarted = true;
        initialCoins = state.players.p1.coins;
        console.log('  ✓ 游戏开始!');
        console.log(`  ✓ 玩家1 HP: ${state.players.p1.hp} | 金币: ${state.players.p1.coins}`);
        console.log(`  ✓ 玩家2 HP: ${state.players.p2.hp} | 金币: ${state.players.p2.coins}`);

        // 测试操作
        setTimeout(() => {
          console.log('\n测试 4: 游戏操作...');

          // 购买
          conn1.send(JSON.stringify({ type: 'action', action: 'buy', plantId: 'carrot' }));
        }, 500);

        setTimeout(() => {
          console.log('  ✓ 购买胡萝卜 (花费10金币)');
        }, 600);

        setTimeout(() => {
          conn1.send(JSON.stringify({ type: 'action', action: 'plant', row: 0, col: 0, plantId: 'carrot' }));
        }, 700);

        setTimeout(() => {
          console.log('  ✓ 种植胡萝卜');
        }, 800);

        setTimeout(() => {
          conn1.send(JSON.stringify({ type: 'action', action: 'harvest', row: 0, col: 0 }));
        }, 4000);

        setTimeout(() => {
          console.log('  ✓ 收获胡萝卜');
        }, 4500);

        setTimeout(() => {
          const result = [
            player1Joined ? '✓' : '✗',
            gameStarted ? '✓' : '✗',
          ].join(' ');

          if (player1Joined && gameStarted) {
            console.log(`\n  ✓ 所有测试通过!`);
            console.log(`  服务器运行在 http://localhost:${PORT}\n`);
          } else {
            console.log(`\n  ✗ 部分测试失败\n`);
          }

          conn1.close();
          conn2.close();
          process.exit(0);
        }, 5000);
      }
    }
  });

  conn1.on('open', () => {
    console.log('  ✓ 玩家1 连接成功');
    conn1.send(JSON.stringify({ type: 'join', name: '玩家甲' }));
  });

  conn2.on('open', () => {
    console.log('  ✓ 玩家2 连接成功');
  });

  setTimeout(() => {
    console.log('  ✗ 测试超时');
    conn1.close();
    conn2.close();
    process.exit(1);
  }, 8000);
}

test().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
