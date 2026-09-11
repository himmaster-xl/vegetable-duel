export class Network {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.role = null;
    this.roomId = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${protocol}//${location.host}`);

      this.ws.onopen = () => resolve();
      this.ws.onclose = () => {
        console.warn('WebSocket 断开');
        this.ws = null;
      };
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (this.handlers[msg.type]) {
          this.handlers[msg.type].forEach(fn => fn(msg));
        }
      };
    });
  }

  on(type, fn) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(fn);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  join(name, roomId) {
    this.send({ type: 'join', name, roomId });
  }

  action(action, params) {
    this.send({ type: 'action', action, ...params });
  }

  buy(plantId) { this.action('buy', { plantId }); }
  plant(row, col, plantId) { this.action('plant', { row, col, plantId }); }
  harvest(row, col) { this.action('harvest', { row, col }); }
  fire(row, col, targetX, targetY) { this.action('fire', { row, col, targetX, targetY }); }
}
