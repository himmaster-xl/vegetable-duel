// 蔬菜大作战 · 一键启动器（由 启动服务器.bat 调用）
// 中文界面放在这里而不是 .bat 里：cmd 解析 UTF-8 批处理会乱码，Node 输出中文则始终正常。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const URL = `http://localhost:${PORT}/`;
// 测试用：设 NO_BROWSER=1 时不自动开浏览器
const NO_BROWSER = process.argv.includes('--no-browser') || process.env.NO_BROWSER === '1';

process.title = '蔬菜大作战 - 服务器';

function isPortBusy(port) {
  return new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port });
    const done = (v) => {
      try { sock.destroy(); } catch { /* ignore */ }
      resolve(v);
    };
    sock.setTimeout(700);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

function openBrowser(url) {
  if (NO_BROWSER) return;
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch { /* 打不开浏览器不影响服务器 */ }
}

async function main() {
  console.log('');
  console.log('  ========================================');
  console.log('      🥕  蔬菜大作战 · 一键启动');
  console.log('  ========================================');
  console.log('');

  if (await isPortBusy(PORT)) {
    console.log('  服务器已经在运行，正在打开浏览器...');
    console.log(`  ${URL}`);
    openBrowser(URL);
    return;
  }

  if (!existsSync(join(ROOT, 'node_modules'))) {
    console.log('  [首次运行] 正在安装依赖，请稍候...');
    const r = spawnSync('npm', ['install'], { cwd: ROOT, stdio: 'inherit', shell: true });
    if (r.status !== 0) {
      console.error('  [错误] 依赖安装失败，请检查网络后重试。');
      process.exit(1);
    }
  }

  console.log('  正在启动服务器...（关闭此窗口即停止服务器）');
  console.log('  把下面显示的局域网地址发给朋友，同一网络下即可一起玩。');
  console.log('');
  setTimeout(() => openBrowser(URL), 1500);

  await import(pathToFileURL(join(ROOT, 'server', 'index.js')).href);
}

main();
