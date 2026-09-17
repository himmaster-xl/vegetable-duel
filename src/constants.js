// 游戏常量配置

export const CELL_SIZE = 40;
export const GRID_COLS = 5;
export const GRID_ROWS = 5;
export const PLAYER_HP = 100;
export const STARTING_COINS = 50;
export const PASSIVE_COIN_TICK = 2;       // 每 200ms 被动+2金币
export const PASSIVE_COIN_INTERVAL = 200; // 被动金币间隔 ms
export const GAME_DURATION = 180;         // 总时长 180 秒

export const PLANT_TYPES = {
  carrot: {
    id: 'carrot',
    name: '胡萝卜',
    cost: 10,
    damage: 10,
    growthTime: 3,     // 秒
    speed: 4,          // 像素/帧
    color: '#FF6B35',
    leafColor: '#4CAF50',
    pixelColor: [
      '........',
      '..OO....',
      '.OOOO...',
      '.OOOOO..',
      '..OOO...',
      '...OO...',
      '....OO..',
      '.....OO.',
      '......OO',
    ],
  },
  potato: {
    id: 'potato',
    name: '土豆',
    cost: 20,
    damage: 20,
    growthTime: 5,
    speed: 3,
    color: '#8B5E3C',
    leafColor: '#66BB6A',
    pixelColor: [
      '........',
      '..OOOO..',
      '.OOOOOO.',
      'OOOOOOOO',
      'OOOOOOOO',
      '.OOOOOO.',
      '..OOOO..',
      '........',
      '........',
    ],
  },
  pepper: {
    id: 'pepper',
    damage: 15,
    cost: 30,
    growthTime: 6,
    speed: 3,
    splashRadius: 1,   // 爆炸范围
    color: '#E53935',
    leafColor: '#2E7D32',
    pixelColor: [
      '........',
      '..OOO...',
      '.OOOOO..',
      '.OOOOOO.',
      '..OOOO..',
      '...OO...',
      '....O...',
      '....O...',
      '........',
    ],
  },
  corn: {
    id: 'corn',
    name: '玉米',
    cost: 12,
    damage: 8,
    growthTime: 4,
    speed: 6,
    color: '#FDD835',
    leafColor: '#388E3C',
    pixelColor: [
      '........',
      '..OOO...',
      '.OOOOO..',
      'OOOOOOOO',
      'OOOOOOOO',
      '.OOOOO..',
      '..OOO...',
      '...OO...',
      '........',
    ],
  },
  pumpkin: {
    id: 'pumpkin',
    name: '南瓜',
    cost: 15,
    damage: 5,
    growthTime: 7,
    speed: 2,
    color: '#F57C00',
    leafColor: '#1B5E20',
    pixelColor: [
      '........',
      '..OOO...',
      '.OOOOO..',
      'OOOOOOOO',
      'OOOOOOOO',
      'OOOOOOOO',
      '.OOOOO..',
      '..OOO...',
      '........',
    ],
  },
  garlic: {
    id: 'garlic',
    name: '大蒜',
    cost: 40,
    damage: 30,
    growthTime: 8,
    speed: 2.5,
    color: '#FAFAFA',
    leafColor: '#558B2F',
    pixelColor: [
      '........',
      '..OOO...',
      '.OOOOO..',
      'OOOOOOOO',
      '..OOOO..',
      '..OOOO..',
      '.OOOOO..',
      '..OOO...',
      '........',
    ],
  },
};

export const PLANT_ORDER = ['carrot', 'potato', 'pepper', 'corn', 'pumpkin', 'garlic'];
